## 2024-05-24 - [XSS Mitigation in Astro SSR]
**Vulnerability:** XSS vulnerability in `DescriptionPreview.tsx` via `dangerouslySetInnerHTML` when rendering description fields.
**Learning:** Standard `dompurify` throws a `window is not defined` error during Server Side Rendering (SSR). In an isomorphic environment like Astro + Preact, sanitization must account for both server-side builds/SSR and client-side hydration.
**Prevention:** Use `isomorphic-dompurify` instead of `dompurify` to ensure safe, cross-environment sanitization when using `dangerouslySetInnerHTML` in SSR applications.