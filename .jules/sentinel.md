## 2023-10-27 - [XSS in Preact dangerouslySetInnerHTML]
**Vulnerability:** Raw HTML from the backend and converted BBCode was injected directly into the DOM using `dangerouslySetInnerHTML` in `src/components/upload/DescriptionPreview.tsx` without prior sanitization. This allowed Cross-Site Scripting (XSS).
**Learning:** Even data explicitly labeled as "rendered by the backend" shouldn't be trusted. Furthermore, the Astro/Preact stack requires `isomorphic-dompurify` to prevent hydration mismatches and SSR crashes when sanitizing HTML.
**Prevention:** Always sanitize any untrusted or third-party HTML string using `isomorphic-dompurify`'s `DOMPurify.sanitize()` before passing it to `dangerouslySetInnerHTML`.
