"""
SEO Auditor API Service

Flask API for triggering and monitoring SEO audits via Render Workflows.
"""

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_talisman import Talisman
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import DEMO_MODE, FRONTEND_URL, LIMITS
from handlers import get_audit_status, start_audit, status

app = Flask(__name__)

cors_origins = (
    [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"]
    if FRONTEND_URL
    else "*"
)
CORS(app, origins=cors_origins, methods=["GET", "POST"], allow_headers=["Content-Type", "Authorization"])
Talisman(app, force_https=False, content_security_policy=None)

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["100 per minute"],
    storage_uri="memory://",
)

# --- Demo mode tracking ---

DEPLOY_NUDGE = "Deploy your own instance for unrestricted access."

active_audits: dict[str, float] = {}
daily_audit_count = 0
daily_reset_time = time.time() + 86_400


def track_audit_start(task_run_id: str):
    global daily_audit_count
    if not DEMO_MODE:
        return
    active_audits[task_run_id] = time.time()
    daily_audit_count += 1


def track_audit_end(task_run_id: str):
    active_audits.pop(task_run_id, None)


def _cleanup_stale_audits():
    stale = time.time() - 600
    for tid in [k for k, v in active_audits.items() if v < stale]:
        active_audits.pop(tid, None)


@app.before_request
def origin_guard():
    if not DEMO_MODE or request.method == "GET":
        return None
    origin = request.headers.get("Origin", "") or request.headers.get("Referer", "")
    if not FRONTEND_URL or not origin.startswith(FRONTEND_URL):
        return jsonify({"error": f"Direct API access is not available on the demo. {DEPLOY_NUDGE}"}), 403


@app.before_request
def demo_limit_guard():
    global daily_audit_count, daily_reset_time
    if not DEMO_MODE or request.path != "/audit" or request.method != "POST":
        return None

    _cleanup_stale_audits()

    now = time.time()
    if now > daily_reset_time:
        daily_audit_count = 0
        daily_reset_time = now + 86_400

    if daily_audit_count >= LIMITS["DAILY_AUDIT_CAP"]:
        return jsonify({"error": f"Daily demo limit reached. {DEPLOY_NUDGE}"}), 429

    if len(active_audits) >= LIMITS["MAX_CONCURRENT_AUDITS"]:
        return jsonify({"error": f"Demo is busy — try again shortly. {DEPLOY_NUDGE}"}), 429


@app.route("/")
def index():
    """API root - health check."""
    return jsonify({"status": "healthy", "service": "seo-audit-api"})


@app.route("/audit", methods=["POST"])
@limiter.limit(LIMITS.get("AUDIT_RATE", "3 per minute"))
def audit():
    return start_audit()


@app.route("/audit/<task_run_id>", methods=["GET"])
def audit_status(task_run_id: str):
    return get_audit_status(task_run_id)


@app.route("/health")
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy"})


@app.route("/status")
def status_route():
    return status()


if DEMO_MODE:
    print(f"Demo mode enabled — limits: {LIMITS}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=True)
