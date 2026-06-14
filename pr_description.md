🚨 Severity: MEDIUM
💡 Vulnerability: The TMDB API Key in `src/components/setup/steps/TmdbStep.tsx` was rendered as `<input type="text">`, exposing the sensitive credentials.
🎯 Impact: It exposes sensitive API credentials to shoulder-surfing attacks and potentially allows the browser to cache and leak the key via autofill history.
🔧 Fix: Changed the input field to `type="password"` with `autoComplete="off"` to ensure the key is masked on screen and prevented from being saved in browser autocomplete history.
✅ Verification: Ensure the setup step for the TMDB key correctly masks the input, and browser dev tools show `autocomplete="off"` is set. Tests and build pass.
