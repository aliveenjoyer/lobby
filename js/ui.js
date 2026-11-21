// Мелкие кирпичи интерфейса: безопасный текст, окна, уведомления, значки рангов и героев.
import { meta } from './api.js?v=20261122030905';

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
export function badgeName(b) {
  if (!b) return 'Без ранга';
  const tier = Math.floor(b / 10);
  return (meta.ranks[tier] || 'Ранг ' + tier) + ' ' + (ROMAN[b % 10] || '');
}
export function badgeImg(b, cls) {
  return `<img class="badge ${cls || ''}" src="assets/ranks/${b || 0}.webp" alt="${esc(badgeName(b))}" title="${esc(badgeName(b))}" loading="lazy">`;
}
export function heroName(id) {
  const h = meta.byId.get(id);
  return h ? h.name : 'Герой ' + id;
}
export function heroImg(id, cls) {
  const h = meta.byId.get(id);
  const src = h && h.icon;
  if (!src) return `<span class="hero ${cls || ''}" title="${esc(heroName(id))}"></span>`;
  return `<img class="hero ${cls || ''}" src="${esc(src)}" alt="${esc(h.name)}" title="${esc(h.name)}" loading="lazy">`;
}
export function ava(c, cls) {
  if (c && c.avatar) return `<img class="ava ${cls || ''}" src="${esc(c.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  const ch = ((c && c.name) || '?').trim().charAt(0).toUpperCase();
  return `<span class="ava txt ${cls || ''}">${esc(ch)}</span>`;
}
export const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('ru-RU').replace(/ | /g, ' '));
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  if (a >= 11 && a <= 19) return many;
  const b = a % 10;
  return b === 1 ? one : b >= 2 && b <= 4 ? few : many;
}
export function clock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
export function dateRu(ts) {
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

// ---- время старта. Называем его по Москве (так говорят ведущие: «кастомки в шесть по Москве»), рядом — местное,
// если у человека оно другое.
const MSK = 'Europe/Moscow';
export function startText(ts) {
  const d = new Date(ts * 1000);
  const day = (x) => x.toLocaleDateString('ru-RU', { timeZone: MSK, day: 'numeric', month: 'long' });
  const hm = d.toLocaleTimeString('ru-RU', { timeZone: MSK, hour: '2-digit', minute: '2-digit' });
  const dd = day(d);
  const when = dd === day(new Date()) ? 'сегодня' : dd === day(new Date(Date.now() + 86400000)) ? 'завтра' : dd;
  const local = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${when} в ${hm} по Москве${local !== hm ? ` (у тебя ${local})` : ''}`;
}
// Обратный отсчёт до старта — с часами и днями. clock() для этого не годится: он показывает длину матча минутами.
export function countdown(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const two = (n) => String(n).padStart(2, '0');
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} д ${h}:${two(m)}:${two(sec % 60)}`;
  return h ? `${h}:${two(m)}:${two(sec % 60)}` : `${m}:${two(sec % 60)}`;
}
// «через 2 д 3 ч», «через 19 ч 14 мин», «через 14 мин»
export function soon(sec) {
  const total = Math.max(1, Math.round(Math.max(0, sec) / 60));       // сначала округляем до минут: иначе выходило «4 ч 60 мин»
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return 'через ' + (d ? `${d} д ${h} ч` : h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`);
}

export const ICON = {
  twitch: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.3 2 3 5.6v14.3h4.9V22h2.7l2.6-2.1h4L22 15V2H4.3Zm15.9 12.1-3 3h-4.9l-2.6 2.1v-2.1H5.7V3.8h14.5v10.3ZM17.1 7.6v5.2h-1.8V7.6h1.8Zm-4.9 0v5.2h-1.8V7.6h1.8Z"/></svg>',
  steam: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-9.96 9.1l5.36 2.2a2.8 2.8 0 0 1 1.76-.5l2.39-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.43a2.83 2.83 0 0 1-5.6.56l-3.83-1.58A10 10 0 1 0 12 2Zm-3.7 15.17-1.23-.5a2.12 2.12 0 1 0 1.2-2.87l1.27.52a1.56 1.56 0 1 1-1.24 2.85Zm9.53-7.87a2.51 2.51 0 1 0-5.02 0 2.51 2.51 0 0 0 5.02 0Zm-4.4 0a1.89 1.89 0 1 1 3.78 0 1.89 1.89 0 0 1-3.78 0Z"/></svg>',
};

