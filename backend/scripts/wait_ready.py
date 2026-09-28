"""Bounded readiness polling; no application credentials or response bodies are logged."""

import argparse
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("url")
parser.add_argument("--timeout", type=int, default=60)
args = parser.parse_args()
deadline = time.monotonic() + args.timeout
while time.monotonic() < deadline:
    try:
        with urllib.request.urlopen(args.url, timeout=2) as response:
            if response.status == 200:
                print("Service ready")
                break
    except urllib.error.URLError, TimeoutError, ConnectionError:
        pass
    time.sleep(0.5)
else:
    raise SystemExit("Service readiness deadline exceeded")
