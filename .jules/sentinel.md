## 2024-05-24 - [Avoid `Math.random` Fallback to Default 0 UUIDs]
**Vulnerability:** Replacing `Math.random` with a fallback generator without a properly instantiated array led to generating completely deterministic, zeroed UUIDs across the app, as fallbacks returned `array[0]` equal to `0`.
**Learning:** Security updates to ID generators require extensive consideration of SSR context limits (like missing `window` or `crypto` globals). Failing safely (throwing an error) is far superior to silent failovers to zero arrays.
**Prevention:** In functions where randomness is critically required, always throw a clear Error when a secure entropy source (`crypto.randomUUID` or `crypto.getRandomValues`) isn't available. Do not let fallback loops execute with undefined dependencies.
