export const RENDER_API_BASE_URL = "https://api.render.com/v1"
export const WORKFLOW_SLUG = process.env.WORKFLOW_SLUG || ""
export const WORKFLOW_ID = process.env.WORKFLOW_ID || ""
export const RENDER_API_KEY = process.env.RENDER_API_KEY || ""
export const FRONTEND_URL = process.env.FRONTEND_URL || ""

export const DEMO_MODE = process.env.DEMO_MODE === "true"

export const DEMO_LIMITS = {
  MAX_PAGES: 10,
  MAX_CONCURRENCY: 3,
  AUDIT_RATE_MAX: 1,
  AUDIT_RATE_WINDOW_MS: 60_000,
  MAX_CONCURRENT_AUDITS: 5,
  DAILY_AUDIT_CAP: 200,
} as const

export const DEFAULT_LIMITS = {
  MAX_PAGES: 100,
  MAX_CONCURRENCY: 50,
  AUDIT_RATE_MAX: 3,
  AUDIT_RATE_WINDOW_MS: 60_000,
} as const

export const LIMITS = DEMO_MODE ? DEMO_LIMITS : DEFAULT_LIMITS
