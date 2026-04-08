## 2024-05-24 - [Implicit Trust of Backend HTML]
**Vulnerability:** XSS vulnerability in `src/components/upload/DescriptionPreview.tsx` caused by passing backend-rendered HTML directly to `dangerouslySetInnerHTML`.
**Learning:** In this codebase, HTML data explicitly marked as 'already rendered by the backend' cannot be implicitly trusted and must be manually sanitized on the frontend to prevent Cross-Site Scripting (XSS).
**Prevention:** Use `isomorphic-dompurify` instead of standard `dompurify` to sanitize HTML injected via `dangerouslySetInnerHTML` to ensure safe Server-Side Rendering (SSR) and Client-Side rendering, preventing hydration mismatches and SSR vulnerabilities.
