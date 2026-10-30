/**
 * Microsoft Store edition: first launch without any online account.
 *
 * Microsoft certification (policy 10.3.1 "App is testable") rejects an app whose core features
 * require an account the tester cannot create. The desktop Store edition embeds its own
 * popcorn-server (127.0.0.1): when that server has no user yet, it accepts the creation of the
 * first account (local administrator) without any token. This module lets the setup wizard
 * offer that path instead of forcing a popcornn.app cloud account.
 *
 * Scope: `PUBLIC_DISTRIBUTION=msstore` builds only — other editions keep the current flow.
 */
import { STORE_MODULES_ENABLED } from '../distribution';
import type { SetupStatus } from '../client/types';

export const LOCAL_ACCOUNT_MIN_PASSWORD_LENGTH = 8;

/** Local-account first launch (and skippable TMDB step) only exist in the Microsoft Store edition. */
export function isLocalAccountSetupEnabled(): boolean {
  return STORE_MODULES_ENABLED;
}

/**
 * Offer the local account only when the (embedded) server answered and has no user yet:
 * the server refuses any self-registration once a first account exists.
 */
export function shouldOfferLocalAccount(status: SetupStatus | null | undefined, enabled = isLocalAccountSetupEnabled()): boolean {
  if (!enabled || !status) return false;
  if (status.backendReachable === false) return false;
  return status.hasUsers === false;
}

export type LocalAccountFormError = 'invalidEmail' | 'passwordTooShort' | 'passwordMismatch';

/** Client-side validation of the local account form (returns an i18n key suffix, or null). */
export function validateLocalAccountForm(email: string, password: string, confirm: string): LocalAccountFormError | null {
  const trimmed = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'invalidEmail';
  if (password.length < LOCAL_ACCOUNT_MIN_PASSWORD_LENGTH) return 'passwordTooShort';
  if (password !== confirm) return 'passwordMismatch';
  return null;
}

type ApiResult = { success: boolean; message?: string; error?: string };

export interface LocalAccountApi {
  register(email: string, password: string): Promise<ApiResult>;
  login(email: string, password: string): Promise<ApiResult>;
}

export type CreateLocalAccountResult = { ok: true } | { ok: false; message: string };

/**
 * Creates the first account on the local server, then signs in with it (server session token).
 * `register` may create the user and still throw while generating client tokens: in that case
 * the following `login` finishes the job.
 */
export async function createLocalAccount(api: LocalAccountApi, email: string, password: string): Promise<CreateLocalAccountResult> {
  const cleanEmail = email.trim();
  let registerError: string | null = null;
  try {
    const reg = await api.register(cleanEmail, password);
    if (!reg.success) {
      return { ok: false, message: reg.message || reg.error || 'Registration failed' };
    }
  } catch (err) {
    registerError = err instanceof Error ? err.message : String(err);
  }
  try {
    const login = await api.login(cleanEmail, password);
    if (!login.success) {
      return { ok: false, message: login.message || login.error || registerError || 'Sign-in failed' };
    }
  } catch (err) {
    return { ok: false, message: registerError || (err instanceof Error ? err.message : String(err)) };
  }
  return { ok: true };
}
