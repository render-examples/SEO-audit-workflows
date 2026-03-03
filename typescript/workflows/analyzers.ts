/**
 * SEO Analyzers
 *
 * Functions for performing SEO checks on web pages.
 * Uses node-fetch with ssrf-req-filter for SSRF protection.
 */

import * as cheerio from "cheerio";
import fetch from "node-fetch";
import ssrfFilter from "ssrf-req-filter";

const TIMEOUT_MS = 10000;
const USER_AGENT = "SEO-Auditor/1.0 (Render Workflows Demo)";

/**
 * Create a safe fetch request with SSRF protection
 */
function safeFetch(url: string, options: Parameters<typeof fetch>[1] = {}) {
  const agent = ssrfFilter(url);
  return fetch(url, { ...options, agent });
}

export interface Issue {
  type: "error" | "warning" | "info";
  message: string;
  url: string;
  value?: string;
  link?: string;
}

export interface PageData {
  html: string;
  headers: Record<string, string>;
  loadTime: number;
  contentLength: number;
  statusCode: number;
  error?: string;
}

/**
 * Fetch a page and return its content with metadata.
 */
export async function fetchPage(url: string): Promise<PageData> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const startTime = Date.now();
    const response = await safeFetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    });

    const loadTime = Date.now() - startTime;
    const html = await response.text();

    // Convert headers to plain object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      html,
      headers,
      loadTime,
      contentLength: html.length,
      statusCode: response.status,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { error: `Timeout fetching ${url}` } as PageData;
      }
      return { error: `Request error: ${error.message}` } as PageData;
    }
    return { error: "Unknown error" } as PageData;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Discover pages on a website.
 * Tries sitemap.xml first, then falls back to crawling links.
 */
export async function discoverPages(
  rootUrl: string,
  maxPages: number
): Promise<string[]> {
  const url = new URL(rootUrl);
  const baseUrl = `${url.protocol}//${url.host}`;

  // Try sitemap first
  const sitemapUrls = await trySitemap(baseUrl, maxPages);
  if (sitemapUrls.length > 0) {
    return sitemapUrls.slice(0, maxPages);
  }

  // Fall back to crawling
  return await crawlLinks(rootUrl, baseUrl, maxPages);
}

async function trySitemap(
  baseUrl: string,
  maxPages: number
): Promise<string[]> {
  const sitemapUrl = `${baseUrl}/sitemap.xml`;

  try {
    const response = await safeFetch(sitemapUrl, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    const urls: string[] = [];

    // Check if it's a sitemap index
    const sitemaps = $("sitemap loc");
    if (sitemaps.length > 0) {
      // Get first sub-sitemap
      const subSitemapUrl = sitemaps.first().text().trim();
      if (subSitemapUrl) {
        return await trySitemap(subSitemapUrl.replace(/\/sitemap\.xml$/, ""), maxPages);
      }
    }

    // Regular sitemap
    $("url loc").each((_, elem) => {
      if (urls.length < maxPages) {
        urls.push($(elem).text().trim());
      }
    });

    return urls;
  } catch {
    return [];
  }
}

async function crawlLinks(
  startUrl: string,
  baseUrl: string,
  maxPages: number
): Promise<string[]> {
  const visited = new Set<string>();
  const toVisit = [startUrl];
  const foundUrls: string[] = [];
  const baseHost = new URL(baseUrl).host;

  while (toVisit.length > 0 && foundUrls.length < maxPages) {
    const url = toVisit.shift();
    if (!url) continue;

    if (visited.has(url)) {
      continue;
    }

    visited.add(url);

    try {
      const response = await safeFetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
      });

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        continue;
      }

      foundUrls.push(url);

      const html = await response.text();
      const $ = cheerio.load(html);

      $("a[href]").each((_, elem) => {
        const href = $(elem).attr("href");
        if (!href) return;

        try {
          const absoluteUrl = new URL(href, url);
          // Only internal links
          if (absoluteUrl.host === baseHost) {
            const cleanUrl = `${absoluteUrl.protocol}//${absoluteUrl.host}${absoluteUrl.pathname}`;
            if (!visited.has(cleanUrl) && !toVisit.includes(cleanUrl)) {
              toVisit.push(cleanUrl);
            }
          }
        } catch {
          // Invalid URL, skip
        }
      });

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
    }
  }

  return foundUrls;
}

/**
 * Check meta tags for SEO issues.
 */
