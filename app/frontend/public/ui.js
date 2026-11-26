const icons = {
  home:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  shield:'<path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/>',
  chart:'<path d="M4 3v17h17M8 14l4-4 4 2 5-6"/>',
  brief:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a23 23 0 0 0 18 0M12 12v3"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1a2 2 0 0 1 0 2.8l-.6.6a2 2 0 0 1-2.8 0l-.1-.1a2 2 0 0 0-2.2.8v.2a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-.2a2 2 0 0 0-2.2-.8l-.1.1a2 2 0 0 1-2.8 0l-.6-.6a2 2 0 0 1 0-2.8l.1-.1a2 2 0 0 0-.8-2.2h-.2a2 2 0 0 1 0-4h.2a2 2 0 0 0 .8-2.2l-.1-.1a2 2 0 0 1 0-2.8l.6-.6a2 2 0 0 1 2.8 0l.1.1A2 2 0 0 0 9 3.4v-.2a2 2 0 0 1 2-2h.8a2 2 0 0 1 2 2v.2a2 2 0 0 0 2.2.8l.1-.1a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8l-.1.1a2 2 0 0 0 .8 2.2h.2a2 2 0 0 1 0 4h-.2a2 2 0 0 0-.8 2.2Z" transform="translate(1 1) scale(.92)"/>',
  grid:'<path d="M3 7h18M3 12h18M3 17h18M8 3v18M16 3v18"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  up:'<path d="M7 17 17 7M7 7h10v10"/>',
  back:'<path d="M20 12H5m6 6-6-6 6-6"/>',
  chevron:'<path d="m9 18 6-6-6-6"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-2-14-4 16"/>',
  spark:'<path d="M12 2 14.8 9.2 22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z"/>',
  wallet:'<path d="M19 9V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H6M21 12h-5v4h5"/>',
  cursor:'<path d="m4 3 16 8-7 2-3 7L4 3Z"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  map:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  warning:'<path d="M10.3 4.9a2 2 0 0 1 3.4 0l7 12a2 2 0 0 1-1.7 3.1H5a2 2 0 0 1-1.7-3.1l7-12ZM12 9v4m0 3h.01"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  x:'<path d="m6 6 12 12M18 6 6 18"/>',
  file:'<path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm8 0v5h4M8 12h6m-6 4h6"/>',
  pen:'<path d="m13 6 5 5M5 19l4-1 11-11-4-4L5 14l-1 6 1-1Z"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13m-8 4v5m4-5v5"/>',
  box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4m-9 4v10m-4-16 9 4"/>',
  orbit:'<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-32 12 12)"/>',
  north:'<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2Z"/><circle cx="12" cy="12" r="2"/>',
  forma:'<path d="M4 4h7v7H4zm9 9h7v7h-7zM13 4h7v7h-7zM4 13h7v7H4z"/>',
  vertex:'<path d="m3 19 9-15 9 15H3Zm4-6h10"/>',
};

export const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.box}</svg>`;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
export const number = value => new Intl.NumberFormat('ru-RU').format(value);
export const date = value => value ? new Intl.DateTimeFormat('ru-RU',{ day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }).format(new Date(value)) : '—';
export const percent = value => value == null ? '—' : `${value}%`;
export const money = value => value == null ? '—' : `${number(value)} ₽`;
export const badge = (text, tone = 'neutral', glyph = '') => `<span class="badge ${tone}">${glyph ? icon(glyph,13) : ''}${escape(text)}</span>`;
export const button = (text, action, style = 'secondary', value = '') => `<button type="button" class="button ${style}" data-action="${action}" data-value="${escape(value)}">${escape(text)}</button>`;
export const link = (text, href, style = 'quiet') => `<a class="button ${style}" href="${escape(href)}">${escape(text)}</a>`;
export const selectControl = (attributes, choices) => `<span class="select-control"><select ${attributes}>${choices}</select>${icon('down',16)}</span>`;
export const option = (value, selected, name = value) => `<option value="${escape(value)}"${value === selected ? ' selected' : ''}>${escape(name)}</option>`;
export const heading = (title, description, actions = '') => `<header class="page-heading"><div><h1>${escape(title)}</h1>${description ? `<p>${escape(description)}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</header>`;
export const empty = (title, text, action = '') => `<div class="empty"><h2>${escape(title)}</h2><p>${escape(text)}</p>${action}</div>`;
export const callout = (title, description, tone = 'neutral', glyph = 'info') => `<div class="callout ${tone}">${icon(glyph,19)}<div><strong>${escape(title)}</strong><p>${escape(description)}</p></div></div>`;
export const back = (text, href) => `<a class="back-link" href="${escape(href)}">${escape(text)}</a>`;
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:','http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
export function salaryText(salary) {
  if (!salary) return 'Зарплата не указана';
  const from = salary.min == null ? '' : number(salary.min);
  const to = salary.max == null ? '' : number(salary.max);
  const amount = from && to ? `${from}–${to}` : from ? `от ${from}` : `до ${to}`;
  return `${amount} ${salary.currency === 'RUB' ? '₽' : salary.currency}`;
}
export const status = value => ({ active:['Активна','mint'], stale:['Устарела','amber'], archived:['Архив','neutral'] })[value] ?? ['Статус неизвестен','neutral'];
export const materialStatus = value => ({ draft:['Черновик','neutral'], review:['На проверке','amber'], published:['Опубликовано','mint'], retired:['Выведено','neutral'] })[value] ?? ['Неизвестно','neutral'];
export const options = (items, selected) => items.map(item => option(item,selected)).join('');
