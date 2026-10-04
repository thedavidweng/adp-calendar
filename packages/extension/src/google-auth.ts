export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';

const TOKEN_SKEW_MS = 60_000;
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

export interface StoredGoogleToken {
  accessToken: string;
  expiresAt: number;
}

export interface TokenStore {
  load(): Promise<StoredGoogleToken | null>;
  save(token: StoredGoogleToken): Promise<void>;
  clear(): Promise<void>;
}

export function buildAuthUrl(input: { clientId: string; redirectUri: string; interactive: boolean }): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPE);
  if (!input.interactive) {
    url.searchParams.set('prompt', 'none');
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
  launch(url: string, interactive: boolean): Promise<string | null | undefined>;
}): Promise<{ ok: true; accessToken: string } | { ok: false; reason: 'missing-client' | 'google-auth' }> {
  if (deps.clientId.trim() === '') {
    return { ok: false, reason: 'missing-client' };
  }

  const stored = await deps.tokens.load();
  if (stored && stored.expiresAt - deps.now > TOKEN_SKEW_MS) {
    return { ok: true, accessToken: stored.accessToken };
  }

  for (const interactive of [false, true]) {
    let redirected: string | null | undefined;
    try {
      redirected = await deps.launch(
        buildAuthUrl({
          clientId: deps.clientId,
          redirectUri: deps.redirectUri,
          interactive,
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
    await deps.tokens.save(token);
    return { ok: true, accessToken: token.accessToken };
  }

  return { ok: false, reason: 'google-auth' };
}