export function checkMetaTags(html: string, pageUrl: string): Issue[] {
  const issues: Issue[] = [];
  const $ = cheerio.load(html);

  // Check title
  const title = $("title").text().trim();
  if (!title) {
    issues.push({
      type: "error",
      message: "Missing page title",
      url: pageUrl,
    });
  } else {
    if (title.length < 30) {
      issues.push({
        type: "warning",
        message: `Title too short (${title.length} chars, recommended 50-60)`,
        url: pageUrl,
        value: title,
      });
    } else if (title.length > 60) {
      issues.push({
        type: "warning",
        message: `Title too long (${title.length} chars, recommended 50-60)`,
        url: pageUrl,
        value: `${title.substring(0, 70)}...`,
      });
    }
  }

  // Check meta description
  const metaDesc = $('meta[name="description"]').attr("content")?.trim();
  if (!metaDesc) {
    issues.push({
      type: "error",
      message: "Missing meta description",
      url: pageUrl,
    });
  } else {
    if (metaDesc.length < 120) {
      issues.push({
        type: "warning",
        message: `Meta description too short (${metaDesc.length} chars, recommended 150-160)`,
        url: pageUrl,
      });
    } else if (metaDesc.length > 160) {
      issues.push({
        type: "warning",
        message: `Meta description too long (${metaDesc.length} chars, recommended 150-160)`,
        url: pageUrl,
      });
    }
  }

  // Check Open Graph tags
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");

  const missingOg: string[] = [];
  if (!ogTitle) missingOg.push("og:title");
  if (!ogDesc) missingOg.push("og:description");
  if (!ogImage) missingOg.push("og:image");

  if (missingOg.length > 0) {
    issues.push({
      type: "warning",
      message: `Missing Open Graph tags: ${missingOg.join(", ")}`,
      url: pageUrl,
    });
  }

  // Check canonical
  const canonical = $('link[rel="canonical"]').attr("href");
  if (!canonical) {
    issues.push({
      type: "info",
      message: "No canonical URL specified",
      url: pageUrl,
    });
  }

  return issues;
}

/**
 * Check for broken links.
 */
