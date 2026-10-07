import type { ExportPanel, PanelView } from './shell.ts';

const HOST_ID = 'adp-calendar-export';

// Colors and type mirror site/assets/site.css so the panel matches the website and extension.
const STYLE = `
:host { all: initial; }
.root {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  max-width: min(340px, calc(100vw - 40px));
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #2a2e37;
  -webkit-font-smoothing: antialiased;
}
.message {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 12px 36px 12px 14px;
  border: 1px solid #e7e9ee;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 8px rgba(16, 24, 40, 0.04), 0 18px 40px -12px rgba(16, 24, 40, 0.28);
}
.message[hidden] { display: none; }
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #2457f5;
}
.message[data-tone="success"] .dot { background: #128a4a; }
.message[data-tone="error"] .dot { background: #c62828; }
.text a {
  display: inline-block;
  margin-top: 4px;
  color: #2457f5;
  font-weight: 600;
}
.close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: none;
  color: #8c93a3;
  font-family: inherit;
  font-size: 18px;
  line-height: 26px;
  cursor: pointer;
}
.close:hover { background: #f6f7f9; color: #0b0c0e; }
.export {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 18px 0 14px;
  border: 0;
  border-radius: 999px;
  background: #2457f5;
  color: #fff;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.005em;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.18), 0 10px 24px -8px rgba(36, 87, 245, 0.55);
  transition: background 0.15s, transform 0.15s;
}
.export:hover { background: #1a47d6; }
.export:active { transform: translateY(1px); }
.export:disabled { opacity: 0.7; cursor: progress; }
.export:focus-visible, .close:focus-visible { outline: 2px solid #2457f5; outline-offset: 2px; }
.export svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
@media (prefers-reduced-motion: reduce) { .export { transition: none; } }
`;

const ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17M12 13v5M9.5 15.5 12 18l2.5-2.5"/></svg>';

export function iframeSrcs(doc: Document): string[] {
  return [...doc.querySelectorAll('iframe')]
    .map((frame) => frame.getAttribute('src') || frame.src)
    .filter((src): src is string => Boolean(src));
}

export function mountPanel(initial: PanelView, onExport: () => void, closeLabel: string): ExportPanel {
  document.getElementById(HOST_ID)?.remove();
  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${STYLE}</style>
<div class="root">
  <div class="message" role="status" hidden><span class="dot"></span><div class="text"></div><button class="close" type="button">×</button></div>
  <button class="export" type="button">${ICON}<span class="label"></span></button>
</div>`;
  const message = shadow.querySelector<HTMLElement>('.message')!;
  const text = shadow.querySelector<HTMLElement>('.text')!;
  const close = shadow.querySelector<HTMLButtonElement>('.close')!;
  const button = shadow.querySelector<HTMLButtonElement>('.export')!;
  const label = shadow.querySelector<HTMLElement>('.label')!;
  close.setAttribute('aria-label', closeLabel);
  close.title = closeLabel;
  close.addEventListener('click', () => {
    message.hidden = true;
  });
  button.addEventListener('click', onExport);
  (document.body ?? document.documentElement).appendChild(host);

  const render = (view: PanelView): void => {
    label.textContent = view.label;
    button.disabled = view.busy;
    button.setAttribute('aria-busy', String(view.busy));
    message.hidden = view.message === null;
    text.replaceChildren();
    if (!view.message) {
      return;
    }
    message.dataset.tone = view.message.tone;
    text.append(document.createTextNode(view.message.text));
    if (view.message.link) {
      const link = document.createElement('a');
      link.href = view.message.link.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = view.message.link.label;
      text.append(document.createElement('br'), link);
    }
  };
  render(initial);
  return { render };
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
