
## 2024-05-25 - [Fix XSS in Description Preview during SSR and CSR]
**Vulnerability:** The `<DescriptionPreview />` Preact component was blindly rendering user-provided HTML from the backend (or HTML parsed from user BBCode) by setting it via `dangerouslySetInnerHTML` directly in the DOM. This left a wide-open Cross-Site Scripting (XSS) vulnerability.
**Learning:** Using standard `dompurify` directly within Astro/Preact SSR can cause ReferenceErrors, hydration mismatches, and SSR vulnerabilities. `isomorphic-dompurify` must be used for safe cross-environment sanitization.
**Prevention:** Always sanitize content rendered with `dangerouslySetInnerHTML` using `isomorphic-dompurify` when rendering in isomorphic environments.
