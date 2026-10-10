export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const GOOGLE_CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly';

export const GOOGLE_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

const TOKEN_SKEW_MS = 60_000;
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export interface StoredGoogleToken {
  accessToken: string;
  expiresAt: number;
  email?: string;
}

export interface TokenStore {
  load(): Promise<StoredGoogleToken | null>;
  save(token: StoredGoogleToken): Promise<void>;
  clear(): Promise<void>;
}

export function buildAuthUrl(input: { clientId: string; redirectUri: string; interactive: boolean; email?: string }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', `${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_CALENDAR_LIST_SCOPE} ${GOOGLE_EMAIL_SCOPE}`);
  if (input.email) url.searchParams.set('login_hint', input.email);
  if (!input.interactive) {
    url.searchParams.set('prompt', 'none');
  } else if (!input.email) {
    url.searchParams.set('prompt', 'select_account');
  }
  return url.toString();
}

export function readAccessToken(redirectUrl: string, nowMs: number): StoredGoogleToken | null {
  const hash = new URL(redirectUrl).hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (!accessToken) {
    return null;
  }
  const expiresIn = Number(params.get('expires_in'));
  const seconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_EXPIRES_IN_SECONDS;
  return { accessToken, expiresAt: nowMs + seconds * 1000 };
}

export async function authorizeGoogle(deps: {
  clientId: string;
  redirectUri: string;
  now: number;
  tokens: TokenStore;
  interactive?: boolean;
  readEmail(accessToken: string): Promise<string>;
  launch(url: string, interactive: boolean): Promise<string | null | undefined>;
}): Promise<{ ok: true; accessToken: string } | { ok: false; reason: 'missing-client' | 'google-auth' }> {
  if (deps.clientId.trim() === '') {
    return { ok: false, reason: 'missing-client' };
  }

  const stored = await deps.tokens.load();
  if (!deps.interactive && stored && stored.expiresAt - deps.now > TOKEN_SKEW_MS) {
    return { ok: true, accessToken: stored.accessToken };
  }

  for (const interactive of deps.interactive ? [true] : [false, true]) {
    let redirected: string | null | undefined;
    try {
      redirected = await deps.launch(
        buildAuthUrl({
          clientId: deps.clientId,
          redirectUri: deps.redirectUri,
          interactive,
          email: deps.interactive ? undefined : stored?.email,
        }),
        interactive,
      );
    } catch {
      redirected = null;
    }
    if (!redirected) {
      continue;
    }
    const token = readAccessToken(redirected, deps.now);
    if (!token) {
      continue;
    }
    try {
      token.email = await deps.readEmail(token.accessToken);
    } catch {
      return { ok: false, reason: 'google-auth' };
    }
    if (!deps.interactive && stored?.email && token.email !== stored.email) {
      return { ok: false, reason: 'google-auth' };
    }
    await deps.tokens.save(token);
    return { ok: true, accessToken: token.accessToken };
  }

  return { ok: false, reason: 'google-auth' };
}

export async function readGoogleEmail(fetchImpl: typeof fetch, accessToken: string): Promise<string> {
  const response = await fetchImpl('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google account lookup failed: ${response.status}`);
  const account = await response.json() as { email?: string; email_verified?: boolean };
  if (!account.email || !account.email_verified) throw new Error('Google account email is not verified');
  return account.email;
}
