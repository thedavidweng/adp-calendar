import type { PageResponse } from './adp-source.ts';

export async function readPageResponse(fetchImpl: typeof fetch, url: string): Promise<PageResponse> {
  const response = await fetchImpl(url, { credentials: 'include' });
  return {
    redirected: response.redirected,
    url: response.url,
    text: await response.text(),
  };
}
