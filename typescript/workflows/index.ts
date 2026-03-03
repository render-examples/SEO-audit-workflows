/**
 * SEO Auditor Workflow Tasks
 *
 * Defines Render Workflow tasks for distributed SEO analysis.
 * Each task runs in its own compute instance and can spawn other tasks.
 */

import { task, type Retry } from "@renderinc/sdk/workflows";
import pMap from "p-map";
import {
    checkHeadings,
    checkImages,
    checkLinks,
    checkMetaTags,
    checkPerformance,
    discoverPages,
    fetchPage,
} from "./analyzers.js";

/** Final output returned by audit_site task */
interface AuditResult {
    url: string;
    pages_analyzed: number;
    failed_pages: Array<{ url: string; error: string }>;
    total_issues: number;
    issues_by_category: Record<string, number>;
    results: PageResult[];
}

/** Analysis results for a single page */
interface PageResult {
    url: string;
    issues: Record<string, Issue[]>;
    load_time_ms?: number;
    content_length?: number;
    error?: string;
}

/** A single SEO issue found during analysis */
interface Issue {
    type: "error" | "warning" | "info";
    message: string;
    url: string;
    value?: string;
    link?: string;
}

/** Default retry config, reusable across tasks */
const retry: Retry = {
    maxRetries: 2,
    waitDurationMs: 1000,
    backoffScaling: 1.5,
};

/**
 * Main entry point for SEO audits.
 *
 * Crawls the site to discover pages, then spawns analyze_page tasks
 * with controlled concurrency for each discovered page.
 */
task(
    {
        name: "audit_site",
        retry
    },
    async (url: string, maxPages: number = 25, maxConcurrency: number = 10): Promise<AuditResult> => {
        const cappedMaxPages = Math.min(maxPages, 100);
        const cappedConcurrency = Math.min(Math.max(maxConcurrency, 1), 50);

        // Discover pages (runs as a separate task)
        const pages = await crawlPages(url, cappedMaxPages);

        if (pages.length === 0) {
            return {
                url,
                pages_analyzed: 0,
                failed_pages: [],
                total_issues: 0,
                issues_by_category: {},
                results: [],
            };
        }

        // Spawn analyze_page tasks with controlled concurrency.
        // pMap processes pages with a sliding window (cappedConcurrency tasks at a time).
        // We wrap results to mimic Promise.allSettled - continue on errors, don't fail fast.
        const results = await pMap(
            pages,
            async (page) => {
                try {
                    return { status: "fulfilled" as const, value: await analyzePage(page) };
                } catch (error) {
                    return { status: "rejected" as const, reason: error, page };
                }
            },
            { concurrency: cappedConcurrency }
        );

        // Filter out failed results and aggregate
        const successfulResults: PageResult[] = [];
        const failedPages: Array<{ url: string; error: string }> = [];

        for (const result of results) {
            if (result.status === "fulfilled") {
                successfulResults.push(result.value);
            } else {
                failedPages.push({
                    url: result.page,
                    error: result.reason instanceof Error ? result.reason.message : "Unknown error",
                });
            }
        }

        // Aggregate issues by category
        const allIssues: Record<string, Issue[]> = {
            meta_tags: [],
            links: [],
            headings: [],
            images: [],
            performance: [],
        };

        for (const result of successfulResults) {
            for (const category of Object.keys(allIssues)) {
                if (result.issues[category]) {
                    allIssues[category].push(...result.issues[category]);
                }
            }
        }

        const totalIssues = Object.values(allIssues).reduce(
            (sum, issues) => sum + issues.length,
            0
        );

        return {
            url,
            pages_analyzed: successfulResults.length,
            failed_pages: failedPages,
            total_issues: totalIssues,
            issues_by_category: Object.fromEntries(
                Object.entries(allIssues).map(([k, v]) => [k, v.length])
            ),
            results: successfulResults,
        };
    }
);

/**
 * Discover pages on a website via sitemap or link following.
 */
const crawlPages = task(
    { name: "crawl_pages" },
    async (url: string, maxPages: number): Promise<string[]> => {
        return await discoverPages(url, maxPages);
    }
);

/**
 * Run all 5 SEO checks on a single page.
 */
const analyzePage = task(
    {
        name: "analyze_page",
        retry: {
            maxRetries: 3,
            waitDurationMs: 500,
            backoffScaling: 2.0,
        },
    },
    async (pageUrl: string): Promise<PageResult> => {
        // Fetch the page content
        const pageData = await fetchPage(pageUrl);

        if (pageData.error) {
            return {
                url: pageUrl,
                error: pageData.error,
                issues: {},
            };
        }

        const { html, headers, loadTime, contentLength } = pageData;

        // Run all 5 SEO checks
        const issues: Record<string, Issue[]> = {
            meta_tags: checkMetaTags(html, pageUrl),
            links: await checkLinks(html, pageUrl),
            headings: checkHeadings(html, pageUrl),
            images: checkImages(html, pageUrl),
            performance: checkPerformance(html, pageUrl, loadTime, contentLength, headers),
        };

        return {
            url: pageUrl,
            issues,
            load_time_ms: loadTime,
            content_length: contentLength,
        };
    }
);
