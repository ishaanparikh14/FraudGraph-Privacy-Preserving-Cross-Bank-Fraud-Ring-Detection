"""
FraudGraph Upload Analyzer
==========================
Parses uploaded bank statements (CSV, Excel, PDF) and runs:
  1. Tarjan's SCC to find fraud rings
  2. ML scoring + SHAP on each transaction

Supports flexible column name mapping.
"""

import io
import json
import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

# ── Tarjan SCC ────────────────────────────────────────────────────────────────

class TarjanSCC:
    """Iterative Tarjan's Strongly Connected Components."""

    def __init__(self, graph: dict[str, list[str]]):
        self.graph  = graph
        self.index_counter = [0]
        self.stack  = []
        self.lowlink: dict[str, int] = {}
        self.index:   dict[str, int] = {}
        self.on_stack: dict[str, bool] = {}
        self.sccs: list[list[str]] = []

    def run(self) -> list[list[str]]:
        for node in self.graph:
            if node not in self.index:
                self._strongconnect(node)
        return [scc for scc in self.sccs if len(scc) > 1]  # only real rings

    def _strongconnect(self, start: str):
        # Iterative version to avoid Python recursion limit
        call_stack = [(start, iter(self.graph.get(start, [])))]
        self.index[start]   = self.lowlink[start] = self.index_counter[0]
        self.index_counter[0] += 1
        self.stack.append(start)
        self.on_stack[start] = True

        while call_stack:
            node, children = call_stack[-1]
            try:
                child = next(children)
                if child not in self.index:
                    self.index[child]   = self.lowlink[child] = self.index_counter[0]
                    self.index_counter[0] += 1
                    self.stack.append(child)
                    self.on_stack[child] = True
                    call_stack.append((child, iter(self.graph.get(child, []))))
                elif self.on_stack.get(child, False):
                    self.lowlink[node] = min(self.lowlink[node], self.index[child])
            except StopIteration:
                call_stack.pop()
                if call_stack:
                    parent = call_stack[-1][0]
                    self.lowlink[parent] = min(self.lowlink[parent], self.lowlink[node])
                if self.lowlink[node] == self.index[node]:
                    scc = []
                    while True:
                        w = self.stack.pop()
                        self.on_stack[w] = False
                        scc.append(w)
                        if w == node:
                            break
                    self.sccs.append(scc)


# ── file parsing ──────────────────────────────────────────────────────────────

def _clean_cols(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [str(c).strip().lower().replace(' ', '_') for c in df.columns]
    return df


def parse_csv(data: bytes) -> pd.DataFrame:
    return _clean_cols(pd.read_csv(io.BytesIO(data)))


def parse_excel(data: bytes) -> pd.DataFrame:
    return _clean_cols(pd.read_excel(io.BytesIO(data)))


def parse_pdf(data: bytes) -> pd.DataFrame:
    import pdfplumber
    from groq import Groq
    
    text_content = ""
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_content += text + "\n"

    if not text_content.strip():
        raise ValueError("Could not extract any text from the PDF.")

    import os
    api_key = os.environ.get("GROQ_API_KEY", "")
    client = Groq(api_key=api_key)

    prompt = f"""
Extract all transactions from the following bank statement text.
If the statement is for a single account owner, infer who sent money to whom based on the amount (Credit/Debit or positive/negative).
If money is going out (Debit / negative), sender is 'Owner Account', receiver is the description/counterparty.
If money is coming in (Credit / positive), sender is the description/counterparty, receiver is 'Owner Account'.
Return the result STRICTLY as a JSON object with a single key "transactions" which contains an array of objects.
Each transaction object must have exactly these keys:
- "sender": string
- "receiver": string
- "amount": float (always positive)
- "timestamp": string (format: YYYY-MM-DD or the exact date found)
- "txn_id": string (extract if present, otherwise generate a unique string like 'txn-1', 'txn-2')

Text:
{text_content}
"""
    chat_completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.3-70b-versatile",
        temperature=0.0,
        response_format={"type": "json_object"},
    )
    response_text = chat_completion.choices[0].message.content.strip()
    
    try:
        data_obj = json.loads(response_text)
        txns = data_obj.get("transactions", [])
        currency = data_obj.get("currency_symbol", "")
        if not isinstance(txns, list):
            raise ValueError("LLM did not return a 'transactions' list")
    except Exception as e:
        print(f"Failed to parse LLM response: {response_text}")
        raise ValueError(f"Failed to extract transactions with LLM: {e}")
        
    df = pd.DataFrame(txns)
    if currency:
        df['currency_symbol'] = currency
    return _clean_cols(df)


def detect_columns(df: pd.DataFrame) -> dict:
    """
    Auto-detect which columns map to sender, receiver, amount, timestamp.
    Returns best-guess mapping; frontend can override.
    """
    cols = list(df.columns)

    def _find(patterns):
        for p in patterns:
            for c in cols:
                if re.search(p, c, re.I):
                    return c
        return None

    return {
        'sender':    _find([r'from|sender|source|originator|debit|payer|account_?from']),
        'receiver':  _find([r'to|receiver|target|beneficiary|credit|payee|account_?to']),
        'amount':    _find([r'amount|sum|value|debit|credit|txn_?amount']),
        'timestamp': _find([r'date|time|timestamp|when']),
        'txn_id':    _find([r'id|ref|transaction_?id|txn_?id|reference']),
    }


# ── main analysis ─────────────────────────────────────────────────────────────

