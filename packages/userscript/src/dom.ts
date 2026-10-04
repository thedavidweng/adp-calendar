const BUTTON_ID = 'adp-calendar-export';

export function iframeSrcs(doc: Document): string[] {
  return [...doc.querySelectorAll('iframe')]
    .map((frame) => frame.getAttribute('src') || frame.src)
    .filter((src): src is string => Boolean(src));
}

export function mountButton(label: string, onClick: () => void): { setLabel(label: string): void } {
  const existing = document.getElementById(BUTTON_ID);
  const button = existing instanceof HTMLButtonElement ? existing : document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = label;
  button.style.position = 'fixed';
  button.style.right = '16px';
  button.style.bottom = '16px';
  button.style.zIndex = '2147483647';
  button.style.padding = '8px 12px';
  button.style.font = '14px sans-serif';
  if (!existing) {
    button.addEventListener('click', () => {
      onClick();
    });
    (document.body ?? document.documentElement).appendChild(button);
  }
  return {
    setLabel(next) {
      button.textContent = next;
    },
  };
}

export function downloadText(filename: string, body: string): void {
  const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  (document.body ?? document.documentElement).appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
