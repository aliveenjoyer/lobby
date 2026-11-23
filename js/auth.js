// Вход через Twitch (по коду, как в кликере) и привязка Steam.
import { call, session, BASE, meta, DEV } from './api.js?v=20261124064928';
import { modal, head, oops, esc, $, ICON, toast } from './ui.js?v=20261124064928';

export const user = { me: null };
const subs = new Set();
export function onUser(fn) { subs.add(fn); return () => subs.delete(fn); }
export function setUser(me) { user.me = me; subs.forEach((f) => f(me)); }

// Что человек собирался сделать, когда его остановил вход или привязка Steam: «записаться» (kind: signup) или «войти
// в лобби» (kind: lobby). После входа и Steam страница делает это сама — второй раз кнопку жать не нужно. Хранится
// во вкладке: переживает уход на страницу Steam и возврат.
export const want = {
  set(kind, id) { try { sessionStorage.setItem('lobby.want', JSON.stringify({ kind, id, at: Date.now() })); } catch (e) { /* без памяти */ } },
  get(kind, id) {
    try {
      const w = JSON.parse(sessionStorage.getItem('lobby.want') || 'null');
      return w && w.kind === kind && w.id === id && Date.now() - w.at < 30 * 60000 ? w : null;
    } catch (e) { return null; }
  },
  clear() { try { sessionStorage.removeItem('lobby.want'); } catch (e) { /* нечего чистить */ } },
};

export async function refreshMe() {
  if (!session.token) { setUser(null); return null; }
  try {
    const d = await call('/me');
    if (!d.me) session.set(null);
    setUser(d.me);
  } catch (e) { /* сервер недоступен — остаёмся как были */ }
  return user.me;
}

// Вход в одно нажатие: человек уходит на страницу Twitch, жмёт «Разрешить», и Twitch возвращает его на twitch.html
// (js/twback.js) — оттуда он попадает на ту же страницу сайта уже вошедшим. Без кода и без второй вкладки: на телефоне
// и во встроенных браузерах вход по коду терял людей. -> false, если так войти нельзя: тогда вход идёт по коду.
function loginRedirect() {
  const m = meta.login || {};
  if (!m.redirect || !m.client || !window.crypto || DEV) return false;        // у себя Twitch выдуманный: уходить некуда
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    if (sessionStorage.getItem('lobby.login') === 'code') return false;       // прошлый возврат с Twitch не удался
    sessionStorage.setItem('lobby.tw', JSON.stringify({ state, back: location.hash || '#/', at: Date.now() }));
    if (!sessionStorage.getItem('lobby.tw')) return false;
  } catch (e) { return false; }                                                // без памяти вкладки метку входа не сверить
  location.href = `https://id.twitch.tv/oauth2/authorize?client_id=${encodeURIComponent(m.client)}&redirect_uri=${encodeURIComponent(BASE + '/twitch.html')}&response_type=token&scope=&state=${state}`;
  return true;
}

let loginOpen = false;
export async function login() {
  if (loginOpen) return;
  if (loginRedirect()) return;
  loginOpen = true;
  // Вкладку Twitch открываем сразу по нажатию: после ожидания ответа браузер счёл бы её всплывающим окном.
  const tab = window.open('about:blank', '_blank');
  let stop = false;
  let timer = 0;
  const m = modal(`${head('Вход через Twitch')}
    <div class="body">
      <p class="dim" id="lg-text">Спрашиваю у Twitch код входа…</p>
      <div class="logincode hide" id="lg-code"></div>
      <a class="btn primary wide hide" id="lg-open" target="_blank" rel="noopener">${ICON.twitch}<span>Открыть Twitch</span></a>
      <div class="row dim hide" id="lg-wait"><span class="spin"></span><span>Жду подтверждения на Twitch</span></div>
    </div>`, { onClose: () => { stop = true; clearTimeout(timer); loginOpen = false; } });
  const fail = (text) => {
    if (tab && !tab.closed) tab.close();
    $('#lg-text', m.el).textContent = text;
    for (const id of ['#lg-code', '#lg-open', '#lg-wait']) $(id, m.el).classList.add('hide');
  };
  let d;
  try { d = await call('/auth/twitch/start', {}); } catch (e) { fail(e.message); return; }
  if (stop) { if (tab && !tab.closed) tab.close(); return; }
  if (tab && !tab.closed) tab.location.href = d.url;
  $('#lg-text', m.el).textContent = tab
    ? 'На открывшейся странице Twitch нажми «Разрешить» и вернись сюда. Код уже подставлен:'
    : 'Открой страницу Twitch, нажми там «Разрешить» и вернись сюда. Код уже подставлен:';
  const code = $('#lg-code', m.el);
  code.textContent = d.code;
  code.classList.remove('hide');
  const open = $('#lg-open', m.el);
  open.href = d.url;
  open.classList.remove('hide');
  if (tab) { open.classList.remove('primary'); $('span', open).textContent = 'Открыть Twitch ещё раз'; }
  $('#lg-wait', m.el).classList.remove('hide');
  const poll = async () => {
    if (stop) return;
    let r;
    try { r = await call('/auth/twitch/poll', { lid: d.lid }); } catch (e) { r = { status: 'wait' }; }
    if (stop) return;
    if (r.status === 'ok') {
      session.set(r.token);
      setUser(r.me);
      m.close();
      toast('Вошёл как ' + r.me.name);
      return;
    }
    if (r.status === 'gone') { fail('Код не подтвердили вовремя, или Twitch отказал. Нажми «Войти» ещё раз.'); return; }
    timer = setTimeout(poll, Math.max(1, d.interval) * 1000 + 200);
  };
  timer = setTimeout(poll, Math.max(1, d.interval) * 1000);
}

export async function logout() {
  try { await call('/auth/logout', {}); } catch (e) { /* выйдем и так */ }
  session.set(null);
  setUser(null);
}

export async function linkSteam() {
  try {
    const d = await call('/steam/start', { base: BASE });
    try { sessionStorage.setItem('lobby.back', location.hash || '#/'); } catch (e) { /* вернёмся в профиль */ }
    location.href = d.url;
  } catch (e) { oops(e); }
}

export function needLogin(text) {
  const m = modal(`${head('Нужен вход')}
    <div class="body"><p class="dim">${esc(text || 'Войди через Twitch, чтобы продолжить.')}</p></div>
    <footer><button class="btn" data-close>Не сейчас</button>
    <button class="btn primary" id="nl-go">${ICON.twitch}<span>Войти через Twitch</span></button></footer>`);
  $('#nl-go', m.el).addEventListener('click', () => { m.close(); login(); });
}
