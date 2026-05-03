## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2024-05-24 - Replace weak Math.random() usage for IDs
**Vulnerability:** The application used `Math.random()` to generate IDs (such as device IDs, notification IDs, and indexer IDs in both frontend and backend routes). `Math.random()` is not cryptographically secure, which could lead to ID predictability or collisions.
**Learning:** For predictable ID generation (UUIDs, session tokens, indexer IDs), cryptographically secure random number generators (CSPRNG) like `crypto.randomUUID()` or `crypto.getRandomValues()` should be used instead of standard pseudo-random functions like `Math.random()`.
**Prevention:** Avoid using `Math.random()` for identifier generation. Always prefer `globalThis.crypto.randomUUID()` where available, or fallback to manual ID generation using `getRandomBytes` wrapping `globalThis.crypto.getRandomValues()` from the `uuid.ts` utility.
