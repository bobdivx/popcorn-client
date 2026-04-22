## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2025-02-27 - Predictable Persistent Device IDs
**Vulnerability:** The device ID generator (`getOrCreateDeviceId` in `src/lib/utils/device-id.ts`) relied on `Math.random()` to generate unique identifiers that are stored persistently in localStorage, which is cryptographically insecure and predictable.
**Learning:** For security and privacy, device tracking IDs and similar persistent values should always be generated using cryptographically secure sources. The application already provides centralized utilities (like `generateId` using the Web Crypto API) that should be consistently utilized.
**Prevention:** Always use `globalThis.crypto.getRandomValues()` or the project's wrapper functions (e.g., `generateId` from `uuid.ts`) instead of `Math.random()` when creating identifiers that persist or could be used for authorization/tracking.
