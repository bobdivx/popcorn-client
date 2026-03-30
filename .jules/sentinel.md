## 2025-02-23 - Prevent XSS in BBCode/HTML rendering

**Vulnerability:** The `DescriptionPreview.tsx` component used `dangerouslySetInnerHTML` directly on user-provided HTML and BBCode-to-HTML converted strings, only stripping `{}` characters. This left the application vulnerable to Cross-Site Scripting (XSS) via malicious tags or attributes (e.g., `<img src=x onerror=alert(1)>`).
**Learning:** Even when using a custom BBCode parser or receiving "already rendered" HTML from a backend, the frontend must explicitly sanitize the final HTML string before injection. Relying on the backend or parser to output safe HTML is insufficient. `isomorphic-dompurify` must be used in isomorphic apps (Astro/Preact) to prevent hydration mismatches and SSR vulnerabilities.
**Prevention:** Always wrap `dangerouslySetInnerHTML` inputs with `DOMPurify.sanitize()`. For isomorphic environments, use `isomorphic-dompurify`.
