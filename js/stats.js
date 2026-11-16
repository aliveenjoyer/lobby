// Статистика кастомок: кто сколько сыграл и выиграл, кто кого убивает, кто с кем играет, герои и рекорды.
// Считает сервер по играм, сыгранным через лобби (server/customs.py); здесь только вид.
import { call } from './api.js?v=20261116072020';
import { esc, ava, heroImg, heroName, fmt, plural, clock, dateRu } from './ui.js?v=20261116072020';
import { openGame } from './score.js?v=20261116072020';
import { user } from './auth.js?v=20261116072020';

const dec = (x, n) => Number(x).toFixed(n == null ? 1 : n).replace('.', ',');
const num = (n) => fmt(n).replace(/\s/g, '<i class="nsp"></i>');
const pct = (w, g) => (g ? Math.round((100 * w) / g) : 0);
const kda = (p) => (p.k + p.a) / Math.max(1, p.d);

// колонки таблицы игроков: ключ, подпись, значение для сортировки, что показать; opt — прячется на узком экране
const COLS = [
  ['g', 'Игры', (p) => p.g, (p) => p.g],
  ['w', 'Победы', (p) => p.w * 1000 + pct(p.w, p.g), (p) => `<span class="cs-wl"><b>${p.w}–${p.g - p.w}</b><i><em style="width:${pct(p.w, p.g)}%"></em></i><small>${pct(p.w, p.g)}%</small></span>`],
  ['kda', 'K / D / A за игру', (p) => (p.tg ? kda(p) : -1), (p) => (p.tg ? `<span class="cs-kda">${dec(p.k / p.tg)}<em>/</em>${dec(p.d / p.tg)}<em>/</em>${dec(p.a / p.tg)}</span>` : '—'), 'mid'],
  ['dmg', 'Урон', (p) => (p.tg ? p.dmg / p.tg : -1), (p) => (p.tg ? num(Math.round(p.dmg / p.tg)) : '—'), 'opt'],
  ['nw', 'Души', (p) => (p.tg ? p.nw / p.tg : -1), (p) => (p.tg ? num(Math.round(p.nw / p.tg)) : '—'), 'opt'],
  ['mvp', 'MVP', (p) => p.mvp, (p) => p.mvp || '<span class="mute">—</span>', 'opt'],
];
const RECORD = {
  k: ['Больше всего убийств', (v) => fmt(v)], a: ['Больше всего помощи', (v) => fmt(v)], dmg: ['Больше всего урона', (v) => num(v)],
  nw: ['Больше всего душ', (v) => num(v)], heal: ['Больше всего лечения', (v) => num(v)], obj: ['Больше всего урона по объектам', (v) => num(v)],
  d: ['Больше всего смертей', (v) => fmt(v)], long: ['Самая долгая игра', (v) => clock(v)], blood: ['Самая кровавая игра, убийств', (v) => fmt(v)],
};
const SHOWN = 15;       // столько игроков видно сразу

