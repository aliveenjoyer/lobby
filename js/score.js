// Таблица матча: живая, пока игра идёт, и итоговая после неё.
// Одна и та же на странице лобби, в слое для OBS и в прошедших играх на странице ведущего.
import { meta, call } from './api.js?v=20261122030905';
import { esc, ava, heroImg, heroName, fmt, plural, clock, dateRu, modal, head, toast, oops } from './ui.js?v=20261122030905';

import { user, login } from './auth.js?v=20261122030905';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
// колонки с числами; opt — на телефоне прячутся
const COLS = [['nw', 'Души'], ['dmg', 'Урон'], ['obj', 'Объекты', 'opt'], ['heal', 'Лечение', 'opt']];
// крупные числа моноширинным шрифтом: обычный пробел между тысячами в нём слишком широкий, ставим узкий промежуток
const num = (n) => fmt(n).replace(/\s/g, '<i class="nsp"></i>');
// по какой колонке сейчас выстроены игроки внутри команд; выбор один на все таблицы страницы и живёт, пока она открыта
let sortKey = 'nw';
const sortVal = (r, k) => (k === 'kda' ? (r.k || 0) * 1000 + (r.a || 0) - (r.d || 0) / 1000 : r[k] || 0);

const SLOT = { w: 'Оружие', v: 'Живучесть', s: 'Дух' };
const ORDER = { w: 0, v: 1, s: 2 };
const TIER = ['', 'I', 'II', 'III', 'IV', 'V'];

// Картинка предмета: как в магазине игры; у старых предметов её нет — тогда белый значок на плитке цвета категории.
const itemPic = (x) => (x.i ? `<img src="${esc(x.i)}" alt="" loading="lazy">` : x.g ? `<img class="glyph" src="${esc(x.g)}" alt="" loading="lazy">` : '');

// Предметы игрока плитками. Порядок: оружие, живучесть, дух; внутри — как куплены. Наведение на плитку открывает карточку.
function itemsHtml(ids) {
  const list = (ids || []).map((id, n) => ({ x: meta.itemById.get(id), n })).filter((o) => o.x);
  if (!list.length) return '';
  list.sort((a, b) => ORDER[a.x.s] - ORDER[b.x.s] || a.n - b.n);
  return list.map(({ x }) => `<span class="it ${x.s} ${x.i ? 'art' : ''}" data-item="${x.id}" tabindex="0" role="img" aria-label="${esc(x.n)}">${itemPic(x)}</span>`).join('');
}

// ---- карточка предмета: что это и что он даёт. Описания большие, поэтому берутся одним запросом при первом наведении.
let cards = null;
let loading = null;
function loadCards() {
  if (!loading) {
    loading = call('/items').then((d) => { cards = new Map((d.items || []).map((x) => [x.id, x])); })
      .catch(() => { loading = null; });
  }
  return loading;
}

function cardHtml(x) {
  let cdShown = false;
  const secs = (x.d || []).map((sec) => {
    const rows = sec.p || [];
    let head = '';
    if (sec.k !== 'i') {
      const cd = x.cd && !cdShown ? `<span>перезарядка ${esc(x.cd)}</span>` : '';
      cdShown = cdShown || !!cd;
      head = `<div class="th"><b>${sec.k === 'a' ? 'Активно' : 'Пассивно'}</b>${cd}</div>`;
    }
    const big = rows.filter((r) => r[2] === 2).map((r) => `<div class="tbig"><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`).join('');
    const rest = rows.filter((r) => r[2] !== 2).map((r) => `<div class="trow ${r[2] ? 'el' : ''}"><b>${esc(r[0])}</b><span>${esc(r[1])}</span></div>`).join('');
    return `<section class="tsec">${head}${sec.x ? `<p>${esc(sec.x).replace(/\n/g, '<br>')}</p>` : ''}${big ? `<div class="tbigs">${big}</div>` : ''}${rest}</section>`;
  }).join('');
  const from = (x.f || []).map((id) => ((cards && cards.get(id)) || meta.itemById.get(id) || {}).n).filter(Boolean);
  const about = [SLOT[x.s], `уровень ${TIER[x.t] || x.t}`];
  if (x.c) about.push(`${fmt(x.c)} душ`);
  if (x.a) about.push('активный');
  return `<header class="${x.s}"><span class="it ${x.s} ${x.i ? 'art' : ''} big">${itemPic(x)}</span>
    <div><b>${esc(x.n)}</b>${x.r ? `<span class="tr">${esc(x.r)}</span>` : ''}<span class="tm">${about.join(' · ')}</span></div></header>
    ${secs}${from.length ? `<footer>Собирается из: ${from.map(esc).join(', ')}</footer>` : ''}`;
}

