## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2024-05-18 - [HIGH] Hardcoded input visibility on secrets
**Vulnerability:** API keys and passkeys were displayed in plain text fields (`<input type="text">`), exposing sensitive credentials to shoulder-surfing.
**Learning:** React/Preact inputs handling tokens/keys should always use `type="password"`.
**Prevention:** Use `type="password"` for all tokens, api keys, and passkeys in frontend forms to prevent physical security exposures like shoulder-surfing.