export function mountStats(view, host) {
  let d = null;
  let by = new Map();
  let sort = 'w';
  let all = false;
  let alive = true;

  const who = (id, cls) => {
    const p = by.get(id);
    if (!p) return '<span class="mute">игрок</span>';
    return p.login ? `<a class="plink ${cls || ''}" href="#/u/${esc(p.login)}">${esc(p.name)}</a>` : `<span class="${cls || ''}" title="Играл с аккаунта Steam, не привязанного к сайту">${esc(p.name)}</span>`;
  };
  const face = (id) => ava(by.get(id) || { name: '?' }, 's');

  function playersHtml() {
    const col = COLS.find((c) => c[0] === sort) || COLS[1];
    const list = d.players.slice().sort((p, q) => col[2](q) - col[2](p) || q.w - p.w || kda(q) - kda(p));
    const rows = list.slice(0, all ? list.length : SHOWN).map((p, i) => {
      const heroes = (p.heroes || []).slice(0, 3).map((h) => `<span title="${esc(heroName(h[0]))}: игр ${h[1]}, побед ${h[2]}">${heroImg(h[0], 'm')}</span>`).join('');
      const tag = p.login ? '' : '<small>не на сайте</small>';
      const name = p.login ? `<a class="cs-who" href="#/u/${esc(p.login)}">${ava(p, 's')}<b>${esc(p.name)}</b></a>` : `<span class="cs-who">${ava(p, 's')}<b>${esc(p.name)}</b>${tag}</span>`;
      return `<div class="cs-row ${p.id === (user.me && user.me.id) ? 'mine' : ''}"><span class="cs-no ${i < 3 ? 'top' : ''}">${i + 1}</span>${name}<span class="cs-heroes">${heroes}</span>
        ${COLS.map((c) => `<span class="cs-c ${c[4] || ''} ${c[0] === sort ? 'on' : ''}">${c[3](p)}</span>`).join('')}</div>`;
    }).join('');
    const more = !all && list.length > SHOWN ? `<button class="mmore" data-cs="all">Показать всех — ещё ${list.length - SHOWN}</button>` : '';
    return `<div class="cs-row cs-top"><span></span><span>Игрок</span><span class="cs-heroes">Герои</span>
      ${COLS.map((c) => `<button class="cs-c ${c[4] || ''} ${c[0] === sort ? 'on' : ''}" data-cs-sort="${c[0]}" title="Выстроить по этой колонке">${c[1]}</button>`).join('')}</div>${rows}${more}`;
  }

  function duelsHtml() {
    if (!d.duels.length) return '';
    const rows = d.duels.slice(0, 10).map((r) => {
      const [a, b, ka, kb, da, db] = r;
      const total = Math.max(1, ka + kb);
      return `<div class="cs-duel ${ka > kb ? 'la' : kb > ka ? 'lb' : ''}"><span class="cs-side">${face(a)}${who(a)}</span>
        <span class="cs-tug"><b>${ka}</b><i><em style="width:${(100 * ka / total).toFixed(1)}%"></em><em style="width:${(100 * kb / total).toFixed(1)}%"></em></i><b>${kb}</b></span>
        <span class="cs-side r">${who(b)}${face(b)}</span>
        <small>${da || db ? `урон друг по другу: ${fmt(da)} и ${fmt(db)}` : ''}</small></div>`;
    }).join('');
    return `<section class="pf-sec"><header><h2>Кто кого</h2><span>сколько раз игроки убивали друг друга за все игры</span></header>
      <div class="pf-panel cs-duels">${rows}</div></section>`;
  }

  function matesHtml() {
    if (!d.mates.length) return '';
    const rows = d.mates.slice(0, 8).map((m) => `<div class="cs-mate"><span class="cs-pair">${face(m[0])}${face(m[1])}</span>
      <span class="cs-names">${who(m[0])} <em>и</em> ${who(m[1])}</span>
      <span class="cs-wl"><b>${m[3]}–${m[2] - m[3]}</b><i><em style="width:${pct(m[3], m[2])}%"></em></i><small>${pct(m[3], m[2])}%</small></span></div>`).join('');
    return `<section class="pf-sec"><header><h2>Связки</h2><span>кто чаще побеждает в одной команде</span></header>
      <div class="pf-panel cs-list">${rows}</div></section>`;
  }

  function recordsHtml() {
    if (!d.records.length) return '';
    const cards = d.records.map((r, i) => {
      const [title, show] = RECORD[r.what] || [r.what, fmt];
      const p = r.id ? by.get(r.id) : null;
      return `<button class="cs-rec" data-cs-rec="${i}"><span>${title}</span><b>${show(r.v)}</b>
        <em>${p ? `${r.hero ? heroImg(r.hero, 'm') : ''}${esc(p.name)}` : `Победил ${r.winner === 'a' ? 'Янтарь' : 'Сапфир'}`}</em><small>${dateRu(r.at)}</small></button>`;
    }).join('');
    return `<section class="pf-sec"><header><h2>Рекорды</h2><span>лучшее за одну игру; нажми — откроется таблица того матча</span></header>
      <div class="cs-recs">${cards}</div></section>`;
  }

  function heroesHtml() {
    const picked = d.heroes.filter((h) => h[1] > 0);
    if (!picked.length) return '';
    const top = Math.max(...picked.map((h) => h[1]));
    const rows = picked.slice(0, 18).map((h) => {
      const [id, g, w, bans, k, dd, a, tg] = h;
      return `<div class="cs-hero">${heroImg(id, 'm')}<b>${esc(heroName(id))}</b>
        <span class="cs-bar"><i style="width:${Math.max(4, Math.round((100 * g) / top))}%"></i><em>${g} ${plural(g, 'игра', 'игры', 'игр')}</em></span>
        <span class="cs-c">${pct(w, g)}%</span><span class="cs-c opt">${tg ? `${dec(k / tg)}<em>/</em>${dec(dd / tg)}<em>/</em>${dec(a / tg)}` : '—'}</span>
        <span class="cs-c opt">${bans ? bans : '<span class="mute">—</span>'}</span></div>`;
    }).join('');
    const banned = d.heroes.filter((h) => h[3] > 0).sort((p, q) => q[3] - p[3]).slice(0, 8);
    return `<section class="pf-sec"><header><h2>Герои</h2><span>кого берут в кастомках и как на них играют</span></header>
      <div class="pf-panel cs-list"><div class="cs-hero cs-top"><span></span><span>Герой</span><span>Берут</span><span class="cs-c">Побед</span><span class="cs-c opt">K / D / A</span><span class="cs-c opt">Баны</span></div>${rows}</div>
      ${banned.length ? `<p class="cs-bans"><span>Чаще всего банят</span>${banned.map((h) => `<em title="${esc(heroName(h[0]))}">${heroImg(h[0], 'm')}<b>${h[3]}</b></em>`).join('')}</p>` : ''}</section>`;
  }

  function draw() {
    if (!alive) return;
    by = new Map(d.players.map((p) => [p.id, p]));
    const hosts = (d.hosts || []).length > 1 || d.host
      ? `<nav class="cs-hosts"><a href="#/stats" class="${d.host ? '' : 'on'}">Все ведущие</a>${(d.hosts || []).map((h) => `<a href="#/stats/${esc(h.login)}" class="${d.host === h.login ? 'on' : ''}">${esc(h.name)}<small>${h.games}</small></a>`).join('')}</nav>` : '';
    const hours = Math.floor(d.secs / 3600);
    const mins = Math.round((d.secs % 3600) / 60);
    const head = `<header class="cs-head"><div><h1>Статистика кастомок</h1>
        <p>Игры, сыгранные через лобби на этом сайте. Считается сама после каждого матча.</p></div>${hosts}</header>`;
    if (!d.games) {
      view.innerHTML = `<div class="pf cs">${head}<div class="pf-panel pf-empty">Игр пока не было. Сыграйте первую кастомку через лобби — и здесь появятся игроки, герои и «кто кого».</div></div>`;
      return;
    }
    view.innerHTML = `<div class="pf cs">${head}
      <div class="cs-tot"><div><b>${fmt(d.games)}</b><span>${plural(d.games, 'игра', 'игры', 'игр')}</span></div>
        <div><b>${fmt(d.players.length)}</b><span>${plural(d.players.length, 'игрок', 'игрока', 'игроков')}</span></div>
        <div><b>${hours ? `${hours}<small> ч </small>` : ''}${mins}<small> мин</small></b><span>в игре</span></div>
        <div><b>${num(d.kills)}</b><span>${plural(d.kills, 'убийство', 'убийства', 'убийств')}</span></div></div>
      <section class="pf-sec"><header><h2>Игроки</h2><span>нажми на название колонки — список встанет по ней</span></header>
        <div class="pf-panel cs-table" id="cs-players">${playersHtml()}</div></section>
      ${duelsHtml()}${matesHtml()}${recordsHtml()}${heroesHtml()}</div>`;
  }

  view.innerHTML = '<div class="card empty">Загружаю…</div>';
  view.onclick = (e) => {
    if (!d) return;
    const s = e.target.closest('[data-cs-sort]');
    if (s) { sort = s.dataset.csSort; view.querySelector('#cs-players').innerHTML = playersHtml(); return; }
    if (e.target.closest('[data-cs="all"]')) { all = true; view.querySelector('#cs-players').innerHTML = playersHtml(); return; }
    const r = e.target.closest('[data-cs-rec]');
    if (r) { const x = d.records[+r.dataset.csRec]; if (x) openGame(x, { me: user.me && user.me.id }); }
  };
  call('/customs' + (host ? '/' + encodeURIComponent(host) : '')).then((x) => { d = x; draw(); }).catch((e) => {
    if (alive) view.innerHTML = `<div class="card empty"><h3>${esc(e.message || 'Не получилось загрузить статистику')}</h3>
      <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/stats">Вся статистика</a></div></div>`;
  });
  return () => { alive = false; };
}