let tip = null;
let tipFor = null;
function placeTip(el) {
  const r = el.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  let y = r.bottom + 8;
  if (y + h > window.innerHeight - 8) y = r.top - 8 - h > 8 ? r.top - 8 - h : Math.max(8, window.innerHeight - h - 8);
  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}
function hideTip() {
  tipFor = null;
  if (tip) tip.classList.remove('on');
}
function showTip(el) {
  const id = +el.dataset.item;
  const lite = meta.itemById.get(id);
  if (!lite) return;
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'itip';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
  }
  tipFor = el;
  const draw = () => {
    if (tipFor !== el) return;
    tip.innerHTML = cardHtml((cards && cards.get(id)) || lite);
    placeTip(el);
  };
  draw();
  tip.classList.add('on');
  if (!cards) loadCards().then(draw);
}
const itemAt = (e) => (e.target && e.target.closest ? e.target.closest('.it[data-item]') : null);
if (typeof document !== 'undefined' && !window.lobbyItemTips) {
  window.lobbyItemTips = true;
  document.addEventListener('mouseover', (e) => {
    const el = itemAt(e);
    if (el) { if (el !== tipFor) showTip(el); } else if (tipFor) hideTip();
  });
  document.addEventListener('focusin', (e) => { const el = itemAt(e); if (el) showTip(el); });
  document.addEventListener('focusout', (e) => { if (itemAt(e)) hideTip(); });
  // нажатие (телефон): карточка открывается и закрывается; строка игрока под плиткой при этом не срабатывает
  document.addEventListener('click', (e) => {
    const el = itemAt(e);
    if (el) {
      e.stopPropagation();
      if (tipFor === el && e.pointerType !== 'mouse' && e.detail !== 0 && tip.dataset.tap === String(el.dataset.item)) { tip.dataset.tap = ''; hideTip(); }
      else { showTip(el); tip.dataset.tap = String(el.dataset.item); }
    } else if (tipFor) hideTip();
  }, true);
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('resize', hideTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  setInterval(() => { if (tipFor && !document.contains(tipFor)) hideTip(); }, 700);      // таблицу перерисовали под курсором
}

// t — таблица с сервера: { rows, clock, paused, at, live, win }
// o: { me: uid зрителя, card: (uid) => карточка игрока лобби | null, win: 'a' | 'b' | null — итог, если он уже отмечен }
export function scoreHtml(t, o) {
  o = o || {};
  const rows = (t && t.rows) || [];
  if (!rows.length) return '';
  const max = {};
  for (const [k] of COLS) max[k] = Math.max(1, ...rows.map((r) => r[k] || 0));
  const win = o.win || (t.live ? null : t.win);
  const withItems = rows.some((r) => r.items && r.items.length && r.items.some((id) => meta.itemById.has(id)));

  const row = (r) => {
    const c = r.uid && o.card ? o.card(r.uid) : null;
    const name = (c && c.name) || r.name || 'Игрок';
    // уровень не показываем: в трансляции и в итогах матча это разные числа (в трансляции рос до 72, в итогах у всех 36),
    // а какое из них видно в игре — не сверено
    // r.nick — игрок сыграл с аккаунта Steam, не привязанного к сайту: в строке его имя с сайта, ник из игры — подписью
    const sub = (r.hero ? esc(heroName(r.hero)) : 'выбирает героя') + (r.nick ? ` · в игре «${esc(r.nick)}»` : '');
    const cells = COLS.map(([k, , cls]) => `<span class="sc ${cls || ''} ${r[k] && r[k] === max[k] ? 'best' : ''}"><b>${num(r[k] || 0)}</b><i style="width:${Math.round(100 * (r[k] || 0) / max[k])}%"></i></span>`).join('');
    // o.login — где знаем логин игрока, имя ведёт в его профиль (в окне сыгранной игры; в идущем лобби строка открывает карточку)
    const login = r.uid && o.login ? o.login(r.uid) : '';
    const who = login ? `<a class="plink" href="#/u/${esc(login)}" title="Открыть профиль">${esc(name)}</a>` : esc(name);
    return `<div class="srow ${r.team} ${r.dead && t.live ? 'dead' : ''} ${r.uid && r.uid === o.me ? 'mine' : ''}"${r.uid ? ` data-uid="${esc(r.uid)}"` : ''} data-sv="${['kda'].concat(COLS.map((c) => c[0])).map((k) => sortVal(r, k)).join(',')}">
      <span class="sp">${heroImg(r.hero, 'm')}<span class="who"><b>${who}${r.mvp ? `<span class="tag mvp m${r.mvp}" title="${r.mvp === 1 ? 'Лучший игрок матча — так отметила сама игра' : `${r.mvp}-е место среди лучших игроков матча`}">${r.mvp === 1 ? 'MVP' : 'топ-' + r.mvp}</span>` : ''}</b><span class="sub">${sub}</span></span></span>
      <span class="kda"><b>${r.k || 0}</b><em>/</em><b class="dth">${r.d || 0}</b><em>/</em><b>${r.a || 0}</b></span>${cells}${withItems ? `<span class="its">${itemsHtml(r.items)}</span>` : ''}</div>`;
  };

  const team = (k) => {
    const list = rows.filter((r) => r.team === k).sort((x, y) => sortVal(y, sortKey) - sortVal(x, sortKey));
    if (!list.length) return '';
    const kills = list.reduce((n, r) => n + (r.k || 0), 0);
    const souls = list.reduce((n, r) => n + (r.nw || 0), 0);
    const dmg = list.reduce((n, r) => n + (r.dmg || 0), 0);
    return `<div class="sth ${k} ${win === k ? 'win' : ''}"><span class="tn">${TEAM[k]}${win === k ? '<em>победа</em>' : ''}</span>
      <span class="tsum"><b>${kills}</b> ${plural(kills, 'убийство', 'убийства', 'убийств')} · <b>${num(souls)}</b> душ${dmg ? `<span class="opt"> · <b>${num(dmg)}</b> урона</span>` : ''}</span></div>${list.map(row).join('')}`;
  };

  let stamp = '';
  if (t.live) {
    // часы таблицы: идут сами между снимками; трансляция отстаёт от игры секунд на двадцать
    const time = t.clock == null ? '' : t.paused ? `<span class="sclock mono">${clock(t.clock)}</span><span class="dim">пауза</span>`
      : `<span class="sclock mono" data-since="${(t.at || 0) - t.clock}">${clock(t.clock)}</span>`;
    stamp = `<span class="chip live" title="Таблица обновляется сама и отстаёт от игры примерно на 20 секунд">LIVE</span>${time}`;
  } else if (t.clock) stamp = `<span class="dim">матч шёл <span class="mono">${clock(t.clock)}</span></span>`;

  const th = (k, title, cls) => `<button class="sh ${cls || ''} ${sortKey === k ? 'on' : ''}" data-sort="${k}" title="Выстроить игроков по этой колонке">${title}</button>`;
  return `${t.live ? '' : awardsHtml(t, o)}<section class="card score ${t.live ? 'live' : ''} ${withItems ? 'items' : ''}"><header><h2>Таблица матча</h2>${stamp}</header>
    <div class="shead"><span></span>${th('kda', 'K / D / A')}${COLS.map(([k, title, cls]) => th(k, title, cls)).join('')}${withItems ? '<span class="hits">Предметы</span>' : ''}</div>
    ${team('a')}${team('b')}</section>${t.live ? '' : duelsHtml(t, o)}`;
}

// Нажали на название колонки: игроки внутри команд встают по ней. Строки переставляем на месте — без запроса и без
// перерисовки; следующие перерисовки (живая таблица) уже сами учитывают выбор.
if (typeof document !== 'undefined' && !window.lobbyScoreSort) {
  window.lobbyScoreSort = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('.shead [data-sort]');
    if (!b) return;
    sortKey = b.dataset.sort;
    const keys = ['kda'].concat(COLS.map((c) => c[0]));
    const at = keys.indexOf(sortKey);
    for (const sec of document.querySelectorAll('section.score')) {
      for (const h of sec.querySelectorAll('.shead [data-sort]')) h.classList.toggle('on', h.dataset.sort === sortKey);
      for (const k of ['a', 'b']) {
        const head = sec.querySelector(`.sth.${k}`);
        if (!head) continue;
        const list = Array.from(sec.querySelectorAll(`.srow.${k}`));
        list.sort((x, y) => +y.dataset.sv.split(',')[at] - +x.dataset.sv.split(',')[at]);
        let after = head;
        for (const r of list) { after.after(r); after = r; }
      }
    }
  });
}

