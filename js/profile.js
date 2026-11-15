// Подробная статистика игрока: ранг и сила, стиль игры, история ранга, форма, герои, последние матчи.
// Цифры считает сервер по открытым данным deadlock-api (server/stats.py); здесь только отрисовка.
import { esc, heroImg, heroName, badgeImg, badgeName, fmt, plural } from './ui.js?v=20261116022036';

const AXES = [['dmg', 'Урон'], ['farm', 'Фарм'], ['obj', 'Объекты'], ['sup', 'Поддержка'], ['tank', 'Стойкость'], ['surv', 'Выживаемость']];
const MODE = { r: 'рейтинг', u: 'обычный', b: 'Street Brawl', c: 'кастомка', o: '' };
const SRC = { game: 'ранг из игры', none: 'в игре ранга пока нет', host: 'ранг поставил ведущий' };

export function grade(score) {
  if (score == null) return '';
  return score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : score >= 25 ? 'D' : 'F';
}
const gradeChip = (score) => (score == null ? '<span class="grade none">—</span>'
  : `<span class="grade g${grade(score)}" title="${score} из 100">${grade(score)}</span>`);
const dec = (x, n) => (x == null ? '—' : Number(x).toFixed(n == null ? 1 : n).replace('.', ','));
const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x));
const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

