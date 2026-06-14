"""
Feature engineering for FraudGraph ML scorer.

Spring publishes to transactions.raw with this schema:
  transaction_id  — UUID string
  source          — SHA-256 hash of source_account (Kafka key too)
  target          — SHA-256 hash of target_account
  amount          — BigDecimal → float
  timestamp       — ISO-8601 Instant e.g. "2026-06-13T10:00:00Z"
  received_at     — ISO-8601 Instant
  is_fraud_flag   — boolean

Features used by the RF model (must match training):
  amount      — raw transaction amount
  velocity    — how many txns this source sent in the last 60 seconds
  time_delta  — hours since source's previous transaction (0=burst, 1=normal gap)
  freq_ratio  — source total count / target total count (imbalance signal)
"""

import pandas as pd
import numpy as np
from datetime import datetime, timezone


def engineer_training_features(df: pd.DataFrame):
    """PaySim training features — unchanged."""
    velocity = df.groupby(['nameOrig', 'step']).size().reset_index(name='velocity')
    df = df.merge(velocity, on=['nameOrig', 'step'], how='left')

    sender_freq   = df['nameOrig'].value_counts().to_dict()
    receiver_freq = df['nameDest'].value_counts().to_dict()
    df['sender_freq']   = df['nameOrig'].map(sender_freq)
    df['receiver_freq'] = df['nameDest'].map(receiver_freq)
    df['freq_ratio']    = df['sender_freq'] / (df['receiver_freq'] + 1e-5)

    df = df.sort_values(by=['nameOrig', 'step'])
    df['time_delta'] = df.groupby('nameOrig')['step'].diff().fillna(0)

    return df[['amount', 'velocity', 'time_delta', 'freq_ratio']], df['isFraud']


def _parse_ts(ts_str) -> float:
    """Parse ISO-8601 timestamp → Unix epoch float. Returns 0.0 on failure."""
    if not ts_str:
        return 0.0
    try:
        s = str(ts_str).strip().replace('Z', '+00:00')
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0


def engineer_inference_features(transaction: dict, cache: dict) -> list:
    """
    Real-time feature extraction from a Spring Kafka message.

    Spring field names: source, target, amount, timestamp, received_at, is_fraud_flag
    """
    amount = float(transaction.get('amount') or 0.0)

    # Spring sends SHA-256 hashes as 'source'/'target'
    source = str(transaction.get('source') or transaction.get('source_account') or '')
    target = str(transaction.get('target') or transaction.get('target_account') or '')

    # Prefer 'received_at' (always set by Spring) over 'timestamp' (may be null if client omits it)
    ts_raw = transaction.get('received_at') or transaction.get('timestamp') or ''
    now_ts = _parse_ts(ts_raw)
    if now_ts == 0.0:
        now_ts = datetime.now(timezone.utc).timestamp()

    # ── per-account state ────────────────────────────────────────────────────
    def _init(acct):
        if acct not in cache:
            cache[acct] = {'count': 0, 'recent_ts': [], 'last_ts': None}

    _init(source)
    _init(target)

    src = cache[source]
    tgt = cache[target]

    # time_delta: hours since last tx from this source (0 = burst, 1 = normal 1-hr gap)
    if src['last_ts'] is not None:
        delta_secs = now_ts - src['last_ts']
        time_delta = min(delta_secs / 3600.0, 1.0)
    else:
        time_delta = 1.0

    # velocity: txns in last 60-second sliding window
    window = 60.0
    src['recent_ts'] = [t for t in src['recent_ts'] if now_ts - t <= window]
    src['recent_ts'].append(now_ts)
    velocity = float(len(src['recent_ts']))  # 1–N, matches training range

    # update state
    src['count']  += 1
    src['last_ts'] = now_ts
    tgt['count']  += 1

    # freq_ratio: sender dominance over receiver
    freq_ratio = float(src['count']) / (float(tgt['count']) + 1e-5)

    return [[amount, velocity, time_delta, freq_ratio]]