// ---- «Кто кого»: шесть на шесть, в клетке — сколько раз игрок Янтаря убил игрока Сапфира и сколько раз тот его.
// t.duels: [[место убийцы, место жертвы, убийств, урона]], место игрока — row.s (есть только у итоговой таблицы).
export function duelsHtml(t, o) {
  o = o || {};
  const rows = ((t && t.rows) || []).filter((r) => r.s);
  const duels = (t && t.duels) || [];
  if (!duels.length || !rows.length) return '';
  const name = (r) => { const c = r.uid && o.card ? o.card(r.uid) : null; return (c && c.name) || r.name || 'Игрок'; };
  const A = rows.filter((r) => r.team === 'a');
  const B = rows.filter((r) => r.team === 'b');
  if (!A.length || !B.length) return '';
  const kills = new Map();
  const dmg = new Map();
  for (const d of duels) { kills.set(d[0] + ':' + d[1], d[2]); dmg.set(d[0] + ':' + d[1], d[3]); }
  const get = (m, x, y) => m.get(x.s + ':' + y.s) || 0;
  // две фразы над таблицей: самая горячая пара и самая односторонняя
  let hot = null;
  let cold = null;
  for (const x of A) for (const y of B) {
    const p = get(kills, x, y);
    const q = get(kills, y, x);
    if (p + q > 0 && (!hot || p + q > hot.p + hot.q)) hot = { x, y, p, q };
    const lead = p >= q ? { x, y, p, q } : { x: y, y: x, p: q, q: p };
    if (lead.p - lead.q >= 3 && (!cold || lead.p - lead.q > cold.p - cold.q)) cold = lead;
  }
  const say = [];
  if (hot) say.push(`Чаще всех сходились <b class="w ${hot.x.team}">${esc(name(hot.x))}</b> и <b class="w ${hot.y.team}">${esc(name(hot.y))}</b> — <b class="dq-sc">${hot.p}:${hot.q}</b>.`);
  if (cold && !(hot && cold.x === (hot.p >= hot.q ? hot.x : hot.y) && cold.y === (hot.p >= hot.q ? hot.y : hot.x))) {
    say.push(`<b class="w ${cold.x.team}">${esc(name(cold.x))}</b> убил <b class="w ${cold.y.team}">${esc(name(cold.y))}</b> ${cold.p} ${plural(cold.p, 'раз', 'раза', 'раз')}${cold.q ? `, а сам от него погиб ${cold.q}` : ' и ни разу от него не погиб'}.`);
  }
  const top = Math.max(1, ...duels.map((d) => d[2]));
  const head = B.map((y) => `<span class="dq-h" title="${esc(name(y))} — ${esc(heroName(y.hero))}">${heroImg(y.hero, 'm')}<small>${esc(name(y))}</small></span>`).join('');
  const body = A.map((x) => `<div class="dq-r"><span class="dq-n">${heroImg(x.hero, 'm')}<b>${esc(name(x))}</b></span>${B.map((y) => {
    const p = get(kills, x, y);
    const q = get(kills, y, x);
    const tip = `${name(x)} убил ${name(y)}: ${p}, урон ${fmt(get(dmg, x, y))}. ${name(y)} убил ${name(x)}: ${q}, урон ${fmt(get(dmg, y, x))}.`;
    const side = p > q ? 'a' : q > p ? 'b' : '';
    return `<span class="dq-c ${side} ${p + q ? '' : 'none'}" style="--f:${(Math.abs(p - q) / top).toFixed(2)}" title="${esc(tip)}"><b>${p}</b><i>:</i><b>${q}</b></span>`;
  }).join('')}</div>`).join('');
  return `<section class="card duels"><header><h2>Кто кого</h2><span class="dim">убийства: слева — игрока Янтаря, справа — игрока Сапфира</span></header>
    ${say.length ? `<p class="dq-say">${say.join(' ')}</p>` : ''}
    <div class="dq" style="--n:${B.length}"><div class="dq-r dq-top"><span class="dq-n"></span>${head}</div>${body}</div></section>`;
}

