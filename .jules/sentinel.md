## 2024-04-06 - [XSS in Preact dangerouslySetInnerHTML via Backend Trust]
**Vulnerability:** The frontend application implicitly trusted HTML data originating from the backend (specifically `html` parameters in `DescriptionPreview.tsx`) and passed it directly to `dangerouslySetInnerHTML` with only rudimentary bracket substitution `replace(/\{\}/g, "")`.
**Learning:** Even if data is marked as "already rendered by the backend", the frontend layer must maintain a zero-trust policy. Bypassing standard React/Preact escaping via `dangerouslySetInnerHTML` requires explicit client-side sanitization.
**Prevention:** Always use `isomorphic-dompurify` (for SSR compatibility) to wrap any string passed into `dangerouslySetInnerHTML`, regardless of the data source.
