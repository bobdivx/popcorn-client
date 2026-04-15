## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2025-02-27 - Weak PRNG Usage in Security Contexts
**Vulnerability:** Weak PRNG `Math.random()` was used for generating identifiers (`generateId`, indexer IDs, device IDs), leaving the system vulnerable to ID guessing and collision attacks.
**Learning:** `Math.random()` must not be used for persistent or security-related ID generation in this codebase.
**Prevention:** The central utility `uuid.ts` and related ID generation routines must enforce `globalThis.crypto.getRandomValues()` as the primary source of entropy, and explicitly throw an error if no secure PRNG is available to avoid fallback to weak values.
