## 2025-03-17 - [Fix XSS in DescriptionPreview]
**Vulnerability:** XSS vulnerability when processing user-submitted BBCode/HTML descriptions in the DescriptionPreview component, which relied only on `html.replace(/\{\}/g, "")` before using `dangerouslySetInnerHTML`.
**Learning:** Using simple regex string replacements on raw user input is not sufficient protection against XSS before passing it into dangerouslySetInnerHTML, leading to security risks where arbitrary scripts can be executed.
**Prevention:** Always use established sanitization libraries like `DOMPurify` (or `isomorphic-dompurify` for SSR compatibility) to fully cleanse unsanitized HTML input when setting `dangerouslySetInnerHTML`.
