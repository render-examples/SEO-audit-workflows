import { describe, it, expect } from "vitest";
import {
  checkMetaTags,
  checkHeadings,
  checkImages,
  checkPerformance,
} from "./analyzers.js";

const TEST_URL = "https://example.com/test";

describe("checkMetaTags", () => {
  it("reports missing title", () => {
    const html = "<html><head></head><body></body></html>";
    const issues = checkMetaTags(html, TEST_URL);
    expect(issues.some((i) => i.message === "Missing page title")).toBe(true);
  });

  it("reports title too short", () => {
    const html = "<html><head><title>Short</title></head></html>";
    const issues = checkMetaTags(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("Title too short"))).toBe(true);
  });

  it("reports title too long", () => {
    const longTitle = "A".repeat(70);
    const html = `<html><head><title>${longTitle}</title></head></html>`;
    const issues = checkMetaTags(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("Title too long"))).toBe(true);
  });

  it("accepts good title length", () => {
    const goodTitle = "A".repeat(55); // 50-60 is recommended
    const html = `<html><head><title>${goodTitle}</title><meta name="description" content="${"B".repeat(155)}"></head></html>`;
    const issues = checkMetaTags(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("Title too"))).toBe(false);
  });

  it("reports missing meta description", () => {
    const html = "<html><head><title>Good Title Here</title></head></html>";
    const issues = checkMetaTags(html, TEST_URL);
    expect(issues.some((i) => i.message === "Missing meta description")).toBe(true);
  });

  it("reports missing Open Graph tags", () => {
    const html = "<html><head></head></html>";
    const issues = checkMetaTags(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("Missing Open Graph tags"))).toBe(true);
  });

  it("reports missing canonical", () => {
    const html = "<html><head></head></html>";
    const issues = checkMetaTags(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("No canonical URL"))).toBe(true);
  });

  it("passes with complete meta tags", () => {
    const html = `
      <html><head>
        <title>Perfect Title Length Here Now</title>
        <meta name="description" content="${"A".repeat(155)}">
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Desc">
        <meta property="og:image" content="https://example.com/img.png">
        <link rel="canonical" href="https://example.com/test">
      </head></html>
    `;
    const issues = checkMetaTags(html, TEST_URL);
    // Should only have no errors (may have warnings about title length)
    expect(issues.filter((i) => i.type === "error")).toHaveLength(0);
  });
});

describe("checkHeadings", () => {
  it("reports missing H1", () => {
    const html = "<html><body><h2>Subtitle</h2></body></html>";
    const issues = checkHeadings(html, TEST_URL);
    expect(issues.some((i) => i.message === "Missing H1 heading")).toBe(true);
  });

  it("reports multiple H1s", () => {
    const html = "<html><body><h1>First</h1><h1>Second</h1></body></html>";
    const issues = checkHeadings(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("Multiple H1 headings"))).toBe(true);
  });

  it("reports skipped heading levels", () => {
    const html = "<html><body><h1>Title</h1><h3>Skipped H2</h3></body></html>";
    const issues = checkHeadings(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("Skipped heading level"))).toBe(true);
  });

  it("reports first heading not H1", () => {
    const html = "<html><body><h2>Starts with H2</h2></body></html>";
    const issues = checkHeadings(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("should start with H1"))).toBe(true);
  });

  it("passes with proper heading structure", () => {
    const html = "<html><body><h1>Title</h1><h2>Section</h2><h3>Subsection</h3></body></html>";
    const issues = checkHeadings(html, TEST_URL);
    expect(issues).toHaveLength(0);
  });
});

describe("checkImages", () => {
  it("reports images missing alt attribute", () => {
    const html = '<html><body><img src="test.jpg"></body></html>';
    const issues = checkImages(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("missing alt attribute"))).toBe(true);
  });

  it("reports images with empty alt", () => {
    const html = '<html><body><img src="test.jpg" alt=""></body></html>';
    const issues = checkImages(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("empty alt"))).toBe(true);
  });

  it("reports images missing dimensions", () => {
    const html = '<html><body><img src="test.jpg" alt="Test"></body></html>';
    const issues = checkImages(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("missing width/height"))).toBe(true);
  });

  it("passes with proper image attributes", () => {
    const html = '<html><body><img src="test.jpg" alt="Description" width="100" height="100"></body></html>';
    const issues = checkImages(html, TEST_URL);
    expect(issues).toHaveLength(0);
  });

  it("accepts dimensions in style attribute", () => {
    const html = '<html><body><img src="test.jpg" alt="Test" style="width: 100px; height: 100px;"></body></html>';
    const issues = checkImages(html, TEST_URL);
    expect(issues.some((i) => i.message.includes("missing width/height"))).toBe(false);
  });
});

describe("checkPerformance", () => {
  const smallHtml = "<html><body>Small page</body></html>";
  const defaultHeaders = {};

  it("reports large page size", () => {
    const issues = checkPerformance(smallHtml, TEST_URL, 100, 600 * 1024, defaultHeaders);
    expect(issues.some((i) => i.message.includes("Large page size"))).toBe(true);
  });

  it("reports slow load time (error)", () => {
    const issues = checkPerformance(smallHtml, TEST_URL, 4000, 1000, defaultHeaders);
    expect(issues.some((i) => i.type === "error" && i.message.includes("Slow load time"))).toBe(true);
  });

  it("reports moderate load time (warning)", () => {
    const issues = checkPerformance(smallHtml, TEST_URL, 2000, 1000, defaultHeaders);
    expect(issues.some((i) => i.type === "warning" && i.message.includes("Moderate load time"))).toBe(true);
  });

  it("reports many external scripts", () => {
    const scripts = Array(20).fill('<script src="app.js"></script>').join("");
    const html = `<html><head>${scripts}</head></html>`;
    const issues = checkPerformance(html, TEST_URL, 100, 1000, defaultHeaders);
    expect(issues.some((i) => i.message.includes("Many external scripts"))).toBe(true);
  });

  it("reports many stylesheets", () => {
    const styles = Array(10).fill('<link rel="stylesheet" href="style.css">').join("");
    const html = `<html><head>${styles}</head></html>`;
    const issues = checkPerformance(html, TEST_URL, 100, 1000, defaultHeaders);
    expect(issues.some((i) => i.message.includes("Many external stylesheets"))).toBe(true);
  });

  it("reports missing compression for large pages", () => {
    const issues = checkPerformance(smallHtml, TEST_URL, 100, 50 * 1024, {});
    expect(issues.some((i) => i.message.includes("No compression detected"))).toBe(true);
  });

  it("does not report compression for small pages", () => {
    const issues = checkPerformance(smallHtml, TEST_URL, 100, 5 * 1024, {});
    expect(issues.some((i) => i.message.includes("No compression detected"))).toBe(false);
  });

  it("passes with gzip compression", () => {
    const issues = checkPerformance(smallHtml, TEST_URL, 100, 50 * 1024, {
      "content-encoding": "gzip",
    });
    expect(issues.some((i) => i.message.includes("No compression detected"))).toBe(false);
  });

  it("passes with good performance", () => {
    const issues = checkPerformance(smallHtml, TEST_URL, 500, 10 * 1024, {
      "content-encoding": "br",
    });
    expect(issues).toHaveLength(0);
  });
});