// ---- обновление страницы на месте
// Новая разметка не заменяет старую целиком, а накладывается на неё: совпавшие элементы остаются теми же узлами,
// меняются только их текст и атрибуты. Иначе при частых обновлениях (люди записываются, голосуют) кнопка под
// курсором успевала смениться между нажатием и отпусканием, и нажатие пропадало.
function syncAttrs(a, b) {
  for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of Array.from(b.attributes)) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
}
function syncKids(a, b) {
  let x = a.firstChild;
  let y = b.firstChild;
  while (y) {
    const ny = y.nextSibling;
    if (!x) a.appendChild(y);
    else if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) {
      const nx = x.nextSibling;
      a.replaceChild(y, x);
      x = nx;
    } else {
      if (x.nodeType === 1) { syncAttrs(x, y); syncKids(x, y); } else if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
      x = x.nextSibling;
    }
    y = ny;
  }
  while (x) { const nx = x.nextSibling; a.removeChild(x); x = nx; }
}
export function morph(root, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  syncKids(root, tpl.content);
}

// ---- уведомления
export function toast(msg, isErr) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), isErr ? 5200 : 2600);
}
export const oops = (e) => toast((e && e.message) || 'Что-то пошло не так', true);

// ---- окна
let openModal = null;
export function modal(html, opt) {
  opt = opt || {};
  closeModal();
  const root = $('#modal');
  root.innerHTML = `<div class="modal"><div class="sheet ${opt.wide ? 'w' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  const wrap = root.firstElementChild;
  const m = {
    el: wrap.firstElementChild,
    close() {
      if (openModal !== m) return;
      openModal = null;
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      if (opt.onClose) opt.onClose();
    },
  };
  const onKey = (e) => { if (e.key === 'Escape') m.close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) m.close(); });
  m.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.close(); });
  openModal = m;
  const first = m.el.querySelector('[autofocus], input, select, textarea, button.primary');
  if (first) first.focus();
  return m;
}
export function closeModal() { if (openModal) openModal.close(); }
export const head = (title) => `<header><h3>${esc(title)}</h3><button class="x" data-close aria-label="Закрыть">×</button></header>`;

// Окно «Время старта»: день и время по Москве; по умолчанию — ближайшие 18:00.
// cur — уже назначенное время; o: { title, text, save, clear: показать «Убрать время» }.
// -> { at: время Unix } | { clear: true } | null, если окно закрыли.
export function askStart(cur, o) {
  o = o || {};
  const nowS = Date.now() / 1000;
  let def = cur && cur > nowS ? cur : 0;
  if (!def) {
    const m = new Date((nowS + 10800) * 1000);                   // сейчас по Москве (она на три часа впереди UTC круглый год)
    def = Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate(), 15, 0) / 1000;      // 18:00 по Москве
    if (def < nowS + 1200) def += 86400;
  }
  const iso = (t) => new Date((t + 10800) * 1000).toISOString();
  return new Promise((resolve) => {
    let out = null;
    const m = modal(`${head(o.title || 'Время старта')}<div class="body">
      <p class="dim" style="margin-bottom:14px">${esc(o.text || 'Игроки записываются заранее и видят таймер. Кто раньше записался, тот раньше попадает в игру.')}</p>
      <div class="grid2" style="gap:10px"><label class="field"><span>День</span><input class="input" type="date" id="sa-date" value="${iso(def).slice(0, 10)}" min="${iso(nowS).slice(0, 10)}" max="${iso(nowS + 29 * 86400).slice(0, 10)}"></label>
        <label class="field"><span>Время по Москве</span><input class="input" type="time" id="sa-time" value="${iso(def).slice(11, 16)}" step="300"></label></div>
      <p class="dim" id="sa-hint" style="margin-top:12px"></p></div>
      <footer>${o.clear ? '<button class="btn ghost" id="sa-clear" style="margin-right:auto">Убрать время</button>' : ''}<button class="btn" data-close>Отмена</button><button class="btn primary" id="sa-save">${esc(o.save || 'Сохранить')}</button></footer>`,
    { onClose: () => resolve(out) });
    const read = () => {
      const ms = Date.parse(`${$('#sa-date', m.el).value}T${$('#sa-time', m.el).value}:00+03:00`);
      return Number.isFinite(ms) ? ms / 1000 : null;
    };
    const hint = () => {
      const at = read();
      $('#sa-hint', m.el).textContent = at == null ? 'Выбери день и время.' : at < Date.now() / 1000 ? 'Это время уже прошло.'
        : `Старт ${startText(at)} — ${soon(at - Date.now() / 1000)}.`;
    };
    m.el.addEventListener('input', hint);
    hint();
    $('#sa-save', m.el).addEventListener('click', () => {
      const at = read();
      if (at == null || at < Date.now() / 1000) { toast('Выбери время в будущем', true); return; }
      out = { at: Math.round(at) };
      m.close();
    });
    const c = $('#sa-clear', m.el);
    if (c) c.addEventListener('click', () => { out = { clear: true }; m.close(); });
  });
}

// Опасное действие: окно с прямым названием и кнопкой, которую надо удерживать.
export function confirmHold(o) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`${head(o.title)}
      <div class="body"><p class="dim">${esc(o.text)}</p></div>
      <footer><button class="btn" data-close>Отмена</button>
      <button class="btn danger hold" id="holdbtn"><span>${esc(o.label)} — удерживай</span></button></footer>`,
    { onClose: () => { if (!done) resolve(false); } });
    const b = $('#holdbtn', m.el);
    const need = (o.seconds || 2) * 1000;
    let t0 = 0; let raf = 0;
    const stop = () => { cancelAnimationFrame(raf); t0 = 0; b.style.setProperty('--hold', '0%'); };
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / need);
      b.style.setProperty('--hold', (p * 100).toFixed(1) + '%');
      if (p >= 1) { done = true; m.close(); resolve(true); return; }
      raf = requestAnimationFrame(step);
    };
    const start = (e) => { e.preventDefault(); if (!t0) { t0 = performance.now(); raf = requestAnimationFrame(step); } };
    b.addEventListener('pointerdown', start);
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    b.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
    b.addEventListener('keyup', stop);
  });
}

export async function copy(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
  toast(okMsg || 'Скопировано');
}

// Выбор ранга: два списка (ранг и подранг) -> значок
export function rankPicker(id, badge) {
  const tier = badge ? Math.floor(badge / 10) : 0;
  const sub = badge ? badge % 10 : 1;
  const tiers = meta.ranks.map((n, i) => (i ? `<option value="${i}" ${i === tier ? 'selected' : ''}>${esc(n)}</option>` : '')).join('');
  const subs = [1, 2, 3, 4, 5, 6].map((i) => `<option value="${i}" ${i === sub ? 'selected' : ''}>${ROMAN[i]}</option>`).join('');
  return `<div class="pickers" id="${id}">
    <select class="input" data-tier aria-label="Ранг"><option value="0">Не выбран</option>${tiers}</select>
    <select class="input" data-sub aria-label="Подранг">${subs}</select></div>`;
}
export function pickedRank(id) {
  const box = document.getElementById(id);
  const tier = +$('[data-tier]', box).value;
  return tier ? tier * 10 + +$('[data-sub]', box).value : 0;
}
