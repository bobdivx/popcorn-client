## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2025-02-27 - Insecure PRNG Fallbacks and Predictable Identifiers
**Vulnerability:** Weak PRNG (`Math.random()`) was being used as a fallback for UUIDs and persistent `popcorn_device_id`s, as well as in manual v4 UUID logic. This introduces predictable identifier vulnerabilities.
**Learning:** `Math.random()` provides zero cryptographic security. Relying on it as a fallback creates a false sense of security and predictable deterministic outputs.
**Prevention:** Never fallback to `Math.random()` when cryptographic security is expected. The project uses `generateId()` from `src/lib/utils/uuid.ts`. If no secure source (like `globalThis.crypto.getRandomValues` or `require('crypto').randomBytes`) is available, the application must fail safely and throw an error rather than falling back to weak values.
