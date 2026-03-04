/**
 * Express route handlers for the SEO Audit API.
 * Uses Render Workflows SDK to start and monitor audit tasks.
 */
import type { Request, Response } from "express";
import { AuditRequestSchema, validateRequest } from "../shared/schemas.js";
import { validateUrl } from "../shared/urlValidator.js";
import { LIMITS, RENDER_API_BASE_URL, RENDER_API_KEY, WORKFLOW_ID, WORKFLOW_SLUG } from "./config.js";
import { trackAuditEnd, trackAuditStart } from "./demoTracker.js";
import { fetchSpawnedTasks, getRenderClient, toSdkErrorResponse } from "./utils.js";

/** POST /audit - Start a new SEO audit task */
export async function startAuditHandler(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(AuditRequestSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error });
  }
  const { url } = validation.data;
  const maxPages = Math.min(validation.data.max_pages, LIMITS.MAX_PAGES);
  const maxConcurrency = Math.min(validation.data.max_concurrency, LIMITS.MAX_CONCURRENCY);

  const urlValidation = validateUrl(url);
  if (!urlValidation.valid || !urlValidation.normalizedUrl) {
    return res.status(400).json({ error: urlValidation.error ?? "Invalid URL" });
  }
  const validatedUrl = urlValidation.normalizedUrl;

  if (!WORKFLOW_SLUG) {
    return res.status(500).json({ error: "WORKFLOW_SLUG not configured" });
  }

  if (!RENDER_API_KEY) {
    return res.status(500).json({ error: "RENDER_API_KEY not configured" });
  }

  try {
    const render = getRenderClient();
    const taskRun = await render.workflows.runTask(
      `${WORKFLOW_SLUG}/audit_site`,
      [validatedUrl, maxPages, maxConcurrency]
    );

    console.log(`Started audit task: ${taskRun.id} (pages=${maxPages}, concurrency=${maxConcurrency})`);
    trackAuditStart(taskRun.id);

    return res.json({
      task_run_id: taskRun.id,
      status: taskRun.status,
      results: taskRun.results,
    });
  } catch (error) {
    console.error("Error starting audit:", error);
    const response = toSdkErrorResponse(error);
    return res.status(response.status).json({ error: response.message });
  }
}

/** GET /audit/:taskRunId - Poll for audit status and spawned task progress */
export async function getAuditStatusHandler(req: Request, res: Response): Promise<Response> {
  const { taskRunId } = req.params;

  try {
    const render = getRenderClient();
    const taskRun = await render.workflows.getTaskRun(taskRunId);

    const responseData = {
      id: taskRun.id,
      status: taskRun.status,
      retries: taskRun.retries,
      tasks: await fetchSpawnedTasks(taskRunId),
      results: undefined as unknown,
    };

    if (taskRun.status === "completed" || taskRun.status === "failed") {
      trackAuditEnd(taskRunId);
    }

    if (taskRun.status === "completed") {
      responseData.results = taskRun.results;
    }

    return res.json(responseData);
  } catch (error) {
    console.error("Error getting audit status:", error);
    const response = toSdkErrorResponse(error);
    if (response.status === 404) {
      return res.status(404).json({ error: "Task run not found" });
    }
    return res.status(response.status).json({ error: response.message });
  }
}

/** GET /status - Check API health and workflow configuration */
export async function getStatusHandler(_req: Request, res: Response): Promise<Response> {
  const result = {
    api: "ok" as const,
    workflow_configured: Boolean(WORKFLOW_SLUG && WORKFLOW_ID && RENDER_API_KEY),
    workflow_slug: WORKFLOW_SLUG || null,
    workflow_id: WORKFLOW_ID || null,
    tasks: [] as string[],
    message: null as string | null,
  };

  if (!WORKFLOW_SLUG) {
    result.message = "WORKFLOW_SLUG not configured. Set it in your environment variables.";
    return res.json(result);
  }

  if (!WORKFLOW_ID) {
    result.message = "WORKFLOW_ID not configured. Set it in your environment variables (e.g., wfl-xxxxx).";
    return res.json(result);
  }

  if (!RENDER_API_KEY) {
    result.message = "RENDER_API_KEY not configured. Set it in your environment variables.";
    return res.json(result);
  }

  try {
    const response = await fetch(
      `${RENDER_API_BASE_URL}/tasks?workflowId=${WORKFLOW_ID}&limit=100`,
      { headers: { Authorization: `Bearer ${RENDER_API_KEY}` } }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Tasks API error: ${response.status} - ${errorText}`);
      result.message = `Could not verify tasks: HTTP ${response.status}`;
      return res.json(result);
    }

    const items = await response.json() as Array<{ task: { name?: string; id?: string } }>;
    console.log(`Found ${items.length} tasks for workflow ${WORKFLOW_ID}`);

    if (items.length > 0) {
      // Extract unique task names, prioritizing known workflow tasks
      const taskNames = items.map((t) => t.task?.name).filter((n): n is string => Boolean(n));
      const uniqueNames = [...new Set(taskNames)];
      const knownTasks = ["audit_site", "crawl_pages", "analyze_page"];
      const filtered = uniqueNames.filter((name) => knownTasks.includes(name));

      result.tasks = filtered.length > 0 ? filtered : uniqueNames;
      result.message = `Found ${result.tasks.length} tasks`;
    } else {
      result.message = `No tasks found for workflow '${WORKFLOW_ID}'. Deploy the workflow service first.`;
    }
  } catch (error) {
    console.warn("Could not fetch tasks:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    result.message = `Could not verify tasks: ${message}`;
  }

  return res.json(result);
}
