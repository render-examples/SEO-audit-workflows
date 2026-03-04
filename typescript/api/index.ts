/**
 * SEO Auditor API Service
 *
 * Express API for triggering and monitoring SEO audits via Render Workflows.
 * Uses the official @renderinc/sdk for workflow operations.
 */

import cors from "cors";
import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import {
  getAuditStatusHandler,
  getStatusHandler,
  startAuditHandler,
} from "./handlers.js";
import { DEMO_MODE, DEMO_LIMITS, FRONTEND_URL, LIMITS } from "./config.js";
import { activeAudits, getDailyAuditCount, resetDailyIfNeeded } from "./demoTracker.js";

const app = express();
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

const corsOptions: cors.CorsOptions = {
  origin: FRONTEND_URL
    ? [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"]
    : true,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());

// --- Rate limiting ---

const auditRateLimiter = rateLimit({
  windowMs: LIMITS.AUDIT_RATE_WINDOW_MS,
  max: LIMITS.AUDIT_RATE_MAX,
  message: { error: "Too many audit requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalRateLimiter);

// --- Demo-mode guards (no-ops when DEMO_MODE is off) ---

function originGuard(req: Request, res: Response, next: NextFunction) {
  if (!DEMO_MODE || req.method === "GET") return next();
  const origin = req.get("origin") || req.get("referer") || "";
  if (!FRONTEND_URL || !origin.startsWith(FRONTEND_URL)) {
    return res.status(403).json({
      error: "Direct API access is not available on the demo. Deploy your own instance for unrestricted access.",
    });
  }
  next();
}

function demoLimitGuard(_req: Request, res: Response, next: NextFunction) {
  if (!DEMO_MODE) return next();

  resetDailyIfNeeded();

  if (getDailyAuditCount() >= DEMO_LIMITS.DAILY_AUDIT_CAP) {
    return res.status(429).json({
      error: "Daily demo limit reached. Deploy your own instance for unrestricted access.",
    });
  }

  if (activeAudits.size >= DEMO_LIMITS.MAX_CONCURRENT_AUDITS) {
    return res.status(429).json({
      error: "Demo is busy — try again shortly, or deploy your own instance for unrestricted access.",
    });
  }

  next();
}

// --- Routes ---

app.get("/", (_req, res) => {
  res.json({ status: "healthy", service: "seo-audit-api" });
});

app.post("/audit", originGuard, auditRateLimiter, demoLimitGuard, startAuditHandler);

app.get("/audit/:taskRunId", getAuditStatusHandler);

app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

app.get("/status", getStatusHandler);

if (DEMO_MODE) {
  console.log("Demo mode enabled — limits:", JSON.stringify(DEMO_LIMITS));
}

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`SEO Audit API listening on port ${PORT}`);
});
