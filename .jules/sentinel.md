## 2025-02-27 - Implicit Trust of Backend-Rendered HTML
**Vulnerability:** The `DescriptionPreview` component was implicitly trusting and rendering raw HTML injected by the backend (e.g., descriptions) via `dangerouslySetInnerHTML` without any prior validation or sanitization, introducing a critical Cross-Site Scripting (XSS) vulnerability.
**Learning:** In this codebase, data described as 'already rendered by the backend' cannot be implicitly trusted for safety on the frontend, especially if it may contain untrusted user input from an upstream source (e.g., tracker descriptions).
**Prevention:** Always use `isomorphic-dompurify` to sanitize backend-provided HTML content on the frontend before injecting it with `dangerouslySetInnerHTML`. The isomorphic variant guarantees safety across both Client-Side Rendering and Server-Side Rendering (SSR) environments, preventing hydration mismatches and SSR vulnerabilities.
## 2025-02-27 - Exposed sensitive data in input fields
**Vulnerability:** Sensitive API keys and passwords were shown in plain text across several React components used for settings, exposing them to physical shoulder-surfing or accidental screen-sharing.
**Learning:** Even if data is intended for the local user, secrets like API keys and passwords must always use '<input type="password">' in frontend UI components.
**Prevention:** Always enforce the use of '<input type="password">' for any sensitive credential field in configuration panels or forms.
