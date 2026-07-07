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

## 2025-02-28 - Physical exposure of sensitive credentials in UI
**Vulnerability:** Sensitive credentials (like tracker passkeys, webhook URLs for Slack/Discord, and Telegram bot tokens) were using `<input type="text">` or were missing `autoComplete="off"`, exposing them to physical shoulder-surfing and potential browser autofill leakage.
**Learning:** Even if data is stored securely in the backend, rendering it as plain text in configuration UI forms creates a significant physical and operational security risk. Webhook URLs (which act as bearer tokens) must be treated with the same sensitivity as API keys.
**Prevention:** Always use `<input type="password">` with `autoComplete="off"` for any sensitive configuration field that provides authentication or authorization (including passkeys, bot tokens, and webhook URLs).
