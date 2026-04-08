## 2024-03-28 - DescriptionPreview XSS Prevention
**Vulnerability:** The `DescriptionPreview` component was explicitly trusting potentially unsanitized HTML provided by the backend, injecting it directly via `dangerouslySetInnerHTML`.
**Learning:** Even when comments claim HTML is "already rendered by the backend", we cannot implicitly trust it. This architectural gap meant any vulnerability upstream or spoofed payload could compromise the client.
**Prevention:** Always parse and sanitize complex data formats before client-side injection. Added `isomorphic-dompurify` to ensure both safe SSR hydration and strict protection against `<script>`, `onerror`, and other malicious vectors.
