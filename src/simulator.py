import hashlib
import json
import os
import random
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict, List, Optional

import requests  # type: ignore
from faker import Faker  # type: ignore

fake = Faker()

API_URL = os.getenv("FRAUDGRAPH_API_URL", "http://localhost:8080/transaction")
TX_PER_SECOND = float(os.getenv("TX_PER_SECOND", "5"))
FRAUD_INTERVAL_SECONDS = float(os.getenv("FRAUD_INTERVAL_SECONDS", "30"))
# Seconds after /start before the first synthetic ring (then FRAUD_INTERVAL_SECONDS between rings).
FIRST_RING_DELAY_SECONDS = float(os.getenv("FIRST_RING_DELAY_SECONDS", "2"))
NUM_ACCOUNTS = int(os.getenv("NUM_ACCOUNTS", "50"))
POST_RING_ALERT = os.getenv("POST_RING_ALERT", "1").lower() in ("1", "true", "yes")

# 0 = idle until POST /start (dashboard "Start live injection"). 1 = legacy immediate loop.
SIMULATOR_AUTO_START = os.getenv("SIMULATOR_AUTO_START", "0").lower() in ("1", "true", "yes")
SIMULATOR_CONTROL_PORT = int(os.getenv("SIMULATOR_CONTROL_PORT", "8095"))

accounts = [fake.name() for _ in range(NUM_ACCOUNTS)]
injection_enabled = threading.Event()
if SIMULATOR_AUTO_START:
    injection_enabled.set()


def send_transaction(source: str, target: str, amount: float) -> Dict[str, object]:
    payload = {
        "source_account": source,
        "target_account": target,
        "amount": round(amount, 2),
    }

    started = time.perf_counter()
    try:
        response = requests.post(API_URL, json=payload, timeout=5)
        latency_ms = (time.perf_counter() - started) * 1000
        txn_id: Optional[str] = None
        if response.ok:
            try:
                body = response.json()
                tid = body.get("transaction_id")
                if tid is None and isinstance(body.get("data"), dict):
                    tid = body["data"].get("transaction_id")
                if isinstance(tid, str) and tid.strip():
                    txn_id = tid.strip()
            except (ValueError, TypeError, KeyError):
                pass
        print(
            f"Sent: {source} -> {target} | ${amount:.2f} | "
            f"Status: {response.status_code} | {latency_ms:.1f} ms"
        )
        return {
            "ok": response.ok,
            "status_code": response.status_code,
            "latency_ms": latency_ms,
            "transaction_id": txn_id,
        }
    except requests.exceptions.RequestException as exc:
        print(f"[WARN] Failed to reach API at {API_URL}: {exc}")
        return {"ok": False, "status_code": None, "latency_ms": None, "transaction_id": None}


def choose_distinct_accounts():
    source = random.choice(accounts)
    target = random.choice(accounts)
    while source == target:
        target = random.choice(accounts)
    return source, target


def ingestion_api_base() -> str:
    u = API_URL.rstrip("/")
    if u.endswith("/transaction"):
        return u[: -len("/transaction")]
    return u.rsplit("/", 1)[0]


