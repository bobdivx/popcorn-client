## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2025-02-23 - Insecure UUID Generation via Math.random()
**Vulnerability:** Weak random number generation (`Math.random()`) was being used to generate UUIDs in `src/api-routes-backup/v1/setup/indexers.ts` and `src/lib/client/server-api/indexers.ts`. `Math.random()` is not cryptographically secure and can lead to predictable IDs.
**Learning:** Even for non-sensitive IDs, predictable values can lead to enumeration attacks or collision issues. It's safer to always use a standard cryptographically secure UUID function.
**Prevention:** Always use `globalThis.crypto.randomUUID()` (or a secure fallback wrapper) for generating UUIDs instead of relying on `Math.random()` to build them manually. Centralize this logic in a utility function (e.g., `src/lib/utils/uuid.ts`).
