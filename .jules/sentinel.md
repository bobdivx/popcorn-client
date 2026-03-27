## 2024-05-24 - [Title]
**Vulnerability:** [What you found]
**Learning:** [Why it existed]
**Prevention:** [How to avoid next time]

## 2024-05-24 - [HIGH] Sanitize user input to prevent XSS
**Vulnerability:** Raw HTML strings (both from the API and parsed from BBCode) were being passed directly into `dangerouslySetInnerHTML` in `src/components/upload/DescriptionPreview.tsx` without sanitization. This allowed execution of arbitrary JavaScript through payload such as `<img src="x" onerror="...">`.
**Learning:** Even if data is assumed to be safe or converted from a limited markup language like BBCode, directly rendering it into the DOM without sanitization poses a severe Cross-Site Scripting (XSS) risk. Additionally, in an isomorphic environment (like Astro with SSR), standard `dompurify` can cause hydration errors or fail on the server; `isomorphic-dompurify` must be used.
**Prevention:** Always wrap variables passed into `dangerouslySetInnerHTML` with `DOMPurify.sanitize()` (using `isomorphic-dompurify`). Do not trust API data or client-parsed HTML from arbitrary user inputs.
