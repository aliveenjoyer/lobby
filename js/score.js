// Таблица матча: живая, пока игра идёт, и итоговая после неё.
// Одна и та же на странице лобби, в слое для OBS и в прошедших играх на странице ведущего.
import { meta } from './api.js?v=20261116044426';
import { esc, heroImg, heroName, fmt, plural, clock, dateRu, modal, head } from './ui.js?v=20261116044426';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
// колонки с числами; opt — на телефоне прячутся
const COLS = [['nw', 'Души'], ['dmg', 'Урон'], ['obj', 'Объекты', 'opt'], ['heal', 'Лечение', 'opt']];

const SLOT = { w: 'Оружие', v: 'Живучесть', s: 'Дух' };
const ORDER = { w: 0, v: 1, s: 2 };

// Предметы игрока плитками: цвет плитки — категория, как в игре. Порядок: оружие, живучесть, дух; внутри — как куплены.
function itemsHtml(ids) {
  const list = (ids || []).map((id, n) => ({ x: meta.itemById.get(id), n })).filter((o) => o.x);
  if (!list.length) return '';
  list.sort((a, b) => ORDER[a.x.s] - ORDER[b.x.s] || a.n - b.n);
  // обычно значок — белый рисунок на прозрачном фоне; у немногих предметов есть только цветная картинка из магазина
  return list.map(({ x }) => `<span class="it ${x.s} ${x.i && x.i.includes('/images/items/') ? 'full' : ''}" title="${esc(x.n)} · ${SLOT[x.s]}">${x.i ? `<img src="${esc(x.i)}" alt="${esc(x.n)}" loading="lazy">` : ''}</span>`).join('');
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
const has = (m) => !!(m && m.table && m.table.rows && m.table.rows.length);
// день и время, когда игра закончилась: в один вечер игр бывает несколько
const when = (m) => `${dateRu(m.at)}, ${new Date(m.at * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}${m.round > 1 ? ' · игра ' + m.round : ''}`;

export function gameRow(m, i) {
  const kills = (k) => m.table.rows.filter((r) => r.team === k).reduce((n, r) => n + (r.k || 0), 0);
  return `<button class="grow ${m.winner}" data-game="${i}">
    <span class="gw"><span class="tn">${TEAM[m.winner]} победил</span>${has(m) ? `<b>${kills('a')} : ${kills('b')}</b>` : ''}</span>
    <span class="gd">${when(m)}${m.duration ? ` · шла ${clock(m.duration)}` : ''}${has(m) ? '' : ' · без таблицы'}</span></button>`;
}

export function openGame(m) {
  const names = (k) => (m.teams && m.teams[k] ? m.teams[k].map((p) => esc(p.name)).join(', ') : '');
  const body = has(m) ? scoreHtml(Object.assign({}, m.table, { live: false }), { win: m.winner })
    : `<p class="dim">Таблицы этой игры нет: её сайт ведёт только у матчей, за которыми смог проследить.</p>
       <p><b class="w a">Янтарь:</b> ${names('a')}</p><p><b class="w b">Сапфир:</b> ${names('b')}</p>`;
  modal(`${head(when(m))}<div class="body gamebody">
    <p class="gsum"><b class="w ${m.winner}">Победил ${TEAM[m.winner]}</b>${m.duration ? ` · матч шёл <span class="mono">${clock(m.duration)}</span>` : ''}${m.title ? ` · ${esc(m.title)}` : ''}</p>
    ${body}</div>`, { wide: true });
}
