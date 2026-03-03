#!/usr/bin/env python3
"""
SEO Auditor Workflow Tasks

Defines Render Workflow tasks for distributed SEO analysis.
Each task runs in its own compute instance and can spawn other tasks.
"""

import asyncio
import logging
from typing import Any

from render_sdk import Retry, Workflows

from analyzers import (
    check_meta_tags,
    check_links,
    check_headings,
    check_images,
    check_performance,
    discover_pages,
    fetch_page,
)

# Configure logging
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create Workflows app with default configuration
app = Workflows(
    default_retry=Retry(max_retries=2, wait_duration_ms=1000, backoff_scaling=1.5),
    default_timeout=300,
)


async def process_batches(items: list, batch_size: int, processor) -> list:
    """Process items in batches with controlled concurrency."""
    results = []
    
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        batch_results = await asyncio.gather(
            *[processor(item) for item in batch],
            return_exceptions=True,
        )
        results.extend(batch_results)
    
    return results


@app.task
async def audit_site(url: str, max_pages: int = 25, max_concurrency: int = 10) -> dict[str, Any]:
    """
    Main entry point for SEO audits.
    
    Crawls the site to discover pages, then spawns analyze_page tasks
    with controlled concurrency for each discovered page.
    
    Args:
        url: The root URL to audit
        max_pages: Maximum number of pages to analyze (default: 25, max: 100)
        max_concurrency: Maximum tasks to run in parallel (default: 10, max: 50)
    
    Returns:
        Aggregated audit results with issues by category
    """
    logger.info(f"Starting audit for {url} (max_pages={max_pages}, max_concurrency={max_concurrency})")
    
    max_pages = min(max_pages, 100)  # Cap at 100 pages
    max_concurrency = min(max(max_concurrency, 1), 50)  # Clamp 1-50
    
    # Discover pages (runs as a separate task)
    pages = await crawl_pages(url, max_pages)
    logger.info(f"Discovered {len(pages)} pages to analyze")
    
    if not pages:
        return {
            "url": url,
            "pages_analyzed": 0,
            "error": "No pages found to analyze",
            "results": [],
        }
    
    # Spawn analyze_page tasks with controlled concurrency
    # Tasks are batched to limit parallel execution
    results = await process_batches(pages, max_concurrency, analyze_page)
    
    # Filter out failed results and aggregate
    successful_results = []
    failed_pages = []
    
    for page_url, result in zip(pages, results):
        if isinstance(result, Exception):
            failed_pages.append({"url": page_url, "error": str(result)})
        else:
            successful_results.append(result)
    
    # Aggregate issues by category
    all_issues = {
        "meta_tags": [],
        "links": [],
        "headings": [],
        "images": [],
        "performance": [],
    }
    
    for result in successful_results:
        for category in all_issues.keys():
            if category in result.get("issues", {}):
                all_issues[category].extend(result["issues"][category])
    
    total_issues = sum(len(issues) for issues in all_issues.values())
    pages_count = len(successful_results)
    
    logger.info(f"Audit complete: {pages_count} pages, {total_issues} issues, {len(failed_pages)} failed")
    
    return {
        "url": url,
        "pages_analyzed": pages_count,
        "failed_pages": failed_pages,
        "total_issues": total_issues,
        "issues_by_category": {k: len(v) for k, v in all_issues.items()},
        "results": successful_results,
    }


@app.task
async def crawl_pages(url: str, max_pages: int) -> list[str]:
    """
    Discover pages on a website via sitemap or link following.
    
    Tries sitemap.xml first, falls back to crawling internal links.
    
    Args:
        url: The root URL to crawl
        max_pages: Maximum number of pages to discover
    
    Returns:
        List of page URLs to analyze
    """
    logger.info(f"Crawling pages from {url} (max: {max_pages})")
    pages = await discover_pages(url, max_pages)
    logger.info(f"Found {len(pages)} pages")
    return pages


@app.task(retry=Retry(max_retries=3, wait_duration_ms=500, backoff_scaling=2.0))
async def analyze_page(page_url: str) -> dict[str, Any]:
    """
    Run all 5 SEO checks on a single page.
    
    Args:
        page_url: URL of the page to analyze
    
    Returns:
        Analysis results with issues found
    """
    logger.info(f"Analyzing page: {page_url}")
    
    # Fetch the page content
    page_data = await fetch_page(page_url)
    
    if page_data.get("error"):
        return {
            "url": page_url,
            "error": page_data["error"],
            "issues": {},
        }
    
    html = page_data["html"]
    headers = page_data["headers"]
    load_time = page_data["load_time"]
    content_length = page_data["content_length"]
    
    # Run all 5 SEO checks
    issues = {
        "meta_tags": check_meta_tags(html, page_url),
        "links": await check_links(html, page_url),
        "headings": check_headings(html, page_url),
        "images": check_images(html, page_url),
        "performance": check_performance(
            html, page_url, load_time, content_length, headers
        ),
    }
    
    return {
        "url": page_url,
        "issues": issues,
        "load_time_ms": load_time,
        "content_length": content_length,
    }


if __name__ == "__main__":
    app.start()
