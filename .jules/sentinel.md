## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.

## 2025-02-18 - [Fix Plaintext Sensitive Inputs in UI]
**Vulnerability:** Several forms collected sensitive data like passkeys, API keys, and passwords using `<input type="text">` instead of `<input type="password">`.
**Learning:** React components often use `type="text"` by default for text inputs, which can inadvertently expose sensitive data like API keys or passkeys to shoulder surfing or screen-sharing.
**Prevention:** Always ensure sensitive information is masked during input using `<input type="password">`.
