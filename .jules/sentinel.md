
## 2024-05-30 - [Sanitize XSS in DescriptionPreview]
**Vulnerability:** XSS vulnerability in `DescriptionPreview.tsx` via `dangerouslySetInnerHTML`. The function `sanitizePreviewHtml` only removed `{}` placeholders but did not sanitize the HTML to prevent execution of malicious scripts.
**Learning:** Data marked as "already rendered by the backend" shouldn't be trusted inherently. It is essential to sanitize raw HTML before setting it with `dangerouslySetInnerHTML`.
**Prevention:** Use `isomorphic-dompurify` to sanitize HTML output in the frontend before rendering.
