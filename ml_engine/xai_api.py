"""
FraudGraph XAI API
==================
Serves ML explainability data from SQLite to the dashboard.
DB written by kafka_scorer.py.

Endpoints:
  GET  /health
  GET  /explain/recent
  POST /explain          — fetch stored result by txn_id
  POST /rescore          — re-run model + SHAP inline for any transaction payload
  POST /upload/analyze   — parse CSV/Excel/PDF, run Tarjan SCC + ML scoring
  GET  /upload/results   — list all past upload analyses
  GET  /upload/results/{upload_id} — fetch one analysis
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import shap as shap_lib

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional

from features import engineer_inference_features
from txn_id_normalize import normalize_txn_id

DB_PATH    = str(Path(__file__).resolve().parent / 'scored_txns.db')
MODEL_PATH = str(Path(__file__).resolve().parent / 'dp_rf_model.joblib')

FEATURE_NAMES  = ['amount', 'velocity', 'time_delta', 'freq_ratio']
FEATURE_LABELS = {
    'amount':     'Transaction Amount',
    'velocity':   'Transaction Velocity (txns/60s)',
    'time_delta': 'Time Since Last Transaction (hrs)',
    'freq_ratio': 'Sender/Receiver Frequency Ratio',
}

app = FastAPI(title='FraudGraph XAI API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
)

# ── lazy-load model + explainer once ─────────────────────────────────────────
_model         = None
_shap_explainer = None

def _get_model():
    global _model, _shap_explainer
    if _model is None:
        _model = joblib.load(MODEL_PATH)
        bg = np.random.default_rng(42).random((200, 4)).astype(np.float64)
        _shap_explainer = shap_lib.TreeExplainer(
            _model, data=bg, feature_perturbation='interventional'
        )
    return _model, _shap_explainer


# ── DB helpers ────────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_db():
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
    existing = {r[1] for r in conn.execute("PRAGMA table_info(explanations)").fetchall()}
    for col, typ in [('source', 'TEXT'), ('target', 'TEXT'), ('raw_features', 'TEXT')]:
        if col not in existing:
            try:
                conn.execute(f'ALTER TABLE explanations ADD COLUMN {col} {typ}')
            except Exception:
                pass
    # uploads table
    conn.execute('''
        CREATE TABLE IF NOT EXISTS uploads (
            upload_id   TEXT PRIMARY KEY,
            filename    TEXT,
            created_at  TEXT,
            summary     TEXT,
            result_json TEXT
        )
    ''')
    conn.commit()
    conn.close()


def _upsert(txn_id, risk_score, is_high_risk, top_features, shap_dict,
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


def _parse(s, default):
    if not s:
        return default
    try:
        return json.loads(s)
    except Exception:
        return default


def _format_result(row) -> dict:
    """Convert a DB row into the standard API response dict."""
    top_features     = _parse(row['top_features'],     [])
    shap_values      = _parse(row['shap_values'],      {})
    lime_explanation = _parse(row['lime_explanation'], [])
    raw_features     = _parse(row['raw_features'],     {})

    score = float(row['risk_score'] or 0)
    forced_high = bool(row['is_high_risk']) and score < 0.30

    if bool(row['is_high_risk']) and score >= 0.65:
        risk_label = 'HIGH RISK'
    elif bool(row['is_high_risk']) and score >= 0.30:
        risk_label = 'HIGH RISK'
    elif bool(row['is_high_risk']):
        risk_label = 'HIGH RISK (flagged)'
    elif score >= 0.65:
        risk_label = 'HIGH RISK'
    elif score >= 0.30:
        risk_label = 'MODERATE RISK'
    else:
        risk_label = 'LOW RISK'

    return {
        'txn_id':           row['txn_id'],
        'risk_score':       score,
        'is_high_risk':     bool(row['is_high_risk']),
        'forced_high':      forced_high,
        'risk_label':       risk_label,
        'top_features':     top_features,
        'shap_values':      shap_values,
        'lime_explanation': lime_explanation,
        'timestamp':        row['timestamp'] or None,
        'amount':           float(row['amount']) if row['amount'] is not None else None,
        'source':           row['source'] or None,
        'target':           row['target'] or None,
        'raw_features':     raw_features,
    }


# ── Pydantic models ───────────────────────────────────────────────────────────

class ExplainRequest(BaseModel):
    txn_id: str


class RescoreRequest(BaseModel):
    """
    Full transaction payload for on-demand rescoring.
    Mirrors Spring's IngestedTransaction Kafka message.
    """
    txn_id:         str
    transaction_id: Optional[str] = None
    source:         Optional[str] = None
    source_account: Optional[str] = None
    target:         Optional[str] = None
    target_account: Optional[str] = None
    amount:         Optional[float] = None
    timestamp:      Optional[str] = None
    received_at:    Optional[str] = None
    is_fraud_flag:  Optional[bool] = None
    is_high_risk:   Optional[bool] = None


# ── endpoints ─────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    try:
        conn = _db()
        count = conn.execute('SELECT COUNT(*) FROM explanations').fetchone()[0]
        conn.close()
    except Exception:
        count = -1
    return {'status': 'ok', 'service': 'fraudgraph-xai', 'explanations_count': count}


@app.get('/explain/recent')
def explain_recent(limit: int = 20):
    lim = max(1, min(100, int(limit)))
    conn = _db()
    rows = conn.execute(
        'SELECT txn_id, risk_score, timestamp, amount FROM explanations ORDER BY rowid DESC LIMIT ?',
        (lim,)
    ).fetchall()
    conn.close()
    return {
        'txn_ids': [r['txn_id'] for r in rows],
        'rows':    [dict(r) for r in rows],
        'count':   len(rows),
    }


@app.post('/explain')
def explain_transaction(req: ExplainRequest):
    txn_id = normalize_txn_id(req.txn_id)
    if not txn_id:
        raise HTTPException(400, detail={'available': False, 'message': 'txn_id is empty'})

    conn = _db()
    row = conn.execute(
        '''SELECT txn_id, risk_score, is_high_risk, top_features, shap_values,
                  lime_explanation, timestamp, amount, source, target, raw_features
           FROM explanations WHERE lower(trim(txn_id)) = ?''',
        (txn_id,)
    ).fetchone()
    conn.close()

    if row is None:
        raise HTTPException(404, detail={
            'available': False,
            'message': f'No row found for txn_id "{txn_id}". Use POST /rescore to score it on demand.',
        })

    return _format_result(row)


@app.post('/rescore')
def rescore_transaction(req: RescoreRequest):
    """
    Re-run the RF model + SHAP for a transaction on demand.
    Accepts any transaction payload (from stream, Spring API, or manual inject).
    Always overwrites the DB row with fresh scores.
    Returns the full explain response immediately.
    """
    txn_id = normalize_txn_id(req.txn_id or req.transaction_id or '')
    if not txn_id:
        raise HTTPException(400, detail='txn_id is required')

    model, shap_explainer = _get_model()

    # Build a dict the feature engineer understands
    source = req.source or req.source_account or ''
    target = req.target or req.target_account or ''
    amount = float(req.amount or 0.0)
    ts_raw = req.received_at or req.timestamp or ''

    tx_dict = {
        'transaction_id': txn_id,
        'source':         source,
        'target':         target,
        'amount':         amount,
        'received_at':    ts_raw or datetime.now(timezone.utc).isoformat(),
        'timestamp':      ts_raw,
        'is_fraud_flag':  req.is_fraud_flag or req.is_high_risk or False,
    }

    # Feature engineering (fresh cache per rescore — velocity/time_delta will be 1.0/1.0
    # for isolated lookups, which is honest: we don't have the account history)
    cache: dict = {}
    try:
        feats = engineer_inference_features(tx_dict, cache)
    except Exception as e:
        raise HTTPException(500, detail=f'Feature engineering failed: {e}')

    X = np.array(feats, dtype=np.float64).reshape(1, -1)

    # Model score
    prob        = float(model.predict_proba(X)[0][1])
    forced_high = bool(req.is_fraud_flag or req.is_high_risk or False)
    is_high_risk = prob >= 0.30 or forced_high

    # SHAP — always
    shap_dict    = {}
    top_features = []
    try:
        sv_raw = shap_explainer.shap_values(X)
        sv = np.array(sv_raw[1] if isinstance(sv_raw, list) else sv_raw).flatten()
        shap_dict = {FEATURE_LABELS[FEATURE_NAMES[i]]: float(sv[i]) for i in range(4)}
        top_features = [
            {'name': k, 'value': v}
            for k, v in sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)
        ]
    except Exception as e:
        print(f'[rescore] SHAP error {txn_id}: {e}', flush=True)

    # Timestamp display
    def _ts_display(s):
        if not s:
            return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        try:
            ts = float(s)
            return datetime.fromtimestamp(ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        except (ValueError, TypeError):
            pass
        try:
            cleaned = str(s).replace('Z', '+00:00')
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.strftime('%Y-%m-%d %H:%M:%S UTC')
        except Exception:
            return str(s)

    timestamp_display = _ts_display(ts_raw)
    raw_features = {
        'amount':     feats[0][0],
        'velocity':   feats[0][1],
        'time_delta': feats[0][2],
        'freq_ratio': feats[0][3],
    }

    _upsert(
        txn_id, prob, is_high_risk, top_features, shap_dict, [],
        timestamp_display, amount, source, target, raw_features,
    )

    score = prob
    if forced_high and score >= 0.65:
        risk_label = 'HIGH RISK'
    elif forced_high and score >= 0.30:
        risk_label = 'HIGH RISK'
    elif forced_high:
        risk_label = 'HIGH RISK (flagged)'
    elif score >= 0.65:
        risk_label = 'HIGH RISK'
    elif score >= 0.30:
        risk_label = 'MODERATE RISK'
    else:
        risk_label = 'LOW RISK'

    return {
        'txn_id':           txn_id,
        'risk_score':       score,
        'is_high_risk':     is_high_risk,
        'forced_high':      forced_high,
        'risk_label':       risk_label,
        'top_features':     top_features,
        'shap_values':      shap_dict,
        'lime_explanation': [],
        'timestamp':        timestamp_display,
        'amount':           amount,
        'source':           source,
        'target':           target,
        'raw_features':     raw_features,
    }



# ── upload / analyze endpoints ────────────────────────────────────────────────

@app.post('/upload/analyze')
async def upload_analyze(
    file: UploadFile = File(...),
    col_sender:    str = Form(''),
    col_receiver:  str = Form(''),
    col_amount:    str = Form(''),
    col_timestamp: str = Form(''),
    col_txn_id:    str = Form(''),
):
    """Accept CSV, Excel or PDF. Parse, run Tarjan SCC + ML scoring, store & return."""
    from upload_analyzer import analyze, detect_columns, parse_csv, parse_excel, parse_pdf

    filename = file.filename or 'upload'
    data = await file.read()
    ext  = filename.rsplit('.', 1)[-1].lower()

    try:
        if ext == 'csv':
            df = parse_csv(data)
        elif ext in ('xlsx', 'xls'):
            df = parse_excel(data)
        elif ext == 'pdf':
            df = parse_pdf(data)
        else:
            raise HTTPException(400, detail=f'Unsupported file type: {ext}. Use CSV, Excel, or PDF.')
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        detail = str(e) or repr(e) or traceback.format_exc().strip().splitlines()[-1]
        print(f'[upload] parse error ({ext}): {traceback.format_exc()}', flush=True)
        raise HTTPException(400, detail=f'File parse error ({ext}): {detail}')

    auto = detect_columns(df)
    col_map = {
        'sender':    col_sender    or auto.get('sender')    or '',
        'receiver':  col_receiver  or auto.get('receiver')  or '',
        'amount':    col_amount    or auto.get('amount')    or '',
        'timestamp': col_timestamp or auto.get('timestamp') or '',
        'txn_id':    col_txn_id    or auto.get('txn_id')    or '',
    }

    if not col_map['sender'] or not col_map['receiver']:
        return {
            'status': 'needs_mapping',
            'columns': list(df.columns),
            'sample_rows': df.head(3).fillna('').to_dict(orient='records'),
            'auto_detected': auto,
            'message': 'Could not auto-detect sender/receiver columns. Please provide col_sender and col_receiver.',
        }

    model, shap_explainer = _get_model()

    try:
        result = analyze(df, col_map, model, shap_explainer, FEATURE_LABELS, FEATURE_NAMES)
    except ValueError as e:
        raise HTTPException(422, detail=str(e))
    except Exception as e:
        import traceback
        print(f'[upload] analyze error: {traceback.format_exc()}', flush=True)
        raise HTTPException(500, detail=f'Analysis error: {repr(e)}')

    summary = {
        'filename': filename, 'total_txns': result['total_txns'],
        'flagged_txns': result['flagged_txns'], 'ring_count': result['ring_count'],
        'avg_risk_score': result['avg_risk_score'],
    }
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        'INSERT OR REPLACE INTO uploads (upload_id, filename, created_at, summary, result_json) VALUES (?,?,?,?,?)',
        (result['upload_id'], filename, result['created_at'], json.dumps(summary), json.dumps(result))
    )
    conn.commit()
    conn.close()
    return result


@app.get('/upload/results')
def list_uploads():
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        'SELECT upload_id, filename, created_at, summary FROM uploads ORDER BY created_at DESC LIMIT 50'
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        s = json.loads(r['summary']) if r['summary'] else {}
        out.append({'upload_id': r['upload_id'], 'filename': r['filename'], 'created_at': r['created_at'], **s})
    return {'uploads': out, 'count': len(out)}


@app.get('/upload/results/{upload_id}')
def get_upload_result(upload_id: str):
    _ensure_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute('SELECT result_json FROM uploads WHERE upload_id = ?', (upload_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, detail=f'Upload {upload_id} not found')
    return json.loads(row['result_json'])

if __name__ == '__main__':
    import os
    import uvicorn

    _ensure_db()
    try:
        conn = _db()
        n = conn.execute('SELECT COUNT(*) FROM explanations').fetchone()[0]
        conn.close()
        print(f'[xai_api] DB: {DB_PATH} ({n} rows)', flush=True)
    except Exception as e:
        print(f'[xai_api] DB not ready yet: {e}', flush=True)

    port = int(os.environ.get('XAI_PORT', 8081))
    uvicorn.run(app, host='0.0.0.0', port=port)
