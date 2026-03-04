import { useEffect, useRef, useState } from "react";
import { startAudit as apiStartAudit, checkStatus, getAuditStatus } from "./api";
import { AuditForm } from "./components/AuditForm";
import { Results } from "./components/Results";
import { WorkflowPage } from "./components/WorkflowPage";
import { AUDIT_DEFAULTS, DEMO_MODE, REPO_URL } from "./constants";
import type { AuditResult, AuditStatus } from "./types";

type AppView = "audit" | "workflow";

interface WorkflowStatus {
  workflow_configured: boolean;
  tasks: string[] | null;
}

function App() {
  const [currentView, setCurrentView] = useState<AppView>("audit");
  const [status, setStatus] = useState<AuditStatus>("idle");
  const [taskRunId, setTaskRunId] = useState<string | null>(null);
  const [results, setResults] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditUrl, setAuditUrl] = useState("");
  const [auditMaxPages, setAuditMaxPages] = useState<number>(
    AUDIT_DEFAULTS.MAX_PAGES,
  );
  const [auditMaxConcurrency, setAuditMaxConcurrency] = useState<number>(
    AUDIT_DEFAULTS.MAX_CONCURRENCY,
  );
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if workflow is configured on mount
  useEffect(() => {
    checkStatus()
      .then((data) => setWorkflowStatus(data))
      .catch(() => setWorkflowStatus(null))
      .finally(() => setStatusLoading(false));
  }, []);

  // Poll for completion when we have a taskRunId and status is running
  useEffect(() => {
    if (!taskRunId || status !== "running") return;

    const poll = async () => {
      try {
        const data = await getAuditStatus(taskRunId);
        if (data.status === "completed" && data.results) {
          const resolvedResults = Array.isArray(data.results)
            ? data.results[0]
            : data.results;
          setResults(resolvedResults as AuditResult);
          setStatus("completed");
        } else if (data.status === "failed") {
          setError("Task execution failed");
          setStatus("error");
        } else {
          // Keep polling
          pollingRef.current = setTimeout(poll, 2000);
        }
      } catch (err) {
        console.error("Polling error:", err);
        pollingRef.current = setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
      }
    };
  }, [taskRunId, status]);

  const startAudit = async (
    url: string,
    maxPages: number,
    maxConcurrency: number,
  ) => {
    setStatus("starting");
    setResults(null);
    setError(null);
    setAuditUrl(url);
    setAuditMaxPages(maxPages);
    setAuditMaxConcurrency(maxConcurrency);

    try {
      const data = await apiStartAudit(url, maxPages, maxConcurrency);
      setTaskRunId(data.task_run_id);
      if (data.status === "completed" && data.results) {
        const resolvedResults = Array.isArray(data.results)
          ? data.results[0]
          : data.results;
        setResults(resolvedResults as AuditResult);
        setStatus("completed");
        return;
      }
      setStatus("running");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle");
    setTaskRunId(null);
    setResults(null);
    setError(null);
    setAuditUrl("");
    setAuditMaxPages(AUDIT_DEFAULTS.MAX_PAGES);
    setAuditMaxConcurrency(AUDIT_DEFAULTS.MAX_CONCURRENCY);
  };

  // Show workflow visualization page
  if (currentView === "workflow") {
    return <WorkflowPage onBack={() => setCurrentView("audit")} />;
  }

  const isRunning = status === "starting" || status === "running";
  const workflowReady = !statusLoading && workflowStatus?.workflow_configured && (workflowStatus?.tasks?.length ?? 0) > 0;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-normal tracking-tight">SEO AUDIT</h1>
            <button
              type="button"
              onClick={() => setCurrentView("workflow")}
              className="border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-white hover:text-white transition-colors"
            >
              HOW IT WORKS
            </button>
          </div>
          <p className="text-neutral-500 text-sm">
            Audit multiple pages simultaneously with{" "}
            <a
              href="https://render.com/docs/workflows"
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--accent) hover:underline"
            >
              Render Workflows
            </a>
          </p>
          {DEMO_MODE && (
            <p className="text-neutral-600 text-xs mt-1">
              Public demo —{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--accent) hover:underline"
              >
                deploy your own
              </a>
              {" "}for full control.
            </p>
          )}
        </header>

        {/* Form - always visible, disabled when running/completed or workflow not ready */}
        {status === "idle" ? (
          <AuditForm onSubmit={startAudit} workflowReady={workflowReady} loading={statusLoading} />
        ) : (
          <AuditForm
            onSubmit={startAudit}
            disabled={isRunning}
            initialUrl={auditUrl}
            initialMaxPages={auditMaxPages}
            initialMaxConcurrency={auditMaxConcurrency}
            workflowReady={workflowReady}
            loading={statusLoading}
          />
        )}

        {/* Error */}
        {status === "error" && (
          <div className="border border-red-500 p-6 mb-8">
            <div className="text-red-500 text-sm mb-4">ERROR</div>
            <p className="mb-6">{error}</p>
            <div className="flex gap-3 items-center">
              <button
                type="button"
                onClick={reset}
                className="border border-white px-4 py-2 text-sm hover:bg-white hover:text-black transition-colors"
              >
                TRY AGAIN
              </button>
              {DEMO_MODE && error && /demo|limit/i.test(error) && (
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-(--accent) hover:underline"
                >
                  Deploy your own instance
                </a>
              )}
            </div>
          </div>
        )}

        {/* Results */}
        {status === "completed" && results && (
          <>
            <Results data={results} />
            <button
              type="button"
              onClick={reset}
              className="mt-8 border border-white px-6 py-3 text-sm hover:bg-white hover:text-black transition-colors"
            >
              NEW AUDIT
            </button>
          </>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-neutral-800 text-neutral-600 text-xs">
          <a
            href="https://render.com/docs/workflows"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            render.com/docs/workflows
          </a>
        </footer>
      </div>
    </div>
  );
}

export default App;
