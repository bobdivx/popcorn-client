## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.
## 2026-04-28 - [Fix weak random number generation for persistent IDs]
**Vulnerability:** Weak random number generation using Math.random() for persistent device identifiers.
**Learning:** Math.random() is not cryptographically secure and can lead to predictable IDs and potential impersonation risks. It's crucial to use robust, secure ID generation mechanisms (Web Crypto API) for any persistent system-level identifiers.
**Prevention:** Always use the centralized getOrCreateDeviceId() or imported generateId() utility which wraps Web Crypto/Node.js crypto APIs instead of Math.random() when generating random strings or IDs.
