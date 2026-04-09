
## 2024-04-09 - [SSR-Compatible XSS Prevention via isomorphic-dompurify]
**Vulnerability:** Found un-sanitized rendering of backend HTML descriptions and converted BBCode using `dangerouslySetInnerHTML` in `DescriptionPreview.tsx`.
**Learning:** In isomorphic environments like Astro/Preact, using standard `dompurify` can cause hydration errors or fail during SSR. The codebase requires `isomorphic-dompurify` to ensure security is enforced securely on both the server and the client side. HTML marked as "already rendered by the backend" must still be treated as untrusted and sanitized on the client.
**Prevention:** Always use `isomorphic-dompurify` in conjunction with `dangerouslySetInnerHTML` in Preact components, regardless of whether the backend claims the data is pre-rendered or safe.
