## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2024-05-18 - [Fix Weak Random Number Generation]
**Vulnerability:** Weak random number generation using `Math.random()` for generating UUIDs, device IDs, and other identifiers.
**Learning:** `Math.random()` is cryptographically weak and predictable, which could allow attackers to guess generated IDs, potentially leading to insecure direct object references or predictable session/device tokens.
**Prevention:** Always use cryptographically secure methods like `globalThis.crypto.randomUUID()` or `globalThis.crypto.getRandomValues()` for generating sensitive IDs or tokens.
