import { useEffect, useRef, useState } from 'react'
import { AUDIT_CAPS, AUDIT_DEFAULTS, DEMO_MODE } from '../constants'

const CYCLING_MESSAGES = [
  'Crawling pages...',
  'Analyzing SEO...',
  'Checking links...',
  'Inspecting images...',
  'Almost done...',
]

interface Props {
  onSubmit: (url: string, maxPages: number, maxConcurrency: number) => void
  disabled?: boolean
  initialUrl?: string
  initialMaxPages?: number
  initialMaxConcurrency?: number
  workflowReady?: boolean
  loading?: boolean
}

export function AuditForm({
  onSubmit,
  disabled = false,
  initialUrl = '',
  initialMaxPages = AUDIT_DEFAULTS.MAX_PAGES,
  initialMaxConcurrency = AUDIT_DEFAULTS.MAX_CONCURRENCY,
  workflowReady = true,
  loading = false,
}: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [maxPages, setMaxPages] = useState(initialMaxPages)
  const [maxConcurrency, setMaxConcurrency] = useState(initialMaxConcurrency)
  const [messageIndex, setMessageIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cycle through messages with randomized intervals when disabled (audit running)
  useEffect(() => {
    if (!disabled) {
      setMessageIndex(0)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const scheduleNext = () => {
      const delay = 2000 + Math.random() * 3000 // 2-5 seconds
      return setTimeout(() => {
        setMessageIndex((i) => (i + 1) % CYCLING_MESSAGES.length)
        timerRef.current = scheduleNext()
      }, delay)
    }

    timerRef.current = scheduleNext()

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [disabled])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || !workflowReady) return

    // Use default URL if empty
    const targetUrl = url.trim() || AUDIT_DEFAULTS.DEFAULT_URL

    let normalizedUrl = targetUrl
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      normalizedUrl = `https://${targetUrl}`
    }

    onSubmit(normalizedUrl, maxPages, maxConcurrency)
  }

  const disabledClasses = disabled ? 'opacity-60 cursor-not-allowed' : ''
  const buttonDisabled = disabled || loading || !workflowReady

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor="audit-url"
            className="block text-neutral-500 text-xs mb-2 uppercase tracking-wider"
          >
            URL
          </label>
          <input
            id="audit-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={AUDIT_DEFAULTS.DEFAULT_URL}
            disabled={disabled}
            className={`w-full bg-black border border-neutral-700 px-4 py-3 text-white placeholder-neutral-600 focus:border-white focus:outline-none transition-colors ${disabledClasses}`}
          />
        </div>

        <div className="flex gap-4 items-end">
          <div className="w-32">
            <label
              htmlFor="max-pages"
              className="block text-neutral-500 text-xs mb-2 uppercase tracking-wider"
            >
              Max pages
            </label>
            <input
              id="max-pages"
              type="number"
              value={maxPages}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || AUDIT_DEFAULTS.MAX_PAGES
                setMaxPages(Math.min(v, AUDIT_CAPS.MAX_PAGES))
              }}
              min={1}
              max={AUDIT_CAPS.MAX_PAGES}
              disabled={disabled}
              className={`w-full bg-black border border-neutral-700 px-4 py-3 text-white focus:border-white focus:outline-none transition-colors ${disabledClasses}`}
            />
          </div>

          <div className="w-32">
            <label
              htmlFor="max-concurrency"
              className="block text-neutral-500 text-xs mb-2 uppercase tracking-wider"
            >
              Concurrency
              <sup className="ml-0.5 align-super text-[9px] text-neutral-500">
                *
              </sup>
            </label>
            <input
              id="max-concurrency"
              type="number"
              value={maxConcurrency}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10) || AUDIT_DEFAULTS.MAX_CONCURRENCY
                setMaxConcurrency(Math.min(v, AUDIT_CAPS.MAX_CONCURRENCY))
              }}
              min={1}
              max={AUDIT_CAPS.MAX_CONCURRENCY}
              disabled={disabled}
              className={`w-full bg-black border border-neutral-700 px-4 py-3 text-white focus:border-white focus:outline-none transition-colors ${disabledClasses}`}
            />
          </div>

          {disabled ? (
            <div className="flex-1 bg-neutral-800 text-neutral-300 px-6 py-3 font-medium uppercase tracking-wider text-sm flex items-center justify-center gap-2">
              <span className="inline-block w-4 h-4 shrink-0 aspect-square border-2 border-neutral-500 border-t-white rounded-full animate-spin" />
              {CYCLING_MESSAGES[messageIndex]}
            </div>
          ) : (
            <button
              type="submit"
              disabled={buttonDisabled}
              className={`flex-1 px-6 py-3 font-medium transition-colors uppercase tracking-wider text-sm ${
                buttonDisabled
                  ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                  : 'bg-white text-black hover:bg-neutral-200 cursor-pointer'
              }`}
            >
              {loading ? 'Checking...' : !workflowReady ? 'Workflow Not Ready' : 'Start Audit'}
            </button>
          )}
        </div>
        {DEMO_MODE ? (
          <div className="text-xs text-neutral-400 space-y-1 mt-1">
            <p>This demo is capped at {AUDIT_CAPS.MAX_PAGES} pages and {AUDIT_CAPS.MAX_CONCURRENCY} concurrent tasks.</p>
            <p className="text-neutral-500">
              * Plan limits for concurrent tasks: Hobby 5, Pro 25, Org 100 (may change after beta).
            </p>
          </div>
        ) : (
          <p className="text-xs text-neutral-500 mt-1">
            * Plan limits for concurrent tasks: Hobby 5, Pro 25, Org 100 (may change after beta).
          </p>
        )}
      </div>
    </form>
  )
}
