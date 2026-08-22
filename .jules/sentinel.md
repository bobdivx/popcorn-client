## 2025-02-27 - Exposure of sensitive credentials in UI forms
**Vulnerability:** Settings and onboarding used `<input type="text">` for TMDB keys, indexer API keys, passkeys and similar secrets.
**Learning:** Visible text inputs encourage shoulder surfing, screen-share leaks, and browser autofill caching of secrets.
**Prevention:** Use `<input type="password">` with `autoComplete="off"` for API keys, tokens and passkeys. For fields such as tracker announce URLs that cannot be masked, still use `autoComplete="off"` to reduce history and suggestion leakage.
## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.
## 2024-05-18 - Insecure Randomness in UUIDs
**Vulnerability:** Weak PRNG `Math.random()` was used for generating IDs and UUIDs across multiple files (`src/lib/client/server-api/indexers.ts`, `src/api-routes-backup/v1/setup/indexers.ts`, `src/lib/utils/device-id.ts`, `src/components/torrents/MediaDetailPage/hooks/useNotifications.ts`).
**Learning:** `Math.random()` is not cryptographically secure and shouldn't be used for IDs, especially not for indexer setups and device IDs. Moreover, calling `globalThis.crypto.randomUUID()` directly fails on HTTP non-localhost sites since it requires a Secure Context.
**Prevention:** Always use the Web Crypto API (`crypto.getRandomValues()` or `crypto.randomUUID()`) through a centralized utility like `src/lib/utils/uuid.ts` that provides safe fallbacks for unsupported environments and non-secure contexts.

## 2024-05-24 - [Defense in Depth] Prevent API Key autofill by password managers
**Vulnerability:** API key fields marked as `<input type="password">` without explicit autocomplete directives (or using `autocomplete="off"`) were susceptible to being intercepted and autofilled/saved by browser password managers.
**Learning:** Browser password managers aggressively capture and fill fields with `type="password"`. Merely relying on `type="password"` to obscure the display of the key is insufficient for preventing unwanted credential retention.
**Prevention:** Always append `autoComplete="new-password"` to sensitive fields (such as API keys, tokens, passkeys) rendered as `type="password"` to definitively instruct modern password managers to ignore them.
