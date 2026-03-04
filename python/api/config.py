import os

RENDER_API_BASE_URL = "https://api.render.com/v1"

DEMO_MODE = os.environ.get("DEMO_MODE", "").lower() == "true"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")

DEMO_LIMITS = {
    "MAX_PAGES": 10,
    "MAX_CONCURRENCY": 3,
    "AUDIT_RATE": "1 per minute",
    "MAX_CONCURRENT_AUDITS": 5,
    "DAILY_AUDIT_CAP": 200,
}

DEFAULT_LIMITS = {
    "MAX_PAGES": 100,
    "MAX_CONCURRENCY": 50,
    "AUDIT_RATE": "3 per minute",
}

LIMITS = DEMO_LIMITS if DEMO_MODE else DEFAULT_LIMITS
