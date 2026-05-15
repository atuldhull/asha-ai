"""Light async load smoke for /triage when k6/hey aren't installed.

Tier 6.2-B prep gate per [docs/PROMPTS_PLAN_6.2.md]: 100 RPS for 60s
against localhost; p95 ≤ 800ms; error rate < 1%.

Usage:
    .venv\\Scripts\\python.exe -m scripts.load_smoke \\
        --api http://127.0.0.1:8000 --rps 100 --duration 60
"""
from __future__ import annotations

import argparse
import asyncio
import random
import time
from statistics import median

import httpx

PAYLOADS = [
    {"symptoms": "runny nose mild cough 2 days", "age": 30, "sex": "F"},
    {"symptoms": "mild headache for 3 hours", "age": 28, "sex": "M"},
    {"symptoms": "sore throat and low fever since yesterday", "age": 22, "sex": "F"},
    {"symptoms": "persistent cough 8 days, no fever", "age": 45, "sex": "M"},
    {"symptoms": "diarrhea 3 times today, mild", "age": 35, "sex": "F"},
    {"symptoms": "chest pain radiating to left arm with sweating",
     "age": 60, "sex": "M", "history": "diabetes, hypertension"},
]


async def _hit(client: httpx.AsyncClient, api: str, payload: dict) -> tuple[int, float]:
    t0 = time.perf_counter()
    try:
        r = await client.post(
            f"{api}/api/v1/triage", json=payload, timeout=15.0,
        )
        return r.status_code, (time.perf_counter() - t0) * 1000
    except (httpx.HTTPError, asyncio.TimeoutError):
        return 0, (time.perf_counter() - t0) * 1000


async def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--api", default="http://127.0.0.1:8000")
    p.add_argument("--rps", type=int, default=100)
    p.add_argument("--duration", type=int, default=60)
    args = p.parse_args()

    total_requests = args.rps * args.duration
    interval = 1.0 / args.rps
    latencies_ms: list[float] = []
    statuses: list[int] = []
    sem = asyncio.Semaphore(args.rps * 2)  # cap in-flight at 2× RPS

    async with httpx.AsyncClient(limits=httpx.Limits(
        max_keepalive_connections=200, max_connections=400,
    )) as client:
        async def _send(payload):
            async with sem:
                status, latency = await _hit(client, args.api, payload)
                statuses.append(status)
                latencies_ms.append(latency)

        start = time.perf_counter()
        tasks: list[asyncio.Task] = []
        for i in range(total_requests):
            tasks.append(asyncio.create_task(_send(random.choice(PAYLOADS))))
            await asyncio.sleep(interval)
        elapsed_dispatch = time.perf_counter() - start
        await asyncio.gather(*tasks)
        elapsed_total = time.perf_counter() - start

    success = sum(1 for s in statuses if 200 <= s < 300)
    errors = len(statuses) - success
    error_rate = errors / len(statuses) if statuses else 1.0

    latencies_ms.sort()
    n = len(latencies_ms)
    p50 = latencies_ms[int(n * 0.50)]
    p95 = latencies_ms[int(n * 0.95)]
    p99 = latencies_ms[int(n * 0.99)]

    print(f"\n==== /triage load smoke ====")
    print(f"Target:           {args.rps} RPS for {args.duration}s ({total_requests} requests)")
    print(f"Dispatched in:    {elapsed_dispatch:.1f}s   (achieved {total_requests/elapsed_dispatch:.1f} RPS)")
    print(f"Completed in:     {elapsed_total:.1f}s")
    print(f"Success:          {success}/{len(statuses)} ({100 - error_rate*100:.2f}%)")
    print(f"Errors:           {errors}  (error rate {error_rate*100:.3f}%)")
    print(f"Latency median:   {median(latencies_ms):.1f} ms")
    print(f"Latency p50:      {p50:.1f} ms")
    print(f"Latency p95:      {p95:.1f} ms")
    print(f"Latency p99:      {p99:.1f} ms")

    gates_passed = p95 <= 800.0 and error_rate < 0.01
    print(f"\nGate (p95<=800ms, err<1%): {'PASS' if gates_passed else 'FAIL'}")
    return 0 if gates_passed else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
