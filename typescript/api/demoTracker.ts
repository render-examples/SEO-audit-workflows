import { DEMO_MODE } from "./config.js";

export const activeAudits = new Map<string, number>();
let dailyAuditCount = 0;
let dailyResetTime = Date.now() + 86_400_000;

if (DEMO_MODE) {
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 10 * 60_000;
    for (const [id, startedAt] of activeAudits) {
      if (now - startedAt > staleThreshold) activeAudits.delete(id);
    }
  }, 5 * 60_000);
}

export function getDailyAuditCount() {
  return dailyAuditCount;
}

export function resetDailyIfNeeded() {
  if (Date.now() > dailyResetTime) {
    dailyAuditCount = 0;
    dailyResetTime = Date.now() + 86_400_000;
  }
}

export function trackAuditStart(taskRunId: string) {
  if (!DEMO_MODE) return;
  activeAudits.set(taskRunId, Date.now());
  dailyAuditCount++;
}

export function trackAuditEnd(taskRunId: string) {
  activeAudits.delete(taskRunId);
}
