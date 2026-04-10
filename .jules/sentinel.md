## 2025-02-09 - [HIGH] Prevent XSS in Server-Rendered HTML
**Vulnerability:** HTML strings marked as "already rendered by the backend" (e.g., in DescriptionPreview) were being injected using `dangerouslySetInnerHTML` with minimal sanitization (`replace(/\{\}/g, '')`), creating an XSS vulnerability.
**Learning:** HTML data explicitly marked as 'already rendered by the backend' must not be implicitly trusted by the frontend. Inomorphic rendering contexts require sanitizers that operate uniformly during both Server-Side Rendering (SSR) and Client-Side rendering to prevent hydration mismatches and SSR vulnerabilities.
**Prevention:** The frontend must independently sanitize all external HTML using `isomorphic-dompurify` before injecting it via `dangerouslySetInnerHTML`.