// ---- номинации матча: титулы, которые сайт раздаёт после игры (владелец 22.11: «номинации можно, да. Прикольно, шоу»).
// Кому какой титул, считает сервер по итоговой таблице (customs.awards); здесь названия, подписи и вид.
// a: { key, who: [номера строк таблицы], v: число, to: номер строки жертвы — только у «Немезиды» }
const times = (n) => `${n} ${plural(n, 'раз', 'раза', 'раз')}`;
const AWARDS = {
  mvp: ['MVP матча', () => 'лучший игрок по отметке самой игры'],
  kills: ['Мясник', (v) => `${v} ${plural(v, 'убийство', 'убийства', 'убийств')} — больше всех`],
  dmg: ['Громила', (v) => `${fmt(v)} урона по героям`],
  souls: ['Банк', (v) => `${fmt(v)} душ — самый богатый`],
  assists: ['Правая рука', (v) => `${v} ${plural(v, 'ассист', 'ассиста', 'ассистов')}`],
  heal: ['Доктор', (v) => `${fmt(v)} лечения`],
  obj: ['Разрушитель', (v) => `${fmt(v)} урона по объектам`],
  nemesis: ['Немезида', (v, to) => `убил ${to} ${times(v)}`],
  clean: ['Неуловимый', (v) => (v ? `погиб всего ${times(v)}` : 'ни разу не погиб')],
  deaths: ['Камикадзе', (v) => `погиб ${times(v)} — больше всех`],
  fav: ['Любимец зрителей', () => 'приз зрительских симпатий'],          // не из таблицы: его дают голоса (favHtml)
};
// для страницы статистики и профиля: названия титулов в порядке показа
export const AWARD_KEYS = ['mvp', 'fav', 'kills', 'dmg', 'souls', 'assists', 'heal', 'obj', 'nemesis', 'clean', 'deaths'];
export const awardTitle = (key) => (AWARDS[key] ? AWARDS[key][0] : key);
const rowName = (r, o) => { const c = r.uid && o.card ? o.card(r.uid) : null; return (c && c.name) || r.name || 'Игрок'; };
const andList = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}` : names[0]);

function awardList(t, o) {
  const rows = (t && t.rows) || [];
  return ((o && o.awards) || [])
    .filter((a) => AWARDS[a.key] && Array.isArray(a.who) && a.who.length && a.who.every((i) => rows[i]) && (a.to == null || rows[a.to]))
    .map((a) => {
      const who = a.who.map((i) => rows[i]);
      return { key: a.key, title: AWARDS[a.key][0], who, team: who[0].team, hero: who[0].hero, names: who.map((r) => rowName(r, o)),
        line: AWARDS[a.key][1](a.v, a.to != null ? rowName(rows[a.to], o) : '') };
    });
}

// Блок над таблицей: титулы строкой, без карточек. Кнопка показывает церемонию — её же страница лобби запускает сама,
// когда приходит итог матча. o.awards — номинации с сервера, o.sub — строка под заголовком церемонии (кто победил).
const shows = new Map();
export function awardsHtml(t, o) {
  o = o || {};
  const list = awardList(t, o);
  if (!list.length) return '';
  const key = `${(t && t.clock) || 0}:${((t && t.rows) || []).map((r) => r.k || 0).join('.')}`;
  shows.set(key, { t, o });
  if (shows.size > 12) shows.delete(shows.keys().next().value);
  const item = (a) => `<div class="aw-i ${a.team} ${a.key}"><b class="aw-t">${a.title}</b>
    <span class="aw-w">${a.who.map((r) => heroImg(r.hero, 'm')).join('')}<b>${esc(andList(a.names))}</b></span><span class="aw-v">${esc(a.line)}</span></div>`;
  return `<section class="card aw"><header><h2>Номинации матча</h2><button class="btn sm" data-ceremony="${esc(key)}">Показать церемонию</button></header>
    <div class="aw-list">${list.map(item).join('')}</div></section>`;
}

// Церемония: титулы выходят по одному на весь экран, потом встают в ряд; в конце — стена афиш. Важный момент игры —
// сценой (его слова про «Разлом» в кликере: пауза, крупная надпись, анимация). Закрывается кнопкой, Esc и нажатием мимо.
const HOLD = 1900;            // сколько один титул стоит в центре, мс
let cerEl = null;
let cerTimers = [];
function cerKey(e) { if (e.key === 'Escape') closeCeremony(); }
export function closeCeremony() {
  cerTimers.forEach(clearTimeout);
  cerTimers = [];
  if (!cerEl) return;
  cerEl.remove();
  cerEl = null;
  document.removeEventListener('keydown', cerKey);
}
export function ceremony(t, o) {
  o = o || {};
  const list = awardList(t, o);
  if (!list.length) return false;
  closeCeremony();
  // картина героя — прямо в стиле элемента: адрес из переменной CSS браузер считал бы от папки со стилями
  const bust = (a) => { const h = meta.byId.get(a.hero); return h && h.card ? `<img class="cer-bust" src="${esc(h.card)}" alt="" decoding="async">` : ''; };
  const card = (a, big) => `<article class="cer-card ${a.team} ${a.key} ${big ? 'big' : ''}">${a.hero ? `<i class="cer-art" style="background-image:url(assets/herobg/${+a.hero}.webp)"></i>` : ''}${bust(a)}
      <h3 class="cer-t">${a.title}</h3><p class="cer-v">${esc(a.line)}</p>
      <div class="cer-who">${a.who.map((r) => heroImg(r.hero, 'm')).join('')}<b>${esc(andList(a.names))}</b></div></article>`;
  const el = document.createElement('div');
  el.className = 'cer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Номинации матча');
  el.innerHTML = `<header class="cer-top"><div class="cer-h"><b>Номинации матча</b>${o.sub ? `<span>${o.sub}</span>` : ''}</div>
      <button class="btn sm" data-cer="skip">Пропустить</button><button class="btn sm" data-cer="close">Закрыть</button></header>
    <div class="cer-spot" aria-live="polite"></div><div class="cer-row"></div>`;
  document.body.appendChild(el);
  cerEl = el;
  const spot = el.querySelector('.cer-spot');
  const row = el.querySelector('.cer-row');
  let i = 0;
  const finish = () => {
    cerTimers.forEach(clearTimeout);
    cerTimers = [];
    for (; i < list.length; i += 1) row.insertAdjacentHTML('beforeend', card(list[i], false));
    spot.innerHTML = '';
    el.classList.add('fin');
    const skip = el.querySelector('[data-cer=skip]');
    if (skip) skip.remove();
  };
  const step = () => {
    if (i >= list.length) { finish(); return; }
    spot.innerHTML = card(list[i], true);
    cerTimers.push(setTimeout(() => { row.insertAdjacentHTML('beforeend', card(list[i], false)); i += 1; step(); }, HOLD));
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cer]');
    if (b) { if (b.dataset.cer === 'skip') finish(); else closeCeremony(); } else if (e.target === el) closeCeremony();
  });
  document.addEventListener('keydown', cerKey);
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else cerTimers.push(setTimeout(step, 650));
  return true;
}
if (typeof document !== 'undefined' && !window.lobbyCeremony) {
  window.lobbyCeremony = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-ceremony]');
    const x = b && shows.get(b.dataset.ceremony);
    if (x) ceremony(x.t, x.o);
  });
}

// ---- кровная месть (владелец 22.11: «кровную месть можно сделать»): пара из разных команд, где один за прошлые игры
// сайта убил другого больше всех раз. Считает сервер (customs.feud): f = { x: кто убивал, y: кого, n, back, games }.
// o.card(uid) — карточка игрока (имя, аватар), o.team(uid) — его команда сейчас, t — итоговая таблица (тогда показываем исход).
export function feudHtml(f, o, t) {
  if (!f || !o || !o.card) return '';
  const cx = o.card(f.x);
  const cy = o.card(f.y);
  if (!cx || !cy) return '';
  const tx = o.team ? o.team(f.x) : 'a';
  // слева всегда игрок Янтаря, справа — Сапфира: как стоят команды на странице
  const L = tx === 'b' ? { c: cy, uid: f.y, n: f.back } : { c: cx, uid: f.x, n: f.n };
  const R = tx === 'b' ? { c: cx, uid: f.x, n: f.n } : { c: cy, uid: f.y, n: f.back };
  let say = `За прошлые игры <b>${esc(cx.name)}</b> убил <b>${esc(cy.name)}</b> ${times(f.n)}${f.back ? `, а сам от него погиб ${times(f.back)}` : ' и ни разу от него не погиб'}. Сегодня они снова по разные стороны.`;
  let now = '';
  const rows = ((t && !t.live && t.rows) || []).filter((r) => r.s && r.uid);
  const rx = rows.find((r) => r.uid === f.x);
  const ry = rows.find((r) => r.uid === f.y);
  if (rx && ry && t.duels) {
    const get = (p, q) => { const d = t.duels.find((z) => z[0] === p.s && z[1] === q.s); return d ? d[2] : 0; };
    const kx = get(rx, ry);
    const ky = get(ry, rx);
    const verdict = !kx && !ky ? 'В этой игре они друг друга не убивали.'
      : ky > kx ? `Месть удалась: в этой игре <b>${esc(cy.name)}</b> убил <b>${esc(cx.name)}</b> ${times(ky)}, а погиб от него ${times(kx)}.`
        : kx > ky ? `<b>${esc(cx.name)}</b> снова сильнее: в этой игре он убил <b>${esc(cy.name)}</b> ${times(kx)}, а погиб от него ${times(ky)}.`
          : `В этой игре поровну — ${kx}:${ky}. Счёт остался за <b>${esc(cx.name)}</b>.`;
    say = `До игры счёт был ${f.n}:${f.back} в пользу <b>${esc(cx.name)}</b>. ${verdict}`;
    now = `<span class="fd-now">в этой игре <b>${tx === 'b' ? ky : kx}:${tx === 'b' ? kx : ky}</b></span>`;
  }
  const side = (p, k) => `<span class="fd-p ${k}">${ava(p.c, 's')}<b>${esc(p.c.name)}</b></span>`;
  return `<section class="feud"><span class="fd-k">Кровная месть</span>
    <div class="fd-duel">${side(L, 'a')}<span class="fd-sc"><b class="a">${L.n}</b><i>:</i><b class="b">${R.n}</b>${now}</span>${side(R, 'b')}</div>
    <p class="fd-say">${say}</p></section>`;
}

// ---- приз зрительских симпатий: зрители и игроки голосуют за лучшего игрока сыгранной игры. Голосовать можно сутки:
// окно в 30 секунд владелец назвал слишком коротким («вряд ли кто-то на сайт зайдёт в течение 30 секунд после катки»).
// f — расклад с сервера (customs.fav_view): { open, until, n, mine, top: [[uid, голосов]] }; расклад виден после своего
// голоса или когда голосование закрыто. g — игра: { event, round, teams, table }. o.me — uid зрителя.
const favs = new Map();        // 'лобби:игра' -> { g, o }: чтобы перерисовать блок после голоса
export function favHtml(f, g, o) {
  o = o || {};
  if (!f || !g || !g.teams) return '';
  const rows = (g.table && g.table.rows) || [];
  const people = [];
  for (const k of ['a', 'b']) {
    for (const p of g.teams[k] || []) {
      if (p && p.uid) people.push({ uid: p.uid, name: p.name, team: k, hero: (rows.find((r) => r.uid === p.uid) || {}).hero || p.hero });
    }
  }
  if (!people.length || (!f.open && !f.n)) return '';
  const key = `${g.event}:${g.round}`;
  favs.set(key, { g, o });
  if (favs.size > 12) favs.delete(favs.keys().next().value);
  const cnt = new Map(f.top || []);
  const shown = !!(f.top && f.top.length);
  const max = shown ? Math.max(1, f.top[0][1]) : 1;
  const name = (uid) => (people.find((p) => p.uid === uid) || { name: 'игрок' }).name;
  const left = Math.max(0, f.until - Date.now() / 1000);
  const hours = left >= 3600 ? `${Math.round(left / 3600)} ч` : `${Math.max(1, Math.round(left / 60))} мин`;
  let say;
  if (!f.open) {
    const best = f.top.filter((x) => x[1] === f.top[0][1]).map((x) => name(x[0]));
    say = `Голосование закрыто. Приз ${best.length > 1 ? 'делят' : 'достался'} <b>${esc(andList(best))}</b> — ${f.top[0][1]} из ${f.n} ${plural(f.n, 'голоса', 'голосов', 'голосов')}.`;
  } else if (f.mine) say = `Твой голос — <b>${esc(name(f.mine))}</b>. Передумать можно, пока голосование открыто: ещё ${hours}.`;
  else say = `Кто был лучшим в этой игре? Нажми на игрока — голосовать можно ещё ${hours}.${f.n ? ` Уже ${f.n} ${plural(f.n, 'голос', 'голоса', 'голосов')}.` : ''}`;
  const chip = (p) => {
    const n = cnt.get(p.uid) || 0;
    const won = !f.open && shown && n === f.top[0][1];
    return `<button class="fav-p ${p.team} ${f.mine === p.uid ? 'on' : ''} ${won ? 'won' : ''}" data-fav="${esc(p.uid)}"${f.open && p.uid !== o.me ? '' : ' disabled'}>
      ${heroImg(p.hero, 'm')}<b>${esc(p.name)}</b>${shown && n ? `<span class="num">${n}</span><i style="width:${Math.round((100 * n) / max)}%"></i>` : ''}</button>`;
  };
  return `<section class="fav" data-favkey="${esc(key)}"><div class="fav-h"><b>Приз зрительских симпатий</b></div>
    <p class="fav-say">${say}</p><div class="fav-list">${people.map(chip).join('')}</div></section>`;
}
if (typeof document !== 'undefined' && !window.lobbyFav) {
  window.lobbyFav = true;
  document.addEventListener('click', async (e) => {
    const b = e.target.closest && e.target.closest('[data-fav]');
    const box = b && b.closest('[data-favkey]');
    const x = box && favs.get(box.dataset.favkey);
    if (!x || b.disabled) return;
    e.preventDefault();
    if (!user.me) { login(); return; }
    try {
      const r = await call(`/games/${x.g.event}/${x.g.round}`, { fav: b.dataset.fav });
      x.g.fav = r.fav;
      toast('Голос принят');
      const now = document.querySelector(`[data-favkey="${box.dataset.favkey}"]`);
      if (now) now.outerHTML = favHtml(r.fav, x.g, Object.assign({}, x.o, { me: user.me.id }));
      // страница лобби перерисовывается сама — пусть знает новый расклад
      document.dispatchEvent(new CustomEvent('lobby:fav', { detail: { key: box.dataset.favkey, fav: r.fav } }));
    } catch (err) { oops(err); }
  });
}

// ---- прошедшие игры: строка в списке и окно с таблицей
// m — строка списка игр с сервера: { event, round, at, winner, duration, title, kills: [a, b] | null, table: есть ли она }
// день и время, когда игра закончилась: в один вечер игр бывает несколько
const when = (m) => `${dateRu(m.at)}, ${new Date(m.at * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}${m.round > 1 ? ' · игра ' + m.round : ''}`;

// o.host — показать, чья это игра (на главной, где игры всех ведущих вперемешку)
export function gameRow(m, i, o) {
  const host = o && o.host && m.host ? `<span class="gh">${ava(m.host)}<b>${esc(m.host.name)}</b></span>` : '';
  return `<button class="grow ${m.winner}" data-game="${i}">${host}
    <span class="gw"><span class="tn">${TEAM[m.winner]} победил</span>${m.kills ? `<b>${m.kills[0]} : ${m.kills[1]}</b>` : ''}</span>
    <span class="gd">${when(m)}${m.duration ? ` · шла ${clock(m.duration)}` : ''}${m.table ? '' : ' · без таблицы'}</span></button>`;
}

// Окно игры: составы и таблица грузятся, когда игру открыли.
// o.me — uid зрителя: его строка в таблице подсвечивается
export async function openGame(m, o) {
  const title = `${m.host && m.host.name ? esc(m.host.name) + ' · ' : ''}${when(m)}`;
  const sum = `<p class="gsum"><b class="w ${m.winner}">Победил ${TEAM[m.winner]}</b>${m.duration ? ` · матч шёл <span class="mono">${clock(m.duration)}</span>` : ''}${m.title ? ` · ${esc(m.title)}` : ''}</p>`;
  const win = modal(`${head(title)}<div class="body gamebody">${sum}<div class="gload dim">Загружаю таблицу…</div></div>`, { wide: true });
  const box = win.el.querySelector('.gload');
  try {
    const g = await call(`/games/${m.event}/${m.round}`);
    const people = new Map();
    for (const k of ['a', 'b']) for (const p of (g.teams && g.teams[k]) || []) people.set(p.uid, p);
    const link = (p) => (p.login ? `<a class="plink" href="#/u/${esc(p.login)}">${esc(p.name)}</a>` : esc(p.name));
    const names = (k) => (g.teams && g.teams[k] ? g.teams[k].map(link).join(', ') : '');
    const bans = (g.bans || []).length ? `<p class="gbans"><span class="dim">Баны</span>${g.bans.map((h) => heroImg(h, 'm')).join('')}</p>` : '';
    const side = (uid) => (((g.teams && g.teams.a) || []).some((p) => p.uid === uid) ? 'a' : 'b');
    const sub = `Победил ${TEAM[g.winner] || ''}${m.duration ? ` · матч шёл ${clock(m.duration)}` : ''}`;
    const tipLine = g.predict ? `<p class="gtip">Прогноз зрителей: за Янтарь ${g.predict.a}, за Сапфир ${g.predict.b} — угадали ${g.predict.right} из ${g.predict.a + g.predict.b}.${g.predict.mine ? (g.predict.pts ? ` Твой прогноз сошёлся: +${g.predict.pts}.` : ' Твой прогноз не сошёлся.') : ''}</p>` : '';
    box.outerHTML = tipLine + favHtml(g.fav, g, { me: o && o.me }) + (g.table && g.table.rows && g.table.rows.length
      ? feudHtml(g.feud, { card: (uid) => people.get(uid) || null, team: side }, g.table)
        + scoreHtml(Object.assign({}, g.table, { live: false }), { win: g.winner, me: o && o.me, login: (uid) => (people.get(uid) || {}).login || '', awards: g.awards, sub }) + bans
      : `<p class="dim">Таблицы этой игры нет: её сайт ведёт только у матчей, за которыми смог проследить.</p>
         <p><b class="w a">Янтарь:</b> ${names('a')}</p><p><b class="w b">Сапфир:</b> ${names('b')}</p>`);
  } catch (e) {
    box.textContent = 'Не получилось загрузить игру. Попробуй ещё раз.';
  }
}