def analyze(
    df: pd.DataFrame,
    col_map: dict,          # {'sender': col, 'receiver': col, 'amount': col, ...}
    model,
    shap_explainer,
    feature_labels: dict,
    feature_names: list,
) -> dict:
    """
    Full analysis pipeline:
      1. Normalize rows → transactions
      2. Build directed graph
      3. Tarjan SCC → rings
      4. ML score every transaction
      5. Return structured result
    """
    upload_id  = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()

    sender_col    = col_map.get('sender')
    receiver_col  = col_map.get('receiver')
    amount_col    = col_map.get('amount')
    timestamp_col = col_map.get('timestamp')
    txn_id_col    = col_map.get('txn_id')

    if not sender_col or not receiver_col:
        raise ValueError('sender and receiver columns are required')

    # ── build transaction list ──
    txns = []
    for i, row in df.iterrows():
        sender   = str(row.get(sender_col, '')).strip()
        receiver = str(row.get(receiver_col, '')).strip()
        if not sender or not receiver or sender == 'nan' or receiver == 'nan':
            continue

        amount = 0.0
        if amount_col:
            try:
                raw_amt = str(row.get(amount_col, '0')).replace(',', '').replace('$', '').replace('£', '').strip()
                amount  = float(raw_amt) if raw_amt else 0.0
            except (ValueError, TypeError):
                amount = 0.0

        ts = ''
        if timestamp_col:
            ts = str(row.get(timestamp_col, '')).strip()

        txn_id = str(row.get(txn_id_col, '')) if txn_id_col else f'upload-{upload_id[:8]}-{i}'
        if not txn_id or txn_id == 'nan':
            txn_id = f'upload-{upload_id[:8]}-{i}'

        txns.append({
            'txn_id':   txn_id,
            'sender':   sender,
            'receiver': receiver,
            'amount':   amount,
            'timestamp': ts,
        })

    if not txns:
        raise ValueError('No valid transactions found after parsing. Check column mapping.')

    # ── build directed graph ──
    graph: dict[str, list[str]] = defaultdict(list)
    for t in txns:
        graph[t['sender']].append(t['receiver'])
        if t['receiver'] not in graph:
            graph[t['receiver']] = []

    # ── Tarjan SCC ──
    tarjan = TarjanSCC(dict(graph))
    raw_rings = tarjan.run()

    rings = []
    for idx, ring_accounts in enumerate(raw_rings):
        ring_set = set(ring_accounts)
        ring_txns = [t for t in txns if t['sender'] in ring_set or t['receiver'] in ring_set]
        rings.append({
            'ring_id':   f'RING_{idx+1:03d}',
            'accounts':  ring_accounts,
            'txn_count': len(ring_txns),
            'txn_ids':   [t['txn_id'] for t in ring_txns],
            'total_amount': sum(t['amount'] for t in ring_txns),
        })

    ring_account_set = {a for r in rings for a in r['accounts']}

    # ── ML scoring ──
    from features import engineer_inference_features

    scored_txns = []
    cache: dict = {}

    for t in txns:
        tx_dict = {
            'source':      t['sender'],
            'target':      t['receiver'],
            'amount':      t['amount'],
            'received_at': t['timestamp'] or datetime.now(timezone.utc).isoformat(),
            'timestamp':   t['timestamp'],
        }
        try:
            feats = engineer_inference_features(tx_dict, cache)
            X     = np.array(feats, dtype=np.float64).reshape(1, -1)
            prob  = float(model.predict_proba(X)[0][1])

            shap_dict = {}
            try:
                sv_raw = shap_explainer.shap_values(X)
                sv = np.array(sv_raw[1] if isinstance(sv_raw, list) else sv_raw).flatten()
                shap_dict = {feature_labels[feature_names[i]]: float(sv[i]) for i in range(4)}
            except Exception:
                pass

            in_ring = t['sender'] in ring_account_set or t['receiver'] in ring_account_set

            scored_txns.append({
                **t,
                'risk_score':  round(prob, 4),
                'is_high_risk': prob >= 0.30 or in_ring,
                'in_ring':     in_ring,
                'shap':        shap_dict,
            })
        except Exception as e:
            scored_txns.append({**t, 'risk_score': 0.0, 'is_high_risk': False, 'in_ring': False, 'shap': {}, 'error': str(e)})

    # ── summary stats ──
    total   = len(scored_txns)
    flagged = sum(1 for t in scored_txns if t['is_high_risk'])
    in_ring = sum(1 for t in scored_txns if t['in_ring'])
    avg_score = round(sum(t['risk_score'] for t in scored_txns) / max(total, 1), 4)

    currency_symbol = ''
    if 'currency_symbol' in df.columns and not df.empty:
        c = df['currency_symbol'].iloc[0]
        if c: currency_symbol = str(c)
        
    if not currency_symbol and amount_col:
        for _, row in df.head(50).iterrows():
            raw_amt = str(row.get(amount_col, '')).strip()
            m = re.search(r'^([^\d\.,\- ]+)', raw_amt)
            if m:
                currency_symbol = m.group(1).strip()
                break

    if not currency_symbol:
        currency_symbol = '$'

    return {
        'upload_id':    upload_id,
        'created_at':   created_at,
        'total_txns':   total,
        'flagged_txns': flagged,
        'ring_count':   len(rings),
        'avg_risk_score': avg_score,
        'rings':          rings,
        'transactions':   scored_txns,
        'columns_used':   col_map,
        'currency_symbol': currency_symbol,
    }