function ago(ts) {
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' мин назад';
  if (d < 86400) return Math.round(d / 3600) + ' ч назад';
  const days = Math.round(d / 86400);
  if (days === 1) return 'вчера';
  if (days < 31) return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// Шесть осей по кругу; кольцо на половине радиуса — «как у всех».
export function radarSvg(radar) {
  const cx = 230, cy = 136, R = 88;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (f) => AXES.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const val = (k) => (radar[k] == null ? 50 : radar[k]);
  const shape = AXES.map((a, i) => pt(i, (R * Math.max(6, val(a[0]))) / 100).map((v) => v.toFixed(1)).join(',')).join(' ');
  const dots = AXES.map((a, i) => { const [x, y] = pt(i, (R * Math.max(6, val(a[0]))) / 100); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#fff"/>`; }).join('');
  const spokes = AXES.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#2a2a2a"/>`; }).join('');
  const labels = AXES.map((a, i) => {
    const [x, y] = pt(i, R + 16);
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
    const dy = i === 0 ? -4 : i === 3 ? 14 : 4;
    return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}" font-size="12" fill="#a0a0a0">${a[1]} <tspan fill="#f7fafc" font-weight="600">${radar[a[0]] == null ? '—' : radar[a[0]]}</tspan></text>`;
  }).join('');
  return `<svg class="radar" viewBox="0 0 460 276" role="img" aria-label="Стиль игры по шести осям">
    ${[1, 0.75, 0.25].map((f) => `<polygon points="${poly(f)}" fill="none" stroke="#2a2a2a"/>`).join('')}
    <polygon points="${poly(0.5)}" fill="none" stroke="#5a5a5a" stroke-dasharray="3 4"/>${spokes}
    <polygon points="${shape}" fill="rgba(255,255,255,.13)" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

// Очки ранга после каждого рейтингового матча; горизонтальные линии — границы подрангов.
export function histSvg(pts) {
  if (!pts || pts.length < 2) return '';
  const W = 640, H = 200, L = 104, Rr = 16, T = 14, B = 16;
  const edges = [];
  for (let tier = 1; tier <= 11; tier++) for (let sub = 1; sub <= 6; sub++) edges.push({ p: (tier - 1) * 6500 + (sub - 1) * 1000, b: tier * 10 + sub });
  const min = Math.min(...pts), max = Math.max(...pts);
  const lo = (edges.filter((e) => e.p <= min).pop() || edges[0]).p;
  const hi = (edges.find((e) => e.p > max) || { p: max + 500 }).p;
  const X = (i) => L + (i * (W - L - Rr)) / (pts.length - 1);
  const Y = (p) => T + ((hi - p) * (H - T - B)) / (hi - lo);
  const lines = edges.filter((e) => e.p >= lo && e.p <= hi);
  const step = Math.ceil(lines.length / 7);
  const grid = lines.map((e, i) => `<line x1="${L}" x2="${W - Rr}" y1="${Y(e.p).toFixed(1)}" y2="${Y(e.p).toFixed(1)}" stroke="#242424"/>
    ${i % step === 0 ? `<text x="${L - 10}" y="${(Y(e.p) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#6b6b6b">${esc(badgeName(e.b))}</text>` : ''}`).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p).toFixed(1)}`).join('');
  const last = pts.length - 1;
  return `<svg class="hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="История ранга">${grid}
    <path d="${path}L${X(last).toFixed(1)} ${H - B}L${L} ${H - B}Z" fill="rgba(255,255,255,.05)"/>
    <path d="${path}" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(last).toFixed(1)}" cy="${Y(pts[last]).toFixed(1)}" r="3.6" fill="#fff"/></svg>`;
}

function rankCard(c, m) {
  const parts = [];
  if (m && m.points != null) {
    parts.push('ранг ' + fmt(m.points));
    if (m.form) parts.push('форма ' + signed(m.form));
    if (m.perf) parts.push('игра ' + signed(m.perf));
    if (m.adj) parts.push('игры на сайте ' + signed(m.adj));
  }
  const pr = m && m.prog;
  const bar = pr ? `<div class="prog"><i style="width:${Math.round((100 * pr.have) / pr.need)}%"></i></div>
    <div class="dim num" style="font-size:13px">${fmt(pr.have)} из ${fmt(pr.need)}${pr.next ? ' до ранга ' + esc(badgeName(pr.next)) : ''}</div>` : '';
  const src = c.src === 'none' && c.stats && c.stats.calib != null ? 'в игре идёт калибровка' : SRC[c.src] || '';
  return `<section class="card"><header><h2>Ранг и сила</h2><span class="dim" style="font-size:13px">${src}</span></header>
    <div class="body" style="display:grid;gap:12px"><div class="rankrow">${badgeImg(c.badge, 'l')}<div class="t"><b>${esc(badgeName(c.badge))}</b>
    <span class="dim">${c.pts != null ? 'сила ' + fmt(c.pts) : 'сила неизвестна'}</span></div></div>${bar}
    ${parts.length > 1 ? `<div class="dim" style="font-size:13px">Сила складывается: ${parts.join(' · ')}</div>` : ''}</div></section>`;
}

function tiles(c, m) {
  const s = c.stats;
  const t = [[fmt(s.matches), 'матчей в базе'], [s.wr == null ? '—' : s.wr + '%', m && m.wins != null ? `побед · ${fmt(m.wins)}–${fmt(s.matches - m.wins)}` : 'побед'],
    [dec(s.kda, 2), m && m.ka ? `KDA · ${dec(m.ka[0])}/${dec(m.ka[1])}/${dec(m.ka[2])}` : 'KDA'], [fmt(s.spm), 'душ в минуту']];
  if (m) {
    t.push([fmt(m.dpm), 'урона в минуту']);
    if (m.index != null) t.push([m.index, 'индекс игры из 100']);
    if (m.acc != null) t.push([Math.round(m.acc * 100) + '%', 'точность']);
    if (m.mvp && m.mvp[3]) t.push([fmt(m.mvp[0]), `раз лучший в матче из ${fmt(m.mvp[3])}`]);
  }
  return `<section class="card"><header><h2>За всё время</h2><span class="dim" style="font-size:13px">обычные и рейтинговые матчи</span></header>
    <div class="body"><div class="kv">${t.map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div></div></section>`;
}

function formCard(m) {
  if (!m.wl) return '';
  const st = m.streak;
  const now = st > 1 ? `серия из ${st} ${plural(st, 'победы', 'побед', 'побед')}` : st < -1 ? `серия из ${-st} ${plural(-st, 'поражения', 'поражений', 'поражений')}` : st === 1 ? 'последний матч выигран' : 'последний матч проигран';
  const w = m.wl.split('').filter((x) => x === 'W').length;
  return `<section class="card"><header><h2>Форма</h2><span class="dim" style="font-size:13px">последние ${m.wl.length}, новые справа</span></header>
    <div class="body" style="display:grid;gap:12px"><div class="wl">${m.wl.split('').reverse().map((x) => `<i class="${x === 'W' ? 'w' : 'l'}"></i>`).join('')}</div>
    <div class="kv"><div><b>${w}–${m.wl.length - w}</b><span>побед и поражений</span></div>
      <div><b>${m.m30 ? Math.round((100 * m.w30) / m.m30) + '%' : '—'}</b><span>побед за 30 дней (${m.m30})</span></div>
      <div><b>${m.best}</b><span>лучшая серия побед</span></div><div><b>${m.worst}</b><span>худшая серия поражений</span></div></div>
    <div class="dim" style="font-size:13px">Сейчас: ${now}.</div></div></section>`;
}

function heroesCard(m) {
  if (!m.heroes.length) return '';
  const rows = m.heroes.map((h) => `<tr><td><span class="hn">${heroImg(h[0], 'm')}<span>${esc(heroName(h[0]))}</span></span></td>
    <td class="num">${fmt(h[1])}</td><td class="num">${h[1] ? Math.round((100 * h[2]) / h[1]) + '%' : '—'}</td><td class="num">${dec(h[3], 2)}</td>
    <td class="num">${h[4] ? fmt(h[4]) : '—'}</td><td class="num">${h[5] ? fmt(h[5]) : '—'}</td><td>${gradeChip(h[6])}</td></tr>`).join('');
  return `<section class="card"><header><h2>Герои</h2><span class="dim" style="font-size:13px">оценка — против всех игроков на этом герое</span></header>
    <div class="body tblwrap"><table class="tbl"><thead><tr><th>Герой</th><th>Матчи</th><th>Победы</th><th>KDA</th><th>Душ/мин</th><th>Урон/мин</th><th>Оценка</th></tr></thead>
    <tbody>${rows}</tbody></table></div></section>`;
}

function matchesCard(m) {
  if (!m.recent.length) return '';
  const rows = m.recent.map((r) => {
    const [id, hero, win, k, d, a, nw, durS, at, mode, delta, score] = r;
    const name = `<span class="hn">${heroImg(hero, 'm')}<span>${esc(heroName(hero))}<small>${MODE[mode] || ''}</small></span></span>`;
    return `<tr class="${win ? 'won' : 'lost'}"><td>${id ? `<a href="https://statlocker.gg/match/${id}" target="_blank" rel="noopener" title="Матч на Statlocker">${name}</a>` : name}</td>
      <td><b class="res">${win ? 'Победа' : 'Поражение'}</b></td><td class="num">${k}/${d}/${a}</td><td class="num">${fmt(Math.round(nw / 1000))}k</td>
      <td class="num">${mmss(durS)}</td><td class="num ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta == null ? '' : signed(delta)}</td>
      <td>${gradeChip(score)}</td><td class="dim when">${ago(at)}</td></tr>`;
  }).join('');
  return `<section class="card"><header><h2>Последние матчи</h2><span class="dim" style="font-size:13px">оценка — по KDA и душам в минуту</span></header>
    <div class="body tblwrap"><table class="tbl matches"><thead><tr><th>Герой</th><th>Итог</th><th>У/С/П</th><th>Души</th><th>Время</th><th>Ранг</th><th>Оценка</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div></section>`;
}

// c — карточка игрока (badge, pts, src, stats), m — подробности (или null, если Steam не привязан)
export function profileBlocks(c, m) {
  if (!c.stats || !m) {
    return `<div class="pstack">${rankCard(c, null)}<div class="card empty">Steam не привязан: подробной статистики нет.</div></div>`;
  }
  const radar = m.radar && Object.keys(m.radar).length
    ? `<section class="card"><header><h2>Стиль игры</h2><span class="dim" style="font-size:13px">50 — как у всех на тех же героях</span></header>
       <div class="body">${radarSvg(m.radar)}</div></section>` : '';
  const hist = m.hist && m.hist.length > 1
    ? `<section class="card"><header><h2>История ранга</h2><span class="dim" style="font-size:13px">${m.hist.length - 1} ${plural(m.hist.length - 1, 'рейтинговый матч', 'рейтинговых матча', 'рейтинговых матчей')}</span></header>
       <div class="body">${histSvg(m.hist)}</div></section>` : '';
  return `<div class="pstack"><div class="grid2">${rankCard(c, m)}${tiles(c, m)}</div>
    <div class="grid2">${radar}<div class="col">${hist}${formCard(m)}</div></div>${heroesCard(m)}${matchesCard(m)}</div>`;
}
