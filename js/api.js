// Связь с сервером лобби: адрес, вход, запросы, справочники героев и рангов.
export const DEV = ['localhost', '127.0.0.1'].includes(location.hostname);
export const API = DEV ? '/api' : 'https://173-249-26-11.sslip.io:8444/lobby';
// адрес самого сайта без имени страницы: https://lobby.aliveenjoyer.art или https://aliveenjoyer.art/lobby
export const BASE = location.origin + location.pathname.replace(/\/[^/]*$/, '');

// У себя на localhost вход живёт в одной вкладке: так в соседних вкладках можно быть разными людьми.
const box = DEV ? sessionStorage : localStorage;
let token = null;
try { token = box.getItem('lobby.token'); } catch (e) { /* хранилище закрыто — живём без памяти */ }

export const session = {
  get token() { return token; },
  set(t) {
    token = t || null;
    try { t ? box.setItem('lobby.token', t) : box.removeItem('lobby.token'); } catch (e) { /* не страшно */ }
  },
};

export class ApiError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

export async function call(path, body, method) {
  const opt = { method: method || (body === undefined ? 'GET' : 'POST'), headers: {} };
  if (token) opt.headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(API + path, opt); } catch (e) {
    throw new ApiError('net', 'Нет связи с сервером. Проверь интернет и попробуй ещё раз', 0);
  }
  let d = null;
  try { d = await r.json(); } catch (e) { /* не JSON */ }
  if (!r.ok) throw new ApiError((d && d.error) || 'http', (d && d.message) || 'Сервер ответил ошибкой ' + r.status, r.status);
  return d;
}

export const meta = { heroes: [], byId: new Map(), items: [], itemById: new Map(), ranks: [], regions: {}, modes: {}, drafts: {}, defaults: {}, dev: false, ready: false };

export async function loadMeta() {
  const m = await call('/meta');
  Object.assign(meta, m, { ready: true });
  meta.byId = new Map(m.heroes.map((h) => [h.id, h]));
  meta.itemById = new Map((m.items || []).map((x) => [x.id, x]));        // предметы из магазина игры: для таблицы матча
  return meta;
}
