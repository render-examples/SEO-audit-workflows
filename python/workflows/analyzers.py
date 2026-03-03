"""
SEO Analyzers

Functions for performing SEO checks on web pages.
Uses safehttpx for SSRF-protected HTTP requests.
"""

import asyncio
import re
import time
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
import safehttpx as sh
from bs4 import BeautifulSoup


# HTTP client configuration
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
HEADERS = {
    "User-Agent": "SEO-Auditor/1.0 (Render Workflows Demo)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


async def fetch_page(url: str) -> dict[str, Any]:
    """
    Fetch a page and return its content with metadata.
    Uses safehttpx for SSRF protection.
    
    Args:
        url: URL to fetch
        
    Returns:
        Dict with html, headers, load_time, content_length, or error
    """
    try:
        start_time = time.time()
        # Use safehttpx for SSRF-protected requests
        response = await sh.get(url, headers=HEADERS, timeout=TIMEOUT)
        load_time = int((time.time() - start_time) * 1000)  # ms
        
        return {
            "html": response.text,
            "headers": dict(response.headers),
            "load_time": load_time,
            "content_length": len(response.content),
            "status_code": response.status_code,
        }
    except ValueError as e:
        # safehttpx raises ValueError for blocked URLs (SSRF protection)
        return {"error": f"URL blocked: {str(e)}"}
    except httpx.TimeoutException:
        return {"error": f"Timeout fetching {url}"}
    except httpx.RequestError as e:
        return {"error": f"Request error: {str(e)}"}
    except Exception as e:
        return {"error": f"Unexpected error: {str(e)}"}


async def discover_pages(root_url: str, max_pages: int) -> list[str]:
    """
    Discover pages on a website.
    
    Tries sitemap.xml first, then falls back to crawling links.
    
    Args:
        root_url: Root URL of the website
        max_pages: Maximum pages to discover
    
    Returns:
        List of discovered page URLs
    """
    parsed = urlparse(root_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    # Try sitemap first
    sitemap_urls = await _try_sitemap(base_url, max_pages)
    if sitemap_urls:
        return sitemap_urls[:max_pages]
    
    # Fall back to crawling
    return await _crawl_links(root_url, base_url, max_pages)


async def _try_sitemap(base_url: str, max_pages: int) -> list[str]:
    """Try to get URLs from sitemap.xml."""
    sitemap_url = f"{base_url}/sitemap.xml"
    
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(sitemap_url, headers=HEADERS)
            if response.status_code != 200:
                return []
            
            # Parse sitemap XML
            soup = BeautifulSoup(response.text, "xml")
            urls = []
            
            # Handle sitemap index
            sitemaps = soup.find_all("sitemap")
            if sitemaps:
                # It's a sitemap index, get first sub-sitemap
                for sitemap in sitemaps[:1]:
                    loc = sitemap.find("loc")
                    if loc:
                        sub_urls = await _try_sitemap(loc.text.strip(), max_pages)
                        urls.extend(sub_urls)
            else:
                # Regular sitemap
                for url_tag in soup.find_all("url"):
                    loc = url_tag.find("loc")
                    if loc:
                        urls.append(loc.text.strip())
                        if len(urls) >= max_pages:
                            break
            
            return urls[:max_pages]
    except Exception:
        return []


async def _crawl_links(start_url: str, base_url: str, max_pages: int) -> list[str]:
    """Crawl internal links starting from a URL."""
    visited = set()
    to_visit = [start_url]
    found_urls = []
    
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        while to_visit and len(found_urls) < max_pages:
            url = to_visit.pop(0)
            
            if url in visited:
                continue
            
            visited.add(url)
            
            try:
                response = await client.get(url, headers=HEADERS)
                if response.status_code != 200:
                    continue
                
                content_type = response.headers.get("content-type", "")
                if "text/html" not in content_type:
                    continue
                
                found_urls.append(url)
                
                # Parse links
                soup = BeautifulSoup(response.text, "lxml")
                for link in soup.find_all("a", href=True):
                    href = link["href"]
                    absolute_url = urljoin(url, href)
                    parsed = urlparse(absolute_url)
                    
                    # Only internal links
                    if parsed.netloc == urlparse(base_url).netloc:
                        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
                        if clean_url not in visited and clean_url not in to_visit:
                            to_visit.append(clean_url)
                
                # Rate limiting
                await asyncio.sleep(0.5)
                
            except Exception:
                continue
    
    return found_urls


def _truncate(text: str, max_len: int = 100) -> str:
    """Truncate text with ellipsis."""
    if len(text) <= max_len:
        return text
    return text[:max_len - 3] + "..."


def check_meta_tags(html: str, page_url: str) -> list[dict[str, Any]]:
    """
    Check meta tags for SEO issues.
    
    Checks:
    - Title presence and length (50-60 chars ideal)
    - Meta description presence and length (150-160 chars ideal)
    - Open Graph tags presence
    - Canonical URL
    """
    issues = []
    soup = BeautifulSoup(html, "lxml")
    
    # Check title
    title = soup.find("title")
    if not title or not title.string:
        issues.append({
            "type": "error",
            "message": "Missing page title",
            "selector": "head > title",
            "element": "Add <title>Your Page Title</title> in <head>",
        })
    else:
        title_text = title.string.strip()
        title_len = len(title_text)
        if title_len < 30:
            issues.append({
                "type": "warning",
                "message": f"Title too short ({title_len} chars, recommended 50-60)",
                "selector": "head > title",
                "element": f"<title>{_truncate(title_text)}</title>",
            })
        elif title_len > 60:
            issues.append({
                "type": "warning",
                "message": f"Title too long ({title_len} chars, recommended 50-60)",
                "selector": "head > title",
                "element": f"<title>{_truncate(title_text, 70)}</title>",
            })
    
    # Check meta description
    meta_desc = soup.find("meta", attrs={"name": "description"})
    if not meta_desc or not meta_desc.get("content"):
        issues.append({
            "type": "error",
            "message": "Missing meta description",
            "selector": 'meta[name="description"]',
            "element": 'Add <meta name="description" content="..."> in <head>',
        })
    else:
        desc_text = meta_desc["content"].strip()
        desc_len = len(desc_text)
        if desc_len < 120:
            issues.append({
                "type": "warning",
                "message": f"Meta description too short ({desc_len} chars, recommended 150-160)",
                "selector": 'meta[name="description"]',
                "element": f'content="{_truncate(desc_text)}"',
            })
        elif desc_len > 160:
            issues.append({
                "type": "warning",
                "message": f"Meta description too long ({desc_len} chars, recommended 150-160)",
                "selector": 'meta[name="description"]',
                "element": f'content="{_truncate(desc_text)}"',
            })
    
    # Check Open Graph tags
    og_title = soup.find("meta", attrs={"property": "og:title"})
    og_desc = soup.find("meta", attrs={"property": "og:description"})
    og_image = soup.find("meta", attrs={"property": "og:image"})
    
    missing_og = []
    if not og_title:
        missing_og.append("og:title")
    if not og_desc:
        missing_og.append("og:description")
    if not og_image:
        missing_og.append("og:image")
    
    if missing_og:
        examples = [f'<meta property="{tag}" content="...">' for tag in missing_og]
        issues.append({
            "type": "warning",
            "message": f"Missing Open Graph tags: {', '.join(missing_og)}",
            "selector": "head",
            "element": " ".join(examples[:2]) + ("..." if len(examples) > 2 else ""),
        })
    
    # Check canonical
    canonical = soup.find("link", attrs={"rel": "canonical"})
    if not canonical:
        issues.append({
            "type": "info",
            "message": "No canonical URL specified",
            "selector": 'link[rel="canonical"]',
            "element": f'Add <link rel="canonical" href="{page_url}">',
        })
    
    return issues


async def check_links(html: str, page_url: str) -> list[dict[str, Any]]:
    """
    Check for broken links.
    
    Checks HTTP status codes for all links on the page.
    Limited to first 20 links to avoid excessive requests.
    """
    issues = []
    soup = BeautifulSoup(html, "lxml")
    
    links = soup.find_all("a", href=True)
    link_info = []  # Store (url, link_text, href, line)
    seen_urls = set()
    
    for link in links[:30]:  # Check more to find 20 unique
        href = link["href"]
        
        # Skip anchors, javascript, mailto, tel
        if href.startswith(("#", "javascript:", "mailto:", "tel:")):
            continue
        
        absolute_url = urljoin(page_url, href)
        if absolute_url not in seen_urls:
            seen_urls.add(absolute_url)
            link_text = link.get_text(strip=True) or "[no text]"
            link_info.append((absolute_url, link_text, href, link.sourceline))
            
            if len(link_info) >= 20:
                break
    
    # Check links concurrently
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        tasks = [_check_single_link(client, url) for url, _, _, _ in link_info]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for (url, link_text, href, line), result in zip(link_info, results):
            if isinstance(result, Exception):
                issues.append({
                    "type": "error",
                    "message": f"Link unreachable: {type(result).__name__}",
                    "element": f'<a href="{_truncate(href, 60)}">{_truncate(link_text, 40)}</a>',
                    "selector": f'a[href="{href[:50]}"]' if len(href) <= 50 else f'a[href^="{href[:30]}"]',
                })
            elif result in (404, 410, 500, 502, 504):
                # True broken links: Not Found, Gone, Server Errors
                issues.append({
                    "type": "error",
                    "message": f"Broken link (HTTP {result})",
                    "element": f'<a href="{_truncate(href, 60)}">{_truncate(link_text, 40)}</a> → {url}',
                    "selector": f'a[href="{href[:50]}"]' if len(href) <= 50 else f'a[href^="{href[:30]}"]',
                })
    
    return issues


async def _check_single_link(client: httpx.AsyncClient, url: str) -> int:
    """Check a single link and return status code."""
    try:
        response = await client.head(url, headers=HEADERS)
        return response.status_code
    except Exception:
        # Try GET if HEAD fails
        try:
            response = await client.get(url, headers=HEADERS)
            return response.status_code
        except Exception as e:
            raise e


def check_headings(html: str, page_url: str) -> list[dict[str, Any]]:
    """
    Check heading structure for SEO issues.
    
    Checks:
    - Presence of H1
    - Multiple H1s
    - Heading hierarchy (no skipped levels)
    """
    issues = []
    soup = BeautifulSoup(html, "lxml")
    
    # Find all headings with their text and line numbers
    headings = []
    for level in range(1, 7):
        for h in soup.find_all(f"h{level}"):
            text = h.get_text(strip=True)
            headings.append((level, text, h, h.sourceline))
    
    # Check for H1
    h1_tags = [(level, text, h, line) for level, text, h, line in headings if level == 1]
    h1_count = len(h1_tags)
    
    if h1_count == 0:
        issues.append({
            "type": "error",
            "message": "Missing H1 heading",
            "selector": "h1",
            "element": "Add an <h1> tag with your main page title",
        })
    elif h1_count > 1:
        # Show the multiple H1s with line numbers
        h1_texts = [f"<h1>{_truncate(text, 40)}</h1>" for _, text, _, _ in h1_tags[:3]]
        issues.append({
            "type": "warning",
            "message": f"Multiple H1 headings ({h1_count} found, should be 1)",
            "selector": "h1",
            "element": " | ".join(h1_texts),
        })
    
    # Check heading hierarchy
    if headings:
        levels_used = sorted(set(level for level, _, _, _ in headings))
        
        # Check if starts with H1
        if levels_used and levels_used[0] != 1:
            first_heading = headings[0]
            issues.append({
                "type": "warning",
                "message": f"First heading is H{levels_used[0]}, should start with H1",
                "selector": f"h{levels_used[0]}",
                "element": f"<h{first_heading[0]}>{_truncate(first_heading[1], 50)}</h{first_heading[0]}>",
            })
        
        # Check for skipped levels
        for i in range(len(levels_used) - 1):
            if levels_used[i + 1] - levels_used[i] > 1:
                # Find the first occurrence of the skip
                skip_from = levels_used[i]
                skip_to = levels_used[i + 1]
                
                # Find example of the skip
                example = None
                found_from = False
                for level, text, _, _ in headings:
                    if level == skip_from:
                        found_from = True
                    elif found_from and level == skip_to:
                        example = f"<h{skip_to}>{_truncate(text, 40)}</h{skip_to}>"
                        break
                
                issues.append({
                    "type": "warning",
                    "message": f"Skipped heading level: H{skip_from} to H{skip_to}",
                    "selector": f"h{skip_to}",
                    "element": example or f"Missing <h{skip_from + 1}> between H{skip_from} and H{skip_to}",
                })
    
    return issues


def check_images(html: str, page_url: str) -> list[dict[str, Any]]:
    """
    Check images for accessibility issues.
    
    Checks:
    - Missing alt attributes
    - Empty alt attributes (when not decorative)
    - Images without width/height (CLS issues)
    """
    issues = []
    soup = BeautifulSoup(html, "lxml")
    
    images = soup.find_all("img")
    
    missing_alt_imgs = []  # (src_display, line)
    empty_alt_imgs = []
    missing_dim_imgs = []
    
    for img in images:
        src = img.get("src", "unknown")
        src_display = _truncate(src, 60)
        line = img.sourceline
        
        # Check alt attribute
        if not img.has_attr("alt"):
            missing_alt_imgs.append((src_display, line))
        elif img["alt"].strip() == "":
            empty_alt_imgs.append((src_display, line))
        
        # Check dimensions (helps prevent CLS)
        if not img.get("width") and not img.get("height"):
            style = img.get("style", "")
            if "width" not in style and "height" not in style:
                missing_dim_imgs.append((src_display, line))
    
    if missing_alt_imgs:
        # Show up to 3 examples
        examples = [src for src, _ in missing_alt_imgs[:3]]
        remaining = len(missing_alt_imgs) - 3
        issues.append({
            "type": "error",
            "message": f"{len(missing_alt_imgs)} image(s) missing alt attribute",
            "selector": "img:not([alt])",
            "element": " | ".join(examples) + (f" (+{remaining} more)" if remaining > 0 else ""),
        })
    
    if empty_alt_imgs:
        examples = [src for src, _ in empty_alt_imgs[:3]]
        remaining = len(empty_alt_imgs) - 3
        issues.append({
            "type": "info",
            "message": f"{len(empty_alt_imgs)} image(s) with empty alt (verify if decorative)",
            "selector": 'img[alt=""]',
            "element": " | ".join(examples) + (f" (+{remaining} more)" if remaining > 0 else ""),
        })
    
    if missing_dim_imgs:
        examples = [src for src, _ in missing_dim_imgs[:3]]
        remaining = len(missing_dim_imgs) - 3
        issues.append({
            "type": "warning",
            "message": f"{len(missing_dim_imgs)} image(s) missing width/height (may cause layout shift)",
            "selector": "img:not([width]):not([height])",
            "element": " | ".join(examples) + (f" (+{remaining} more)" if remaining > 0 else ""),
        })
    
    return issues


def check_performance(
    html: str,
    page_url: str,
    load_time: int,
    content_length: int,
    headers: dict[str, str],
) -> list[dict[str, Any]]:
    """
    Check performance-related SEO issues.
    
    Checks:
    - Page size
    - Load time
    - Resource count (scripts, stylesheets)
    - Compression
    """
    issues = []
    soup = BeautifulSoup(html, "lxml")
    
    # Check page size
    size_kb = content_length / 1024
    if size_kb > 500:
        issues.append({
            "type": "warning",
            "message": f"Large page size ({size_kb:.1f} KB, recommended < 500 KB)",
            "element": f"HTML response body: {size_kb:.1f} KB (consider code splitting or lazy loading)",
        })
    
    # Check load time
    if load_time > 3000:
        issues.append({
            "type": "error",
            "message": f"Slow load time ({load_time}ms, recommended < 3000ms)",
            "element": f"Time to first byte + download: {load_time}ms",
        })
    elif load_time > 1500:
        issues.append({
            "type": "warning",
            "message": f"Moderate load time ({load_time}ms, recommended < 1500ms)",
            "element": f"Time to first byte + download: {load_time}ms",
        })
    
    # Count and list resources
    scripts = soup.find_all("script", src=True)
    stylesheets = soup.find_all("link", rel="stylesheet")
    
    if len(scripts) > 15:
        script_srcs = [_truncate(s.get("src", ""), 50) for s in scripts[:5]]
        issues.append({
            "type": "warning",
            "message": f"Many external scripts ({len(scripts)}, consider bundling)",
            "selector": "script[src]",
            "element": " | ".join(script_srcs) + (f" (+{len(scripts) - 5} more)" if len(scripts) > 5 else ""),
        })
    
    if len(stylesheets) > 5:
        css_hrefs = [_truncate(s.get("href", ""), 50) for s in stylesheets[:3]]
        issues.append({
            "type": "warning",
            "message": f"Many external stylesheets ({len(stylesheets)}, consider bundling)",
            "selector": 'link[rel="stylesheet"]',
            "element": " | ".join(css_hrefs) + (f" (+{len(stylesheets) - 3} more)" if len(stylesheets) > 3 else ""),
        })
    
    # Check compression
    content_encoding = headers.get("content-encoding", "").lower()
    if "gzip" not in content_encoding and "br" not in content_encoding:
        if size_kb > 10:
            issues.append({
                "type": "info",
                "message": "No compression detected (gzip/brotli recommended)",
                "element": f"Content-Encoding header is missing. Enable compression on your server to reduce {size_kb:.1f} KB payload.",
            })
    
    return issues
