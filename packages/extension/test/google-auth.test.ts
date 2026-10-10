import { describe, expect, it } from 'vitest';
import { authorizeGoogle, buildAuthUrl, readAccessToken, readGoogleEmail, type TokenStore } from '../src/google-auth.ts';

const clientId = 'client-id.apps.googleusercontent.com';
const redirectUri = 'https://abcdefghijklmnop.chromiumapp.org/';

function memoryTokens(initial?: { accessToken: string; expiresAt: number }): TokenStore & {
  saved: Array<{ accessToken: string; expiresAt: number }>;
} {
  const saved: Array<{ accessToken: string; expiresAt: number }> = [];
  let current = initial ?? null;
  return {
    saved,
    async load() {
      return current;
    },
    async save(token) {
      current = token;
      saved.push(token);
    },
    async clear() {
      current = null;
    },
  };
}

describe('Google sign-in', () => {
  it('asks for the app-created calendar scope with an implicit token and no secret', () => {
    const silent = buildAuthUrl({ clientId, redirectUri, interactive: false });
    const interactive = buildAuthUrl({ clientId, redirectUri, interactive: true });

    for (const url of [silent, interactive]) {
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://accounts.google.com');
      expect(parsed.searchParams.get('client_id')).toBe(clientId);
      expect(parsed.searchParams.get('response_type')).toBe('token');
      expect(parsed.searchParams.get('redirect_uri')).toBe(redirectUri);
      expect(parsed.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/userinfo.email');
      expect(parsed.searchParams.get('client_secret')).toBeNull();
      expect(parsed.searchParams.get('access_type')).toBeNull();
      expect(url).not.toContain('refresh_token');
    }
    expect(new URL(silent).searchParams.get('prompt')).toBe('none');
    expect(new URL(interactive).searchParams.get('prompt')).toBe('select_account');
  });

  it('reads only the access token from the redirect hash', () => {
    const token = readAccessToken(
      `${redirectUri}#access_token=ya29.token&expires_in=120&token_type=Bearer&refresh_token=nope`,
      1_000,
    );
    expect(token).toEqual({ accessToken: 'ya29.token', expiresAt: 121_000 });
  });

  it('does not launch when the OAuth client id is missing', async () => {
    let launched = 0;
    const result = await authorizeGoogle({
      clientId: '  ',
      redirectUri,
      now: 0,
      readEmail: async () => 'employee@example.test',
      tokens: memoryTokens(),
      launch: () => {
        launched += 1;
        return Promise.resolve(null);
      },
    });
    expect(result).toEqual({ ok: false, reason: 'missing-client' });
    expect(launched).toBe(0);
  });

  it('renews silently before showing the consent screen, and stores the access token only', async () => {
    const tokens = memoryTokens();
    const launched: Array<{ url: string; interactive: boolean }> = [];
    const result = await authorizeGoogle({
      clientId,
      redirectUri,
      now: 5_000,
      readEmail: async () => 'employee@example.test',
      tokens,
      launch: (url, interactive) => {
        launched.push({ url, interactive });
        if (!interactive) {
          return Promise.reject(new Error('interaction_required'));
        }
        return Promise.resolve(`${redirectUri}#access_token=ya29.fresh&expires_in=3600`);
      },
    });

    expect(result).toEqual({ ok: true, accessToken: 'ya29.fresh' });
    expect(launched.map((call) => call.interactive)).toEqual([false, true]);
    expect(new URL(launched[0]?.url ?? '').searchParams.get('prompt')).toBe('none');
    expect(tokens.saved).toEqual([{ accessToken: 'ya29.fresh', expiresAt: 5_000 + 3_600_000, email: 'employee@example.test' }]);
    expect(JSON.stringify(tokens.saved)).not.toContain('refresh');
  });

  it('reuses a stored access token that is not about to expire', async () => {
    let launched = 0;
    const result = await authorizeGoogle({
      clientId,
      redirectUri,
      now: 1_000,
      readEmail: async () => 'employee@example.test',
      tokens: memoryTokens({ accessToken: 'ya29.cached', expiresAt: 120_000 }),
      launch: () => {
        launched += 1;
        return Promise.resolve(null);
      },
    });
    expect(result).toEqual({ ok: true, accessToken: 'ya29.cached' });
    expect(launched).toBe(0);
  });
});

describe('Google account selection', () => {
  it('asks the user to choose an account even when a valid token is already cached', async () => {
    const tokens = memoryTokens({ accessToken: 'old', expiresAt: 999999 });
    const launches: string[] = [];
    await authorizeGoogle({ clientId, redirectUri, now: 0, tokens, interactive: true,
      readEmail: async () => 'chosen@example.test',
      launch: async (url) => { launches.push(url); return `${redirectUri}#access_token=new&expires_in=3600`; },
    });
    expect(launches).toHaveLength(1);
    expect(new URL(launches[0]!).searchParams.get('prompt')).toBe('select_account');
    expect((await tokens.load())?.email).toBe('chosen@example.test');
  });

  it('pins renewal to the connected account and rejects an unexpected account', async () => {
    const tokens = memoryTokens();
    await tokens.save({ accessToken: 'old', expiresAt: 1, email: 'original@example.test' });
    let hint: string | null = null;
    const result = await authorizeGoogle({ clientId, redirectUri, now: 10000, tokens,
      readEmail: async () => 'other@example.test',
      launch: async (url) => { hint = new URL(url).searchParams.get('login_hint'); return `${redirectUri}#access_token=new`; },
    });
    expect(hint).toBe('original@example.test');
    expect(result).toEqual({ ok: false, reason: 'google-auth' });
    expect((await tokens.load())?.accessToken).toBe('old');
  });

  it('reads the verified email from Google and sends the token only to Google', async () => {
    const email = await readGoogleEmail(async (url, init) => {
      expect(url).toBe('https://www.googleapis.com/oauth2/v3/userinfo');
      expect(init?.headers).toEqual({ Authorization: 'Bearer token' });
      return new Response(JSON.stringify({ email: 'chosen@example.test', email_verified: true }));
    }, 'token');
    expect(email).toBe('chosen@example.test');
  });
});
