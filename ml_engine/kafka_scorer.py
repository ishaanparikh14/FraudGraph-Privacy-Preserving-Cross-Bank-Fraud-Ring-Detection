"""
FraudGraph Kafka Scorer
=======================
Consumes transactions.raw  →  scores with RandomForest  →  writes transactions.scored
Stores every row in SQLite (scored_txns.db) for the XAI API.

Spring Kafka message schema (IngestedTransaction.java):
  transaction_id  UUID
  source          SHA-256(source_account)    ← Kafka key
  target          SHA-256(target_account)
  amount          number
  timestamp       ISO-8601 or null
  received_at     ISO-8601 (always set)
  is_fraud_flag   boolean
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lime
import lime.lime_tabular
import numpy as np
import shap
from kafka import KafkaConsumer, KafkaProducer

from features import engineer_inference_features
from txn_id_normalize import normalize_txn_id

# ── config ────────────────────────────────────────────────────────────────────
MODEL_PATH   = str(Path(__file__).parent / 'dp_rf_model.joblib')
DB_PATH      = str(Path(__file__).parent / 'scored_txns.db')

KAFKA_BROKERS         = [b.strip() for b in os.environ.get('KAFKA_BOOTSTRAP_SERVERS', 'localhost:29092').split(',') if b.strip()]
INPUT_TOPIC           = os.environ.get('KAFKA_TOPIC_RAW',    'transactions.raw')
OUTPUT_TOPIC          = os.environ.get('KAFKA_TOPIC_SCORED', 'transactions.scored')
THRESHOLD             = float(os.environ.get('SCORER_THRESHOLD',       '0.02'))   # low → more rows get SHAP
KAFKA_AUTO_OFFSET     = os.environ.get('KAFKA_AUTO_OFFSET_RESET',      'earliest')
KAFKA_GROUP_ID        = os.environ.get('KAFKA_CONSUMER_GROUP_ID',      'fraudgraph-scorer-v4')
DEBUG                 = os.environ.get('SCORER_DEBUG', '').lower() in ('1', 'true', 'yes')

FEATURE_NAMES    = ['amount', 'velocity', 'time_delta', 'freq_ratio']
FEATURE_LABELS   = {
    'amount':      'Transaction Amount',
    'velocity':    'Transaction Velocity (txns/60s)',
    'time_delta':  'Time Since Last Transaction (hrs)',
    'freq_ratio':  'Sender/Receiver Frequency Ratio',
}

# ── database ──────────────────────────────────────────────────────────────────

def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        CREATE TABLE IF NOT EXISTS explanations (
            txn_id        TEXT PRIMARY KEY,
            risk_score    REAL,
            is_high_risk  INTEGER,
            top_features  TEXT,
            shap_values   TEXT,
            lime_explanation TEXT,
            timestamp     TEXT,
            amount        REAL,
            source        TEXT,
            target        TEXT,
            raw_features  TEXT
        )
    ''')
    # migrate older DBs that lack new columns
    existing = {r[1] for r in conn.execute("PRAGMA table_info(explanations)").fetchall()}
    for col, typ in [('source','TEXT'),('target','TEXT'),('raw_features','TEXT')]:
        if col not in existing:
            try:
                conn.execute(f'ALTER TABLE explanations ADD COLUMN {col} {typ}')
            except Exception:
                pass
    conn.commit()
    conn.close()

def upsert(txn_id, risk_score, is_high_risk, top_features, shap_dict,
           lime_list, timestamp, amount, source, target, raw_features):
    conn = sqlite3.connect(DB_PATH)
    conn.execute('''
        INSERT OR REPLACE INTO explanations
          (txn_id, risk_score, is_high_risk, top_features, shap_values,
           lime_explanation, timestamp, amount, source, target, raw_features)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    ''', (
        txn_id, float(risk_score), int(is_high_risk),
        json.dumps(top_features), json.dumps(shap_dict), json.dumps(lime_list),
        timestamp, float(amount) if amount else None,
        source, target, json.dumps(raw_features),
    ))
    conn.commit()
    conn.close()

# ── helpers ───────────────────────────────────────────────────────────────────

def _ts_display(ts_raw: str) -> str:
    """Convert ISO-8601 or epoch string to human-readable UTC string."""
    if not ts_raw:
        return ''
    try:
        ts_float = float(ts_raw)
        return datetime.fromtimestamp(ts_float, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    except (ValueError, TypeError):
        pass
    try:
        s = str(ts_raw).replace('Z', '+00:00')
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime('%Y-%m-%d %H:%M:%S UTC')
    except Exception:
        return str(ts_raw)

def _ingest_high(tx: dict) -> bool:
    for k in ('is_fraud_flag', 'fraudFlag', 'is_high_risk', 'isHighRisk'):
        v = tx.get(k)
        if v is True:
            return True
        if isinstance(v, str) and v.lower() in ('true', '1', 'yes'):
            return True
    return False

# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print('Initializing DB...', flush=True)
    init_db()

    print(f'Loading model from {MODEL_PATH}...', flush=True)
    model = joblib.load(MODEL_PATH)

    print('Building SHAP TreeExplainer...', flush=True)
    bg = np.random.default_rng(42).random((200, 4)).astype(np.float64)
    shap_explainer = shap.TreeExplainer(model, data=bg, feature_perturbation='interventional')

    print('Building LIME explainer...', flush=True)
    lime_explainer = lime.lime_tabular.LimeTabularExplainer(
        bg, feature_names=FEATURE_NAMES,
        class_names=['Legit', 'Fraud'], mode='classification',
    )

    print(f'Connecting to Kafka {KAFKA_BROKERS}  group={KAFKA_GROUP_ID}  threshold={THRESHOLD}', flush=True)

    consumer = KafkaConsumer(
        INPUT_TOPIC,
        bootstrap_servers=KAFKA_BROKERS,
        group_id=KAFKA_GROUP_ID,
        auto_offset_reset=KAFKA_AUTO_OFFSET,
        enable_auto_commit=True,
        value_deserializer=lambda b: json.loads(b.decode('utf-8')) if b else None,
    )
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BROKERS,
        value_serializer=lambda m: json.dumps(m).encode('utf-8'),
    )

    print(f'Listening on {INPUT_TOPIC} ...', flush=True)
    cache = {}
    n_written = 0

    for msg in consumer:
        tx = msg.value
        if not isinstance(tx, dict):
            continue

        txn_id = normalize_txn_id(tx.get('transaction_id') or tx.get('transactionId'))
        if not txn_id:
            continue

        source  = tx.get('source', '')
        target  = tx.get('target', '')
        amount  = float(tx.get('amount') or 0.0)
        ts_raw  = tx.get('received_at') or tx.get('timestamp') or ''

        try:
            feats = engineer_inference_features(tx, cache)
        except Exception as e:
            print(f'[scorer] feature error {txn_id}: {e}', flush=True)
            continue

        X = np.array(feats, dtype=np.float64).reshape(1, -1)

        try:
            prob         = float(model.predict_proba(X)[0][1])
            forced_high  = _ingest_high(tx)
            model_high   = prob >= THRESHOLD
            is_high_risk = model_high or forced_high

            if DEBUG:
                print(f'[scorer] {txn_id}  p={prob:.4f}  forced={forced_high}  hi={is_high_risk}  feats={feats[0]}', flush=True)

            # ── SHAP — always ────────────────────────────────────────────────
            shap_dict      = {}
            top_features   = []
            lime_list      = []

            try:
                sv_raw = shap_explainer.shap_values(X)
                # binary RF → list of 2 arrays, shape (1, n_features) each
                if isinstance(sv_raw, list):
                    sv = np.array(sv_raw[1]).flatten()
                else:
                    sv = np.array(sv_raw).flatten()

                shap_dict = {FEATURE_LABELS[FEATURE_NAMES[i]]: float(sv[i]) for i in range(4)}
                top_features = [
                    {'name': k, 'value': v}
                    for k, v in sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)
                ]
            except Exception as e:
                print(f'[scorer] SHAP error {txn_id}: {e}', flush=True)

            # ── LIME — only for flagged ──────────────────────────────────────
            if is_high_risk:
                if model_high:
                    print(f'[ALERT] HIGH RISK  {txn_id}  score={prob:.4f}  amount={amount}', flush=True)
                try:
                    def _predict(x):
                        return model.predict_proba(np.array(x, dtype=np.float64))
                    exp = lime_explainer.explain_instance(X.flatten(), _predict, num_features=4)
                    lime_list = exp.as_list()
                except Exception as e:
                    print(f'[scorer] LIME error {txn_id}: {e}', flush=True)

            # ── persist ──────────────────────────────────────────────────────
            upsert(
                txn_id, prob, is_high_risk, top_features, shap_dict, lime_list,
                _ts_display(ts_raw), amount, source, target,
                {'amount': feats[0][0], 'velocity': feats[0][1],
                 'time_delta': feats[0][2], 'freq_ratio': feats[0][3]},
            )
            n_written += 1
            if n_written <= 3 or n_written % 50 == 0:
                print(f'[scorer] wrote row #{n_written}  txn_id={txn_id}  score={prob:.4f}', flush=True)

            # ── publish scored ────────────────────────────────────────────────
            out_score = max(prob, 0.95) if (forced_high and not model_high) else prob
            producer.send(OUTPUT_TOPIC, {
                'txn_id':       txn_id,
                'sender_id':    source,
                'receiver_id':  target,
                'amount':       amount,
                'timestamp':    ts_raw,
                'risk_score':   out_score,
                'is_high_risk': is_high_risk,
            })
            producer.flush()

        except Exception as e:
            print(f'[scorer] error {txn_id}: {e}', flush=True)


if __name__ == '__main__':
    main()
