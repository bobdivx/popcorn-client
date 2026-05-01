## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2024-05-01 - Plaintext Secrets Input Vulnerability
**Vulnerability:** Several settings components (`UploadAssistantPanel`, `UploadTrackersManagerPanel`, `TmdbConfig`) use `<input type="text">` for sensitive data like API keys and Passkeys.
**Learning:** This is a physical security exposure (shoulder-surfing) and screen-sharing risk.
**Prevention:** Always use `<input type="password">` for any input fields that handle sensitive tokens, keys, passwords, or passkeys.
