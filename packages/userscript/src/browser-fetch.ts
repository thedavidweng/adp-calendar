import { unsafeWindow } from 'vite-plugin-monkey/dist/client';
import type { PageResponse } from './adp-source.ts';
import { readPageResponse } from './page-fetch.ts';

export function fetchInPage(url: string): Promise<PageResponse> {
  return readPageResponse(unsafeWindow.fetch.bind(unsafeWindow), url);
}
