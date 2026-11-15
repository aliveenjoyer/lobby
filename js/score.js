// Таблица матча: живая, пока игра идёт, и итоговая после неё.
// Одна и та же на странице лобби, в слое для OBS и в прошедших играх на странице ведущего.
import { esc, heroImg, heroName, fmt, plural, clock } from './ui.js?v=20261116035856';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
// колонки с числами; opt — на телефоне прячутся
const COLS = [['nw', 'Души'], ['dmg', 'Урон'], ['obj', 'Объекты', 'opt'], ['heal', 'Лечение', 'opt']];

// t — таблица с сервера: { rows, clock, paused, at, live, win }
// o: { me: uid зрителя, card: (uid) => карточка игрока лобби | null, win: 'a' | 'b' | null — итог, если он уже отмечен }
export function scoreHtml(t, o) {
  o = o || {};
  const rows = (t && t.rows) || [];
  if (!rows.length) return '';
  const max = {};
  for (const [k] of COLS) max[k] = Math.max(1, ...rows.map((r) => r[k] || 0));
  const win = o.win || (t.live ? null : t.win);

  const row = (r) => {
    const c = r.uid && o.card ? o.card(r.uid) : null;
    const name = (c && c.name) || r.name || 'Игрок';
    const sub = r.hero ? `${esc(heroName(r.hero))}${r.lvl ? ` · ${r.lvl} ур.` : ''}` : 'выбирает героя';
    const cells = COLS.map(([k, , cls]) => `<span class="sc ${cls || ''} ${r[k] && r[k] === max[k] ? 'best' : ''}"><b>${fmt(r[k] || 0)}</b><i style="width:${Math.round(100 * (r[k] || 0) / max[k])}%"></i></span>`).join('');
    return `<div class="srow ${r.team} ${r.dead && t.live ? 'dead' : ''} ${r.uid && r.uid === o.me ? 'mine' : ''}"${r.uid ? ` data-uid="${esc(r.uid)}"` : ''}>
      <span class="sp">${heroImg(r.hero, 'm')}<span class="who"><b>${esc(name)}</b><span class="sub">${sub}</span></span></span>
      <span class="kda"><b>${r.k || 0}</b><em>/</em><b class="dth">${r.d || 0}</b><em>/</em><b>${r.a || 0}</b></span>${cells}</div>`;
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

  return `<section class="card score ${t.live ? 'live' : ''}"><header><h2>Таблица матча</h2>${stamp}</header>
    <div class="shead"><span></span><span>K / D / A</span>${COLS.map(([, title, cls]) => `<span class="${cls || ''}">${title}</span>`).join('')}</div>
    ${team('a')}${team('b')}</section>`;
}
