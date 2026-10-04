const BASE = 'https://workforcenow.adp.com';

export function readPositionId(iframeSrcs: readonly string[]): string | null {
  for (const src of iframeSrcs) {
    const positionId = positionFromSrc(src);
    if (positionId) {
      return positionId;
    }
  }
  return null;
}

function positionFromSrc(src: string): string | null {
  if (!src) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(src, BASE);
  } catch {
    return null;
  }

  const href = url.searchParams.get('href');
  if (href) {
    try {
      const fromHref = clean(new URL(href, BASE).searchParams.get('TLM_POSID'));
      if (fromHref) {
        return fromHref;
      }
    } catch {
      return null;
    }
  }
  return clean(url.searchParams.get('TLM_POSID'));
}

function clean(value: string | null): string | null {
  return value && value.length > 0 ? value : null;
}
