"""
Convenience launcher for the proxy.

Supports:
  python launcher.py start --provider copilot
  python launcher.py switch openai
  python launcher.py status
  python launcher.py stop
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path


PROXY_URL = "http://127.0.0.1:8765"


def cmd_start(args: argparse.Namespace) -> None:
    """Start the proxy server."""
    import os
    script = Path(__file__).parent / "proxy_server.py"
    cmd = [
        sys.executable, str(script),
        "--provider", args.provider,
        "--log-level", args.log_level,
    ]
    if args.port:
        cmd.extend(["--port", str(args.port)])

    print(f"Starting proxy with provider: {args.provider}")
    print(f"Set ANTHROPIC_BASE_URL=http://127.0.0.1:{args.port or 8765}")
    print("Press Ctrl+C to stop\n")

    os.execv(sys.executable, cmd)


def cmd_switch(args: argparse.Namespace) -> None:
    """Switch provider on running proxy."""
    data = json.dumps({"provider": args.provider}).encode()
    req = urllib.request.Request(
        f"{PROXY_URL}/_proxy/switch",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"Switched to: {result.get('active_provider')}")
    except urllib.error.URLError as e:
        print(f"Error: proxy not running or unreachable: {e}")
        sys.exit(1)


def cmd_status(args: argparse.Namespace) -> None:
    """Check proxy status."""
    req = urllib.request.Request(f"{PROXY_URL}/_proxy/status")
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"Status: {result.get('status')}")
            print(f"Active provider: {result.get('active_provider')}")
            print(f"Available: {', '.join(result.get('available_providers', []))}")
    except urllib.error.URLError:
        print("Proxy is not running")
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Claude Code Proxy Launcher")
    sub = parser.add_subparsers(dest="command")

    start_p = sub.add_parser("start", help="Start the proxy")
    start_p.add_argument("--provider", default="anthropic", help="Initial provider")
    start_p.add_argument("--port", type=int, default=None)
    start_p.add_argument("--log-level", default="info")

    switch_p = sub.add_parser("switch", help="Switch provider on running proxy")
    switch_p.add_argument("provider", help="Provider to switch to")

    sub.add_parser("status", help="Check proxy status")

    args = parser.parse_args()

    if args.command == "start":
        cmd_start(args)
    elif args.command == "switch":
        cmd_switch(args)
    elif args.command == "status":
        cmd_status(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
