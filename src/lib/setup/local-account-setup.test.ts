import { describe, expect, it, vi } from 'vitest';
import {
  createLocalAccount,
  shouldOfferLocalAccount,
  validateLocalAccountForm,
} from './local-account-setup';
import type { SetupStatus } from '../client/types';

const status = (over: Partial<SetupStatus>): SetupStatus => ({
  needsSetup: true,
  hasUsers: false,
  hasIndexers: false,
  hasTmdbKey: false,
  hasTorrents: false,
  backendReachable: true,
  ...over,
});

describe('shouldOfferLocalAccount', () => {
  it('offers the local account on a fresh embedded server (msstore)', () => {
    expect(shouldOfferLocalAccount(status({}), true)).toBe(true);
  });
  it('never offers it outside the Microsoft Store edition', () => {
    expect(shouldOfferLocalAccount(status({}), false)).toBe(false);
  });
  it('does not offer it once the server already has a user', () => {
    expect(shouldOfferLocalAccount(status({ hasUsers: true, needsSetup: false }), true)).toBe(false);
  });
  it('does not offer it when the server is unreachable or status unknown', () => {
    expect(shouldOfferLocalAccount(status({ backendReachable: false }), true)).toBe(false);
    expect(shouldOfferLocalAccount(null, true)).toBe(false);
    expect(shouldOfferLocalAccount(status({ hasUsers: undefined }), true)).toBe(false);
  });
});

describe('validateLocalAccountForm', () => {
  it('accepts a valid form', () => {
    expect(validateLocalAccountForm(' tester@example.com ', 'abcdefgh', 'abcdefgh')).toBeNull();
  });
  it('rejects bad email, short or mismatched password', () => {
    expect(validateLocalAccountForm('tester', 'abcdefgh', 'abcdefgh')).toBe('invalidEmail');
    expect(validateLocalAccountForm('t@example.com', 'short', 'short')).toBe('passwordTooShort');
    expect(validateLocalAccountForm('t@example.com', 'abcdefgh', 'abcdefgX')).toBe('passwordMismatch');
  });
});

describe('createLocalAccount', () => {
  it('registers then signs in on the local server', async () => {
    const api = {
      register: vi.fn().mockResolvedValue({ success: true }),
      login: vi.fn().mockResolvedValue({ success: true }),
    };
    await expect(createLocalAccount(api, ' tester@example.com ', 'abcdefgh')).resolves.toEqual({ ok: true });
    expect(api.register).toHaveBeenCalledWith('tester@example.com', 'abcdefgh');
    expect(api.login).toHaveBeenCalledWith('tester@example.com', 'abcdefgh');
  });
  it('stops when the server refuses the registration', async () => {
    const api = {
      register: vi.fn().mockResolvedValue({ success: false, message: 'Registration closed' }),
      login: vi.fn(),
    };
    await expect(createLocalAccount(api, 't@example.com', 'abcdefgh')).resolves.toEqual({ ok: false, message: 'Registration closed' });
    expect(api.login).not.toHaveBeenCalled();
  });
  it('still signs in when register created the user but threw afterwards', async () => {
    const api = {
      register: vi.fn().mockRejectedValue(new Error('token generation')),
      login: vi.fn().mockResolvedValue({ success: true }),
    };
    await expect(createLocalAccount(api, 't@example.com', 'abcdefgh')).resolves.toEqual({ ok: true });
  });
  it('reports a sign-in failure', async () => {
    const api = {
      register: vi.fn().mockResolvedValue({ success: true }),
      login: vi.fn().mockResolvedValue({ success: false, message: 'Invalid credentials' }),
    };
    await expect(createLocalAccount(api, 't@example.com', 'abcdefgh')).resolves.toEqual({ ok: false, message: 'Invalid credentials' });
  });
});