def sha256_utf8_hex(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def post_fraud_ring_alert(
    ring_accounts: List[str], total_amount: float, edge_transaction_ids: List[str]
) -> None:
    url = f"{ingestion_api_base()}/alerts/fraud-ring"
    cycle_hashes = [sha256_utf8_hex(a) for a in ring_accounts]
    payload = {
        "cycle_accounts": cycle_hashes,
        "back_edge_source": cycle_hashes[-1],
        "back_edge_target": cycle_hashes[0],
        "edge_ids": [x for x in edge_transaction_ids if x],
        "total_amount": round(total_amount, 2),
        "severity": "high",
        "reason": "Synthetic closed cycle for demo (hashed like ingest); production rings use same Tarjan SCC pipeline.",
        "source": "simulator",
        # Align wire label with graph-engine / dashboard (Tarjan SCC); source=simulator marks synthetic traffic.
        "detection_method": "tarjan_scc",
    }
    try:
        response = requests.post(url, json=payload, timeout=5)
        if response.ok:
            print(f"[+] POST /alerts/fraud-ring -> {response.status_code}")
        else:
            print(f"[WARN] POST /alerts/fraud-ring failed: {response.status_code} {response.text[:240]}")
    except requests.exceptions.RequestException as exc:
        print(f"[WARN] POST /alerts/fraud-ring error: {exc}")


def simulate_normal_transaction():
    source, target = choose_distinct_accounts()
    amount = random.uniform(10.0, 1500.0)
    send_transaction(source, target, amount)


def simulate_fraud_ring():
    print("\n[!] INJECTING FRAUD RING CYCLE [!]")
    ring_size = random.randint(3, 5)
    ring_accounts = random.sample(accounts, ring_size)
    base_amount = random.uniform(5000.0, 10000.0)
    total_volume = 0.0
    edge_ids: List[str] = []

    ok_hops = 0
    for index in range(ring_size):
        source = ring_accounts[index]
        target = ring_accounts[(index + 1) % ring_size]
        hop_amount = base_amount * random.uniform(0.95, 1.05)
        total_volume += hop_amount
        r = send_transaction(source, target, hop_amount)
        if r.get("ok"):
            ok_hops += 1
        tid = r.get("transaction_id")
        if isinstance(tid, str) and tid:
            edge_ids.append(tid)
        time.sleep(0.1)

    if ok_hops == 0:
        print(
            "\n[ERROR] Simulator: 0/{} ring hops reached Spring. "
            "Set FRAUDGRAPH_API_URL to a reachable ingest URL, e.g.\n"
            "  FRAUDGRAPH_API_URL=http://127.0.0.1:8080/transaction\n"
            "(Docker: host port 8080 must be published; do not use localhost from inside another container "
            "unless that container can reach the API.)\n",
            flush=True,
        )
    elif ok_hops < ring_size:
        print(
            f"[WARN] Simulator: only {ok_hops}/{ring_size} ring hops succeeded — "
            "partial ring; check API_URL / network.",
            flush=True,
        )

    if POST_RING_ALERT:
        post_fraud_ring_alert(ring_accounts, total_volume, edge_ids)

    print("[!] FRAUD RING COMPLETE [!]\n")


def _control_json(handler: BaseHTTPRequestHandler, code: int, obj: dict) -> None:
    body = json.dumps(obj).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


class _ControlHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        print(f"[simulator-control] {fmt % args}", flush=True)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path in ("/status", "/", ""):
            _control_json(
                self,
                200,
                {
                    "enabled": injection_enabled.is_set(),
                    "auto_start": SIMULATOR_AUTO_START,
                    "tx_per_second": TX_PER_SECOND,
                    "fraud_interval_seconds": FRAUD_INTERVAL_SECONDS,
                },
            )
        else:
            self.send_error(404)

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/start":
            injection_enabled.set()
            _control_json(
                self,
                200,
                {"status": "started", "message": "Live injection running (random tx + periodic fraud ring)."},
            )
        elif path == "/stop":
            injection_enabled.clear()
            _control_json(self, 200, {"status": "stopped", "message": "Live injection paused (idle)."})
        else:
            self.send_error(404)


def _run_control_server() -> None:
    server = HTTPServer(("0.0.0.0", SIMULATOR_CONTROL_PORT), _ControlHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True, name="simulator-control")
    t.start()
    print(
        f"[simulator-control] listening on 0.0.0.0:{SIMULATOR_CONTROL_PORT} "
        f"(POST /start, POST /stop, GET /status)",
        flush=True,
    )


def main() -> None:
    tx_interval = (1.0 / TX_PER_SECOND) if TX_PER_SECOND > 0 else float("inf")

    print("FraudGraph transaction simulator")
    print(f"  API URL: {API_URL}")
    print(f"  TX_PER_SECOND: {TX_PER_SECOND} (0 = only periodic fraud rings, no random noise)")
    print(f"  FRAUD_INTERVAL_SECONDS: {FRAUD_INTERVAL_SECONDS}")
    print(f"  POST_RING_ALERT: {POST_RING_ALERT}")
    print(f"  SIMULATOR_AUTO_START: {SIMULATOR_AUTO_START}")

    # Control server always runs so dashboard can manage state
    _run_control_server()
    
    if not SIMULATOR_AUTO_START:
        print(
            "\n  IDLE by default — no traffic until you POST /start.\n"
            f"  From dashboard: Start live injection (proxies to :{SIMULATOR_CONTROL_PORT}).\n"
            "  Or: curl -s -X POST http://127.0.0.1:8095/start\n"
            "  Manual path: POST /transaction yourself (Postman, dashboard Inject fraud ring, graph-engine test data);\n"
            "  graph-engine Tarjan then detects SCC cycles on ML-scored Kafka edges.\n",
            flush=True,
        )
    else:
        print("\n  SIMULATOR_AUTO_START=1 — traffic begins immediately.\n", flush=True)

    try:
        while True:
            while not injection_enabled.is_set():
                time.sleep(0.2)

            print("[demo] live injection ON", flush=True)
            # First ring soon so demos are not silent for a full FRAUD_INTERVAL after /start.
            next_fraud_at = time.monotonic() + max(0.5, FIRST_RING_DELAY_SECONDS)
            next_transaction_at = time.monotonic()
            print(
                f"[demo] first synthetic ring in ~{max(0.5, FIRST_RING_DELAY_SECONDS):.0f}s, "
                f"then every {FRAUD_INTERVAL_SECONDS:.0f}s (set FIRST_RING_DELAY_SECONDS / FRAUD_INTERVAL_SECONDS)",
                flush=True,
            )

            while injection_enabled.is_set():
                now = time.monotonic()
                if now >= next_fraud_at:
                    simulate_fraud_ring()
                    next_fraud_at = time.monotonic() + max(1.0, FRAUD_INTERVAL_SECONDS)

                if TX_PER_SECOND > 0 and now >= next_transaction_at:
                    simulate_normal_transaction()
                    next_transaction_at = time.monotonic() + tx_interval

                if TX_PER_SECOND > 0:
                    sleep_for = min(next_transaction_at, next_fraud_at) - time.monotonic()
                else:
                    sleep_for = next_fraud_at - time.monotonic()
                if sleep_for > 0:
                    time.sleep(min(sleep_for, 0.05))

            print("[demo] live injection OFF (idle)", flush=True)
    except KeyboardInterrupt:
        print("\nSimulator stopped.")


if __name__ == "__main__":
    main()
