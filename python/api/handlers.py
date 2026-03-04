"""
Flask route handlers for the SEO Audit API.
Uses Render Workflows SDK to start and monitor audit tasks.
"""
import os
from typing import Any, Dict

import httpx
from flask import jsonify, request

from config import LIMITS, RENDER_API_BASE_URL
from shared.url_validator import validate_url
from utils import fetch_task_status, get_render_client, run_async, to_sdk_error_response


def start_audit():
    """POST /audit - Start a new SEO audit task."""
    data = request.get_json() or {}
    url = data.get("url")
    max_pages = min(data.get("max_pages", 25), LIMITS["MAX_PAGES"])
    max_concurrency = min(data.get("max_concurrency", 10), LIMITS["MAX_CONCURRENCY"])

    if not url:
        return jsonify({"error": "URL is required"}), 400

    url_validation = validate_url(url)
    if not url_validation.valid:
        return jsonify({"error": url_validation.error}), 400
    validated_url = url_validation.normalized_url

    workflow_slug = os.environ.get("WORKFLOW_SLUG", "")
    if not workflow_slug:
        return jsonify({"error": "WORKFLOW_SLUG not configured"}), 500

    try:
        render = get_render_client()

        async def run_task_and_wait():
            task_run = await render.workflows.run_task(
                f"{workflow_slug}/audit_site",
                [validated_url, max_pages, max_concurrency],
            )
            result = await task_run
            return task_run, result

        task_run, result = run_async(run_task_and_wait())

        from app import track_audit_start
        track_audit_start(task_run.id)

        return jsonify({
            "task_run_id": task_run.id,
            "status": result.status,
            "results": getattr(result, "results", None),
        })
    except Exception as e:
        status, message = to_sdk_error_response(e)
        return jsonify({"error": message}), status


def get_audit_status(task_run_id: str):
    """GET /audit/:taskRunId - Poll for audit status and spawned task progress."""
    try:
        client = get_render_client()
        response = run_async(fetch_task_status(client, task_run_id))

        from app import track_audit_end
        task_status = response.get("status", "")
        if task_status in ("completed", "failed"):
            track_audit_end(task_run_id)

        return jsonify(response)
    except Exception as e:
        status, message = to_sdk_error_response(e)
        if status == 400 and "not found" in message.lower():
            return jsonify({"error": f"Task run not found: {message}"}), 404
        return jsonify({"error": message}), status


def status():
    """GET /status - Check API health and workflow configuration."""
    workflow_slug = os.environ.get("WORKFLOW_SLUG", "")
    workflow_id = os.environ.get("WORKFLOW_ID", "")
    api_key = os.environ.get("RENDER_API_KEY")

    result: Dict[str, Any] = {
        "api": "ok",
        "workflow_configured": bool(workflow_slug and workflow_id),
        "workflow_slug": workflow_slug or None,
        "workflow_id": workflow_id or None,
        "tasks": None,
        "message": None,
    }

    if not workflow_slug:
        result["message"] = "WORKFLOW_SLUG not configured. Set it in your environment variables."
        return jsonify(result)

    if not workflow_id:
        result["message"] = "WORKFLOW_ID not configured. Set it in your environment variables (e.g., wfl-xxxxx)."
        return jsonify(result)

    if not api_key:
        result["message"] = "RENDER_API_KEY not configured. Set it in your environment variables."
        return jsonify(result)

    try:
        with httpx.Client(timeout=10) as client:
            response = client.get(
                f"{RENDER_API_BASE_URL}/tasks",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"workflowId": workflow_id, "limit": 100},
            )
            response.raise_for_status()
            items = response.json()

            if items:
                # Extract unique task names, prioritizing known workflow tasks
                task_names = [item.get("task", {}).get("name") for item in items]
                unique_names = list(dict.fromkeys(n for n in task_names if n))
                known_tasks = {"audit_site", "crawl_pages", "analyze_page"}
                filtered = [name for name in unique_names if name in known_tasks]
                result["tasks"] = filtered or unique_names
                result["message"] = f"Found {len(result['tasks'])} tasks"
            else:
                result["message"] = f"No tasks found for workflow '{workflow_id}'. Deploy the workflow service first."
    except Exception as e:
        result["message"] = f"Could not verify tasks: {str(e)}"

    return jsonify(result)
