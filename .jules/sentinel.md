## 2025-03-31 - Fix XSS vulnerability in DescriptionPreview
**Vulnerability:** Raw HTML strings (both from backend and converted from BBCode) were being directly rendered in the frontend via `dangerouslySetInnerHTML` in `src/components/upload/DescriptionPreview.tsx` without prior sanitization.
**Learning:** Even though descriptions might come from the backend or an internal converter, they should not be implicitly trusted when rendering on the client side, especially when `dangerouslySetInnerHTML` is used.
**Prevention:** Always use a proper sanitizer like `isomorphic-dompurify` (which works both in SSR and CSR) before injecting HTML via `dangerouslySetInnerHTML`.