export async function checkLinks(
  html: string,
  pageUrl: string
): Promise<Issue[]> {
  const issues: Issue[] = [];
  const $ = cheerio.load(html);

  const links = $("a[href]").toArray();
  const urlsToCheck: string[] = [];

  for (const link of links.slice(0, 20)) {
    const href = $(link).attr("href");
    if (!href) continue;

    // Skip anchors, javascript, mailto, tel
    if (
      href.startsWith("#") ||
      href.startsWith("javascript:") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) {
      continue;
    }

    try {
      const absoluteUrl = new URL(href, pageUrl).href;
      if (!urlsToCheck.includes(absoluteUrl)) {
        urlsToCheck.push(absoluteUrl);
      }
    } catch {
      // Invalid URL
    }
  }

  // Check links concurrently
  const results = await Promise.allSettled(
    urlsToCheck.slice(0, 20).map(async (url) => {
      try {
        const response = await safeFetch(url, {
          method: "HEAD",
          headers: { "User-Agent": USER_AGENT },
          redirect: "follow",
        });
        return { url, status: response.status };
      } catch {
        // Try GET if HEAD fails
        const response = await safeFetch(url, {
          method: "GET",
          headers: { "User-Agent": USER_AGENT },
          redirect: "follow",
        });
        return { url, status: response.status };
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      // True broken links: Not Found, Gone, Server Errors
      const brokenStatuses = [404, 410, 500, 502, 504];
      if (brokenStatuses.includes(result.value.status)) {
        issues.push({
          type: "error",
          message: `Broken link (HTTP ${result.value.status})`,
          url: pageUrl,
          link: result.value.url,
        });
      }
    } else {
      issues.push({
        type: "error",
        message: `Link error: ${result.reason?.message || "Unknown error"}`,
        url: pageUrl,
      });
    }
  }

  return issues;
}

/**
 * Check heading structure for SEO issues.
 */
export function checkHeadings(html: string, pageUrl: string): Issue[] {
  const issues: Issue[] = [];
  const $ = cheerio.load(html);

  // Find all headings
  const headings: Array<{ level: number; text: string }> = [];
  for (let level = 1; level <= 6; level++) {
    $(`h${level}`).each((_, elem) => {
      headings.push({
        level,
        text: $(elem).text().trim(),
      });
    });
  }

  // Sort by document order (cheerio processes in order)
  const h1Count = headings.filter((h) => h.level === 1).length;

  if (h1Count === 0) {
    issues.push({
      type: "error",
      message: "Missing H1 heading",
      url: pageUrl,
    });
  } else if (h1Count > 1) {
    issues.push({
      type: "warning",
      message: `Multiple H1 headings (${h1Count} found)`,
      url: pageUrl,
    });
  }

  // Check heading hierarchy
  if (headings.length > 0) {
    const levelsUsed = [...new Set(headings.map((h) => h.level))].sort(
      (a, b) => a - b
    );

    // Check if starts with H1
    if (levelsUsed.length > 0 && levelsUsed[0] !== 1) {
      issues.push({
        type: "warning",
        message: `First heading is H${levelsUsed[0]}, should start with H1`,
        url: pageUrl,
      });
    }

    // Check for skipped levels
    for (let i = 0; i < levelsUsed.length - 1; i++) {
      if (levelsUsed[i + 1] - levelsUsed[i] > 1) {
        issues.push({
          type: "warning",
          message: `Skipped heading level: H${levelsUsed[i]} to H${levelsUsed[i + 1]}`,
          url: pageUrl,
        });
      }
    }
  }

  return issues;
}

/**
 * Check images for accessibility issues.
 */
export function checkImages(html: string, pageUrl: string): Issue[] {
  const issues: Issue[] = [];
  const $ = cheerio.load(html);

  const images = $("img").toArray();

  let missingAlt = 0;
  let emptyAlt = 0;
  let missingDimensions = 0;

  for (const img of images) {
    const $img = $(img);

    // Check alt attribute
    const alt = $img.attr("alt");
    if (alt === undefined) {
      missingAlt++;
    } else if (alt.trim() === "") {
      emptyAlt++;
    }

    // Check dimensions
    const width = $img.attr("width");
    const height = $img.attr("height");
    const style = $img.attr("style") || "";

    if (!width && !height && !style.includes("width") && !style.includes("height")) {
      missingDimensions++;
    }
  }

  if (missingAlt > 0) {
    issues.push({
      type: "error",
      message: `${missingAlt} image(s) missing alt attribute`,
      url: pageUrl,
    });
  }

  if (emptyAlt > 0) {
    issues.push({
      type: "info",
      message: `${emptyAlt} image(s) with empty alt (verify if decorative)`,
      url: pageUrl,
    });
  }

  if (missingDimensions > 0) {
    issues.push({
      type: "warning",
      message: `${missingDimensions} image(s) missing width/height (may cause CLS)`,
      url: pageUrl,
    });
  }

  return issues;
}

/**
 * Check performance-related SEO issues.
 */
export function checkPerformance(
  html: string,
  pageUrl: string,
  loadTime: number,
  contentLength: number,
  headers: Record<string, string>
): Issue[] {
  const issues: Issue[] = [];
  const $ = cheerio.load(html);

  // Check page size
  const sizeKb = contentLength / 1024;
  if (sizeKb > 500) {
    issues.push({
      type: "warning",
      message: `Large page size (${sizeKb.toFixed(1)} KB, recommended < 500 KB)`,
      url: pageUrl,
    });
  }

  // Check load time
  if (loadTime > 3000) {
    issues.push({
      type: "error",
      message: `Slow load time (${loadTime}ms, recommended < 3000ms)`,
      url: pageUrl,
    });
  } else if (loadTime > 1500) {
    issues.push({
      type: "warning",
      message: `Moderate load time (${loadTime}ms, recommended < 1500ms)`,
      url: pageUrl,
    });
  }

  // Count resources
  const scripts = $("script[src]").length;
  const stylesheets = $('link[rel="stylesheet"]').length;

  if (scripts > 15) {
    issues.push({
      type: "warning",
      message: `Many external scripts (${scripts}, consider bundling)`,
      url: pageUrl,
    });
  }

  if (stylesheets > 5) {
    issues.push({
      type: "warning",
      message: `Many external stylesheets (${stylesheets}, consider bundling)`,
      url: pageUrl,
    });
  }

  // Check compression
  const contentEncoding = (headers["content-encoding"] || "").toLowerCase();
  if (!contentEncoding.includes("gzip") && !contentEncoding.includes("br")) {
    if (sizeKb > 10) {
      issues.push({
        type: "info",
        message: "No compression detected (gzip/brotli recommended)",
        url: pageUrl,
      });
    }
  }

  return issues;
}
