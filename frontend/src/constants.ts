/**
 * Shared constants for the SEO Audit frontend
 */

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

export const DEMO_LIMITS = {
  MAX_PAGES: 10,
  MAX_CONCURRENCY: 3,
} as const

export const AUDIT_DEFAULTS = {
  MAX_PAGES: DEMO_MODE ? DEMO_LIMITS.MAX_PAGES : 25,
  MAX_CONCURRENCY: DEMO_MODE ? DEMO_LIMITS.MAX_CONCURRENCY : 5,
  DEFAULT_URL: 'https://render.com/docs',
} as const

export const AUDIT_CAPS = {
  MAX_PAGES: DEMO_MODE ? DEMO_LIMITS.MAX_PAGES : 100,
  MAX_CONCURRENCY: DEMO_MODE ? DEMO_LIMITS.MAX_CONCURRENCY : 50,
} as const

export const REPO_URL = 'https://github.com/render-examples/SEO-audit-workflow'

export const CATEGORY_LABELS: Record<string, string> = {
  meta_tags: 'META',
  links: 'LINKS',
  headings: 'HEADINGS',
  images: 'IMAGES',
  performance: 'PERF',
}
