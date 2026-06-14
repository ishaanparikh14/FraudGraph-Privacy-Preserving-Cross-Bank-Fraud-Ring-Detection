import argparse
import math
import random
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List

import requests
from faker import Faker


fake = Faker()


def percentile(sorted_values: List[float], value: float) -> float:
    if not sorted_values:
        return 0.0
    position = (len(sorted_values) - 1) * (value / 100.0)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[int(position)]
    lower_value = sorted_values[lower]
    upper_value = sorted_values[upper]
    return lower_value + (upper_value - lower_value) * (position - lower)


def make_payload(accounts: List[str]) -> Dict[str, object]:
    source = random.choice(accounts)
    target = random.choice(accounts)
    while source == target:
        target = random.choice(accounts)
    return {
        "source_account": source,
        "target_account": target,
        "amount": round(random.uniform(10.0, 1500.0), 2),
    }


def post_transaction(url: str, accounts: List[str], timeout: float) -> Dict[str, object]:
    payload = make_payload(accounts)
    started = time.perf_counter()
    try:
        response = requests.post(url, json=payload, timeout=timeout)
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {"status_code": response.status_code, "latency_ms": elapsed_ms, "ok": response.ok}
    except requests.exceptions.RequestException:
        elapsed_ms = (time.perf_counter() - started) * 1000
        return {"status_code": None, "latency_ms": elapsed_ms, "ok": False}


def main():
    parser = argparse.ArgumentParser(description="FraudGraph Person 1 concurrency test")
    parser.add_argument("--url", default="http://localhost:8080/transaction")
    parser.add_argument("--requests", type=int, default=1000)
    parser.add_argument("--concurrency", type=int, default=500)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--accounts", type=int, default=200)
    args = parser.parse_args()

    accounts = [fake.name() for _ in range(args.accounts)]
    started = time.perf_counter()
    results: List[Dict[str, object]] = []

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(post_transaction, args.url, accounts, args.timeout)
            for _ in range(args.requests)
        ]
        for future in as_completed(futures):
            results.append(future.result())

    elapsed_seconds = time.perf_counter() - started
    latencies = sorted(float(result["latency_ms"]) for result in results)
    successes = sum(1 for result in results if result["ok"])
    failures = len(results) - successes
    throughput = len(results) / elapsed_seconds if elapsed_seconds else 0.0

    print("FraudGraph concurrency test results")
    print(f"URL: {args.url}")
    print(f"Requests: {len(results)}")
    print(f"Concurrency: {args.concurrency}")
    print(f"Successes: {successes}")
    print(f"Failures: {failures}")
    print(f"Elapsed: {elapsed_seconds:.2f} s")
    print(f"Throughput: {throughput:.2f} requests/s")
    print(f"Latency p50: {percentile(latencies, 50):.2f} ms")
    print(f"Latency p95: {percentile(latencies, 95):.2f} ms")
    print(f"Latency p99: {percentile(latencies, 99):.2f} ms")
    print(f"Latency mean: {statistics.mean(latencies):.2f} ms")


if __name__ == "__main__":
    main()
