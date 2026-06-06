## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.
## 2024-05-18 - Insecure Randomness in UUIDs
**Vulnerability:** Weak PRNG `Math.random()` was used for generating IDs and UUIDs across multiple files (`src/lib/client/server-api/indexers.ts`, `src/api-routes-backup/v1/setup/indexers.ts`, `src/lib/utils/device-id.ts`, `src/components/torrents/MediaDetailPage/hooks/useNotifications.ts`).
**Learning:** `Math.random()` is not cryptographically secure and shouldn't be used for IDs, especially not for indexer setups and device IDs. Moreover, calling `globalThis.crypto.randomUUID()` directly fails on HTTP non-localhost sites since it requires a Secure Context.
**Prevention:** Always use the Web Crypto API (`crypto.getRandomValues()` or `crypto.randomUUID()`) through a centralized utility like `src/lib/utils/uuid.ts` that provides safe fallbacks for unsupported environments and non-secure contexts.

## 2024-05-28 - Insecure Credential Input Rendering
**Vulnerability:** Sensitive credentials (TMDB API keys, Tracker Passkeys, and C411 API keys) were being rendered in `<input type="text">` fields across multiple settings and setup wizard components.
**Learning:** Displaying sensitive authentication tokens in plain text exposes users to physical security risks, such as shoulder-surfing or accidental leakage during screen sharing. Browser autofill might also inadvertently store these as non-password form data.
**Prevention:** Always use `<input type="password">` with `autoComplete="off"` for any fields that handle API keys, passkeys, or other sensitive authentication credentials to ensure they are visually masked and not cached improperly by the browser.
