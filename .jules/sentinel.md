## 2024-05-30 - [XSS via Astro SSR dangerouslySetInnerHTML]
**Vulnerability:** XSS possible via unsanitized backend tracker HTML or BBCode input going into `dangerouslySetInnerHTML`.
**Learning:** `dangerouslySetInnerHTML` in Astro/Preact SSR needs to be sanitized. Standard `dompurify` can cause hydration errors when used in SSR environments since it requires the DOM.
**Prevention:** Use `isomorphic-dompurify` in Preact components within Astro when sanitizing HTML destined for `dangerouslySetInnerHTML` to ensure safe string processing in both SSR and Client environments, thus preventing hydration mismatches and cross-site scripting.
