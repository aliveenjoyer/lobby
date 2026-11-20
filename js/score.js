// Таблица матча: живая, пока игра идёт, и итоговая после неё.
// Одна и та же на странице лобби, в слое для OBS и в прошедших играх на странице ведущего.
import { meta, call } from './api.js?v=20261121065955';
import { esc, ava, heroImg, heroName, fmt, plural, clock, dateRu, modal, head } from './ui.js?v=20261121065955';

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
  return `<section class="card score ${t.live ? 'live' : ''} ${withItems ? 'items' : ''}"><header><h2>Таблица матча</h2>${stamp}</header>
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
    box.outerHTML = g.table && g.table.rows && g.table.rows.length
      ? scoreHtml(Object.assign({}, g.table, { live: false }), { win: g.winner, me: o && o.me, login: (uid) => (people.get(uid) || {}).login || '' }) + bans
      : `<p class="dim">Таблицы этой игры нет: её сайт ведёт только у матчей, за которыми смог проследить.</p>
         <p><b class="w a">Янтарь:</b> ${names('a')}</p><p><b class="w b">Сапфир:</b> ${names('b')}</p>`;
  } catch (e) {
    box.textContent = 'Не получилось загрузить игру. Попробуй ещё раз.';
  }
}
