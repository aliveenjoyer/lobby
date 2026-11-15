// Таблица матча: живая, пока игра идёт, и итоговая после неё.
// Одна и та же на странице лобби, в слое для OBS и в прошедших играх на странице ведущего.
import { meta, call } from './api.js?v=20261116052615';
import { esc, ava, heroImg, heroName, fmt, plural, clock, dateRu, modal, head } from './ui.js?v=20261116052615';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
// колонки с числами; opt — на телефоне прячутся
const COLS = [['nw', 'Души'], ['dmg', 'Урон'], ['obj', 'Объекты', 'opt'], ['heal', 'Лечение', 'opt']];

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
    return `<section class="ts">${head}${sec.x ? `<p>${esc(sec.x).replace(/\n/g, '<br>')}</p>` : ''}${big ? `<div class="tbigs">${big}</div>` : ''}${rest}</section>`;
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
    const sub = r.hero ? esc(heroName(r.hero)) : 'выбирает героя';
    const cells = COLS.map(([k, , cls]) => `<span class="sc ${cls || ''} ${r[k] && r[k] === max[k] ? 'best' : ''}"><b>${fmt(r[k] || 0)}</b><i style="width:${Math.round(100 * (r[k] || 0) / max[k])}%"></i></span>`).join('');
    return `<div class="srow ${r.team} ${r.dead && t.live ? 'dead' : ''} ${r.uid && r.uid === o.me ? 'mine' : ''}"${r.uid ? ` data-uid="${esc(r.uid)}"` : ''}>
      <span class="sp">${heroImg(r.hero, 'm')}<span class="who"><b>${esc(name)}${r.mvp ? `<span class="tag mvp m${r.mvp}" title="${r.mvp === 1 ? 'Лучший игрок матча — так отметила сама игра' : `${r.mvp}-е место среди лучших игроков матча`}">${r.mvp === 1 ? 'MVP' : 'топ-' + r.mvp}</span>` : ''}</b><span class="sub">${sub}</span></span></span>
      <span class="kda"><b>${r.k || 0}</b><em>/</em><b class="dth">${r.d || 0}</b><em>/</em><b>${r.a || 0}</b></span>${cells}${withItems ? `<span class="its">${itemsHtml(r.items)}</span>` : ''}</div>`;
  };

  const team = (k) => {
    const list = rows.filter((r) => r.team === k);
    if (!list.length) return '';
    const kills = list.reduce((n, r) => n + (r.k || 0), 0);
    const souls = list.reduce((n, r) => n + (r.nw || 0), 0);
    return `<div class="sth ${k} ${win === k ? 'win' : ''}"><span class="tn">${TEAM[k]}${win === k ? ' — победа' : ''}</span>
      <span class="tsum"><b>${kills}</b> ${plural(kills, 'убийство', 'убийства', 'убийств')} · <b>${fmt(souls)}</b> душ</span></div>${list.map(row).join('')}`;
  };

  let stamp = '';
  if (t.live) {
    // часы таблицы: идут сами между снимками; трансляция отстаёт от игры секунд на двадцать
    const time = t.clock == null ? '' : t.paused ? `<span class="sclock mono">${clock(t.clock)}</span><span class="dim">пауза</span>`
      : `<span class="sclock mono" data-since="${(t.at || 0) - t.clock}">${clock(t.clock)}</span>`;
    stamp = `<span class="chip live" title="Таблица обновляется сама и отстаёт от игры примерно на 20 секунд">LIVE</span>${time}`;
  } else if (t.clock) stamp = `<span class="dim">матч шёл <span class="mono">${clock(t.clock)}</span></span>`;

  return `<section class="card score ${t.live ? 'live' : ''} ${withItems ? 'items' : ''}"><header><h2>Таблица матча</h2>${stamp}</header>
    <div class="shead"><span></span><span>K / D / A</span>${COLS.map(([, title, cls]) => `<span class="${cls || ''}">${title}</span>`).join('')}${withItems ? '<span class="hits">Предметы</span>' : ''}</div>
    ${team('a')}${team('b')}</section>`;
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
export async function openGame(m) {
  const title = `${m.host && m.host.name ? esc(m.host.name) + ' · ' : ''}${when(m)}`;
  const sum = `<p class="gsum"><b class="w ${m.winner}">Победил ${TEAM[m.winner]}</b>${m.duration ? ` · матч шёл <span class="mono">${clock(m.duration)}</span>` : ''}${m.title ? ` · ${esc(m.title)}` : ''}</p>`;
  const win = modal(`${head(title)}<div class="body gamebody">${sum}<div class="gload dim">Загружаю таблицу…</div></div>`, { wide: true });
  const box = win.el.querySelector('.gload');
  try {
    const g = await call(`/games/${m.event}/${m.round}`);
    const names = (k) => (g.teams && g.teams[k] ? g.teams[k].map((p) => esc(p.name)).join(', ') : '');
    box.outerHTML = g.table && g.table.rows && g.table.rows.length ? scoreHtml(Object.assign({}, g.table, { live: false }), { win: g.winner })
      : `<p class="dim">Таблицы этой игры нет: её сайт ведёт только у матчей, за которыми смог проследить.</p>
         <p><b class="w a">Янтарь:</b> ${names('a')}</p><p><b class="w b">Сапфир:</b> ${names('b')}</p>`;
  } catch (e) {
    box.textContent = 'Не получилось загрузить игру. Попробуй ещё раз.';
  }
}
