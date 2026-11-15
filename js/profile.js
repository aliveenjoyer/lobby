// Профиль игрока — «досье»: сцена с главным героем игрока и его цифрами, ниже стиль игры, путь по рангам, форма,
// герои, последние матчи и игры на сайте. Цифры считает сервер по открытым данным deadlock-api (server/stats.py);
// здесь только вид. Картина на сцене — фон главного героя из самой игры (site/assets/herobg, см. tools/fetch_hero_art.py).
import { meta } from './api.js?v=20261116052211';
import { esc, ava, heroImg, heroName, badgeImg, badgeName, fmt, plural, clock, dateRu } from './ui.js?v=20261116052211';

const AXES = [['dmg', 'Урон'], ['farm', 'Фарм'], ['obj', 'Объекты'], ['sup', 'Поддержка'], ['tank', 'Стойкость'], ['surv', 'Выживаемость']];
const MODE = { r: 'рейтинг', u: 'обычный', b: 'Street Brawl', c: 'кастомка', o: '' };
const SRC = { game: 'ранг из игры', none: 'в игре ранга пока нет', host: 'ранг поставил ведущий' };
const TEAM = { a: 'Янтарь', b: 'Сапфир' };

export function grade(score) {
  if (score == null) return '';
  return score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : score >= 25 ? 'D' : 'F';
}
const stamp = (score, cls) => (score == null ? `<span class="stamp none ${cls || ''}">—</span>`
  : `<span class="stamp g${grade(score)} ${cls || ''}" title="оценка ${score} из 100">${grade(score)}</span>`);
const dec = (x, n) => (x == null ? '—' : Number(x).toFixed(n == null ? 1 : n).replace('.', ','));
// крупные числа моноширинным шрифтом: обычный пробел между тысячами в нём слишком широкий, ставим узкий промежуток
const big = (n) => fmt(n).replace(/\s/g, '<i class="ts"></i>');
const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x));
const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const hero = (id) => meta.byId.get(id) || {};
const hue = (id) => hero(id).color || '#8d93a0';

function ago(ts) {
  const d = Date.now() / 1000 - ts;
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' мин назад';
  if (d < 86400) return Math.round(d / 3600) + ' ч назад';
  const days = Math.round(d / 86400);
  if (days === 1) return 'вчера';
  if (days < 31) return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------- сцена
// who: { name, avatar, chips (готовая разметка), action (кнопка справа сверху) }
function stage(c, m, who) {
  const sig = m && m.heroes && m.heroes.length ? m.heroes[0] : null;          // [герой, матчи, победы, KDA, душ/мин, урон/мин, оценка]
  const h = sig ? hero(sig[0]) : {};
  const s = c.stats;
  const nums = [];
  if (s) {
    nums.push([big(s.matches), 'матчей']);
    nums.push([s.wr == null ? '—' : s.wr + '%', m && m.wins != null ? `побед · ${fmt(m.wins)}–${fmt(s.matches - m.wins)}` : 'побед']);
    nums.push([dec(s.kda, 2), m && m.ka ? `KDA · ${dec(m.ka[0])} / ${dec(m.ka[1])} / ${dec(m.ka[2])}` : 'KDA']);
    nums.push([big(s.spm), 'душ в минуту']);
    if (m && m.dpm != null) nums.push([big(m.dpm), 'урона в минуту']);
    if (m && m.index != null) nums.push([m.index, 'индекс игры из 100']);
  }
  const pr = m && m.prog;
  const src = c.src === 'none' && s && s.calib != null ? 'в игре идёт калибровка' : SRC[c.src] || '';
  const parts = [];
  if (m && m.points != null) {
    parts.push('ранг ' + fmt(m.points));
    if (m.form) parts.push('форма ' + signed(m.form));
    if (m.perf) parts.push('игра ' + signed(m.perf));
    if (m.adj) parts.push('игры на сайте ' + signed(m.adj));
  }
  const bg = sig ? `<div class="pf-bg" style="background-image:url(assets/herobg/${sig[0]}.webp)"></div>` : '';
  const bust = h.card ? `<img class="pf-bust" src="${esc(h.card)}" alt="" decoding="async">` : '';
  const signature = sig ? `<div class="pf-sig">${h.logo ? `<img src="${esc(h.logo)}" alt="${esc(heroName(sig[0]))}">` : `<b>${esc(heroName(sig[0]))}</b>`}
      <span>главный герой · ${fmt(sig[1])} ${plural(sig[1], 'матч', 'матча', 'матчей')} · ${sig[1] ? Math.round((100 * sig[2]) / sig[1]) : 0}% побед</span></div>` : '';
  return `<section class="pf-stage ${sig ? '' : 'bare'}">${bg}<div class="pf-grain"></div>${who.action ? `<div class="pf-act">${who.action}</div>` : ''}
    <div class="pf-top">${bust}<div class="pf-id">
      <div class="pf-who">${ava(who, 'm')}<div class="pf-chips">${who.chips || ''}</div></div>
      <h1 class="pf-name" style="--i:0">${esc(who.name)}</h1>
      <div class="pf-rank" style="--i:1">${badgeImg(c.badge, 'xl')}<div><b>${esc(badgeName(c.badge))}</b>
        <span>${c.pts != null ? `сила <em>${big(c.pts)}</em>` : 'сила неизвестна'}${src ? ` · ${src}` : ''}</span></div></div>
      ${pr ? `<div class="pf-prog" style="--i:2"><div class="pf-line"><i style="width:${Math.max(1, Math.round((100 * pr.have) / pr.need))}%"></i></div>
        <span>${fmt(pr.have)} из ${fmt(pr.need)}${pr.next ? ' до ранга ' + esc(badgeName(pr.next)) : ''}</span></div>` : ''}
      ${parts.length > 1 ? `<p class="pf-sum" style="--i:3">Сила складывается: ${parts.join(' · ')}</p>` : ''}
    </div>${signature}</div>
    ${nums.length ? `<div class="pf-nums">${nums.map((x, i) => `<div style="--i:${i + 3}"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>` : ''}</section>`;
}

// ---------------------------------------------------------------- стиль игры
// Шесть осей по кругу; пунктирное кольцо на половине радиуса — «как у всех на тех же героях».
export function radarSvg(radar, color) {
  const cx = 210, cy = 196, R = 132;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = (f) => AXES.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ');
  const val = (k) => (radar[k] == null ? 50 : radar[k]);
  const at = (a, i) => pt(i, (R * Math.max(8, val(a[0]))) / 100);
  const shape = AXES.map((a, i) => at(a, i).map((v) => v.toFixed(1)).join(',')).join(' ');
  const dots = AXES.map((a, i) => { const [x, y] = at(a, i); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="#fff"/>`; }).join('');
  const spokes = AXES.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.07)"/>`; }).join('');
  const labels = AXES.map((a, i) => {
    const [x, y] = pt(i, R + 22);
    const anchor = Math.abs(x - cx) < 4 ? 'middle' : x > cx ? 'start' : 'end';
    const dy = i === 0 ? -14 : i === 3 ? 8 : -4;
    // число — второй строкой той же надписи: отступ считается от размера шрифта и не ломается, когда шрифт крупнее
    return `<text class="rl" x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}" fill="#9a9aa2">${a[1]}<tspan class="rv" x="${x.toFixed(1)}" dy="1.12em" font-weight="700" fill="#f7fafc" font-family="JetBrains Mono, monospace">${radar[a[0]] == null ? '—' : radar[a[0]]}</tspan></text>`;
  }).join('');
  return `<svg class="radar" viewBox="-60 0 540 404" role="img" aria-label="Стиль игры по шести осям">
    <defs><radialGradient id="rg" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${color}" stop-opacity=".1"/><stop offset="1" stop-color="${color}" stop-opacity=".55"/></radialGradient></defs>
    ${[1, 0.75, 0.25].map((f) => `<polygon points="${poly(f)}" fill="none" stroke="rgba(255,255,255,.07)"/>`).join('')}
    <polygon points="${poly(0.5)}" fill="none" stroke="rgba(255,255,255,.34)" stroke-dasharray="2 5"/>${spokes}
    <polygon class="rshape" points="${shape}" fill="url(#rg)" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${dots}${labels}</svg>`;
}

function styleSec(m, color) {
  if (!m.radar || !Object.keys(m.radar).length) return '';
  const have = AXES.filter((a) => m.radar[a[0]] != null);
  const top = have.slice().sort((a, b) => m.radar[b[0]] - m.radar[a[0]]);
  const verdict = have.length > 1 ? `<p class="pf-verdict">Сильнее всего — <b>${top[0][1].toLowerCase()}</b>: ${m.radar[top[0][0]]}.
    Слабее всего — <b>${top[top.length - 1][1].toLowerCase()}</b>: ${m.radar[top[top.length - 1][0]]}.</p>` : '';
  const bars = AXES.map((a) => {
    const v = m.radar[a[0]];
    return `<div class="ax ${v != null && v >= 50 ? 'hi' : ''}"><span>${a[1]}</span><div class="axb"><i style="width:${v == null ? 0 : Math.max(2, v)}%"></i><em></em></div><b>${v == null ? '—' : v}</b></div>`;
  }).join('');
  const facts = [];
  if (m.acc != null) facts.push(`<div><b>${Math.round(m.acc * 100)}%</b><span>точность</span></div>`);
  if (m.mvp && m.mvp[3]) facts.push(`<div><b>${fmt(m.mvp[0])}</b><span>раз лучший в матче из ${fmt(m.mvp[3])}</span></div>`);
  return `<section class="pf-sec"><header><h2>Стиль игры</h2><span>50 — как у всех игроков на тех же героях</span></header>
    <div class="pf-panel pf-style"><div class="pf-radar">${radarSvg(m.radar, color)}</div>
      <div class="pf-axes">${verdict}${bars}${facts.length ? `<div class="pf-facts">${facts.join('')}</div>` : ''}</div></div></section>`;
}

// ---------------------------------------------------------------- путь по рангам
// Очки ранга после каждого рейтингового матча; горизонтальные линии — границы подрангов.
// narrow — версия для телефона: тот же график в размерах узкого экрана, чтобы подписи не превращались в точки.
export function histSvg(pts, color, narrow) {
  if (!pts || pts.length < 2) return '';
  const [W, H, L, Rr, T, B, fs] = narrow ? [380, 236, 78, 14, 30, 18, 10.5] : [1120, 300, 112, 28, 34, 26, 12];
  const id = narrow ? 'n' : 'w';
  const edges = [];
  for (let tier = 1; tier <= 11; tier++) for (let sub = 1; sub <= 6; sub++) edges.push({ p: (tier - 1) * 6500 + (sub - 1) * 1000, b: tier * 10 + sub });
  const min = Math.min(...pts), max = Math.max(...pts);
  const lo = (edges.filter((e) => e.p <= min).pop() || edges[0]).p;
  const hi = (edges.find((e) => e.p > max) || { p: max + 500 }).p;
  const X = (i) => L + (i * (W - L - Rr)) / (pts.length - 1);
  const Y = (p) => T + ((hi - p) * (H - T - B)) / (hi - lo);
  const lines = edges.filter((e) => e.p >= lo && e.p <= hi);
  const step = Math.ceil(lines.length / 7);
  const grid = lines.map((e, i) => `<line x1="${L}" x2="${W - Rr}" y1="${Y(e.p).toFixed(1)}" y2="${Y(e.p).toFixed(1)}" stroke="rgba(255,255,255,.055)"/>
    ${i % step === 0 ? `<text x="${L - (narrow ? 8 : 14)}" y="${(Y(e.p) + 4).toFixed(1)}" text-anchor="end" font-size="${fs}" fill="#7a7a84">${esc(badgeName(e.b))}</text>` : ''}`).join('');
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p).toFixed(1)}`).join('');
  const last = pts.length - 1;
  const peak = pts.indexOf(max);
  const peakBadge = (edges.filter((e) => e.p <= max).pop() || edges[0]).b;
  const px = X(peak), py = Y(max);
  const anchor = px > W - (narrow ? 110 : 190) ? 'end' : px < L + (narrow ? 60 : 90) ? 'start' : 'middle';
  const peakMark = peak !== last ? `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="#0b0b0d" stroke="#fff" stroke-width="1.6"/>
    <text x="${px.toFixed(1)}" y="${(py - 13).toFixed(1)}" text-anchor="${anchor}" font-size="${fs + 0.5}" fill="#d9d9de">пик · ${esc(badgeName(peakBadge))}</text>` : '';
  return `<svg class="hist ${narrow ? 'narrow' : 'wide'}" viewBox="0 0 ${W} ${H}" role="img" aria-label="История ранга">
    <defs><linearGradient id="hg${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".34"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>
      <linearGradient id="hl${id}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>
    ${grid}<path d="${path}L${X(last).toFixed(1)} ${H - B}L${L} ${H - B}Z" fill="url(#hg${id})"/>
    <path class="hline" d="${path}" fill="none" stroke="url(#hl${id})" stroke-width="${narrow ? 2 : 2.4}" stroke-linejoin="round" stroke-linecap="round"/>${peakMark}
    <circle cx="${X(last).toFixed(1)}" cy="${Y(pts[last]).toFixed(1)}" r="11" fill="${color}" opacity=".28"/>
    <circle cx="${X(last).toFixed(1)}" cy="${Y(pts[last]).toFixed(1)}" r="4.6" fill="#fff"/></svg>`;
}

function rankSec(m, color) {
  if (!m.hist || m.hist.length < 2) return '';
  const n = m.hist.length - 1;
  const delta = m.hist[n] - m.hist[0];
  return `<section class="pf-sec"><header><h2>История ранга</h2>
      <span>${n} ${plural(n, 'рейтинговый матч', 'рейтинговых матча', 'рейтинговых матчей')} · ${delta ? `<b class="${delta > 0 ? 'up' : 'down'}">${signed(delta)}</b> ${plural(Math.abs(delta), 'очко', 'очка', 'очков')} за это время` : 'ранг в итоге тот же'}</span></header>
    <div class="pf-panel pf-hist">${histSvg(m.hist, color)}${histSvg(m.hist, color, true)}</div></section>`;
}

// ---------------------------------------------------------------- форма: последние матчи кадрами киноплёнки
function formSec(m) {
  if (!m.wl) return '';
  const st = m.streak;
  const now = st > 1 ? `серия из ${st} ${plural(st, 'победы', 'побед', 'побед')}` : st < -1 ? `серия из ${-st} ${plural(-st, 'поражения', 'поражений', 'поражений')}`
    : st === 1 ? 'последний матч выигран' : 'последний матч проигран';
  const seq = m.wl.split('').reverse();               // старые слева, новые справа
  const w = seq.filter((x) => x === 'W').length;
  return `<section class="pf-sec"><header><h2>Форма</h2><span>последние ${seq.length} ${plural(seq.length, 'матч', 'матча', 'матчей')}, новые справа · сейчас ${now}</span></header>
    <div class="pf-panel pf-form"><div class="film" role="img" aria-label="${w} побед и ${seq.length - w} поражений">
        <div class="frames">${seq.map((x, i) => `<i class="${x === 'W' ? 'w' : 'l'} ${i === seq.length - 1 ? 'last' : ''}" title="${x === 'W' ? 'победа' : 'поражение'}"></i>`).join('')}</div></div>
      <div class="pf-four"><div><b>${w}–${seq.length - w}</b><span>побед и поражений</span></div>
        <div><b>${m.m30 ? Math.round((100 * m.w30) / m.m30) + '%' : '—'}</b><span>побед за 30 дней · ${fmt(m.m30 || 0)} ${plural(m.m30 || 0, 'матч', 'матча', 'матчей')}</span></div>
        <div><b>${m.best}</b><span>лучшая серия побед</span></div><div><b>${m.worst}</b><span>худшая серия поражений</span></div></div></div></section>`;
}

// ---------------------------------------------------------------- герои: трое главных — афишами, остальные — списком
function heroesSec(m) {
  if (!m.heroes || !m.heroes.length) return '';
  const wr = (h) => (h[1] ? Math.round((100 * h[2]) / h[1]) : 0);
  const posters = m.heroes.slice(0, 3).map((h, i) => {
    const a = hero(h[0]);
    return `<article class="poster" style="--hc:${hue(h[0])}">${a.card ? `<img class="pimg" src="${esc(a.card)}" alt="" loading="lazy">` : ''}
      <span class="pno">${i + 1}</span>${stamp(h[6], 'big')}
      <div class="pmeta">${a.logo ? `<img class="plogo" src="${esc(a.logo)}" alt="${esc(heroName(h[0]))}" loading="lazy">` : `<b class="pname">${esc(heroName(h[0]))}</b>`}
        <div class="pline"><b>${fmt(h[1])}</b> ${plural(h[1], 'матч', 'матча', 'матчей')} · <b>${wr(h)}%</b> побед</div>
        <div class="pline dim">KDA ${dec(h[3], 2)}${h[4] ? ` · ${fmt(h[4])} душ/мин` : ''}${h[5] ? ` · ${fmt(h[5])} урона/мин` : ''}</div></div></article>`;
  }).join('');
  const rest = m.heroes.slice(3);
  const rows = rest.map((h) => `<div class="hrow">${heroImg(h[0], 'm')}<b class="hname">${esc(heroName(h[0]))}</b>
      <span class="num">${fmt(h[1])}</span><span class="wrb"><i style="width:${wr(h)}%"></i><em>${wr(h)}%</em></span>
      <span class="num">${dec(h[3], 2)}</span><span class="num opt">${h[4] ? fmt(h[4]) : '—'}</span><span class="num opt">${h[5] ? fmt(h[5]) : '—'}</span>${stamp(h[6])}</div>`).join('');
  return `<section class="pf-sec"><header><h2>Герои</h2><span>оценка — против всех игроков на этом герое</span></header>
    <div class="posters">${posters}</div>
    ${rows ? `<div class="pf-panel pf-list"><div class="hrow head"><span></span><span>Герой</span><span>Матчи</span><span>Победы</span><span>KDA</span><span class="opt">Душ/мин</span><span class="opt">Урон/мин</span><span></span></div>${rows}</div>` : ''}</section>`;
}

// ---------------------------------------------------------------- последние матчи
// Три ярких матча из последних: лучший по оценке, самый результативный, самый долгий — без повторов.
function highlights(recent) {
  if (recent.length < 6) return '';
  const picks = [];
  const take = (title, rank) => {
    const r = recent.filter((x) => !picks.some((p) => p.r === x)).sort(rank)[0];
    if (r) picks.push({ title, r });
  };
  take('Лучший матч', (a, b) => (b[11] == null ? -1 : b[11]) - (a[11] == null ? -1 : a[11]) || b[3] + b[5] - a[3] - a[5]);
  take('Больше всего убийств', (a, b) => b[3] - a[3] || a[4] - b[4]);
  take('Самый долгий матч', (a, b) => b[7] - a[7]);
  return `<div class="shots">${picks.map(({ title, r }) => {
    const [, hid, win, k, d, a, nw, durS, at, , , score] = r;
    const h = hero(hid);
    return `<article class="shot ${win ? 'w' : 'l'}" style="--hc:${hue(hid)}">${h.card ? `<img class="simg" src="${esc(h.card)}" alt="" loading="lazy">` : ''}
      <span class="stitle">${title}</span><b class="skda">${k}<em>/</em>${d}<em>/</em>${a}</b>
      <span class="sline"><b>${esc(heroName(hid))}</b> · ${win ? 'победа' : 'поражение'}</span>
      <span class="sline dim">${fmt(Math.round(nw / 1000))}k душ · ${mmss(durS)} · ${ago(at)}</span>${score == null ? '' : stamp(score, 'big')}</article>`;
  }).join('')}</div>`;
}

function matchesSec(m) {
  if (!m.recent || !m.recent.length) return '';
  const rows = m.recent.map((r) => {
    const [id, hid, win, k, d, a, nw, durS, at, mode, delta, score] = r;
    const inner = `${heroImg(hid, 'm')}<span class="mwho"><b>${esc(heroName(hid))}</b><small>${MODE[mode] || ''}</small></span>
      <b class="mres">${win ? 'Победа' : 'Поражение'}</b><span class="mkda">${k}<em>/</em>${d}<em>/</em>${a}</span>
      <span class="num">${fmt(Math.round(nw / 1000))}k</span><span class="num opt">${mmss(durS)}</span>
      <span class="num ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta == null ? '' : signed(delta)}</span>${stamp(score)}<span class="mago">${ago(at)}</span>`;
    return id ? `<a class="mrow2 ${win ? 'w' : 'l'}" href="https://statlocker.gg/match/${id}" target="_blank" rel="noopener" title="Матч на Statlocker">${inner}</a>`
      : `<div class="mrow2 ${win ? 'w' : 'l'}">${inner}</div>`;
  }).join('');
  return `<section class="pf-sec"><header><h2>Последние матчи</h2><span>оценка — по KDA и душам в минуту</span></header>
    ${highlights(m.recent)}<div class="pf-panel pf-list">${rows}</div></section>`;
}

// ---------------------------------------------------------------- игры на этом сайте
function siteSec(m) {
  if (!m.site || !m.site.length) return '';
  const rows = m.site.map((g, i) => {
    const me = g.me;
    return `<button class="srow2 ${g.won ? 'w' : 'l'}" data-site="${i}">${me && me.hero ? heroImg(me.hero, 'm') : '<span class="hero m"></span>'}
      <span class="mwho"><b>${g.won ? 'Победа' : 'Поражение'} за «${TEAM[g.team]}»</b><small>${esc(g.title || '')}</small></span>
      ${me ? `<span class="mkda">${me.k}<em>/</em>${me.d}<em>/</em>${me.a}</span><span class="num opt">${fmt(Math.round((me.nw || 0) / 1000))}k душ</span>` : '<span></span><span class="opt"></span>'}
      <span class="num">${g.kills ? `${g.kills[0]} : ${g.kills[1]}` : ''}</span>
      <span class="mago">${dateRu(g.at)}${g.duration ? ` · ${clock(g.duration)}` : ''}</span></button>`;
  }).join('');
  return `<section class="pf-sec"><header><h2>Игры на сайте</h2><span>кастомки, сыгранные через лобби; нажми — откроется таблица матча</span></header>
    <div class="pf-panel pf-list">${rows}</div></section>`;
}

// c — карточка игрока (badge, pts, src, stats), m — подробности (или null, если Steam не привязан), who — имя, аватар, ссылки
export function profileBlocks(c, m, who) {
  who = who || { name: '', avatar: '' };
  const sig = m && m.heroes && m.heroes.length ? m.heroes[0][0] : null;
  const color = sig ? hue(sig) : '#8d93a0';
  if (!c.stats || !m) {
    return `<div class="pf" style="--hc:${color}">${stage(c, null, who)}
      <div class="pf-panel pf-empty">Steam не привязан: подробной статистики нет.</div></div>`;
  }
  return `<div class="pf" style="--hc:${color}">${stage(c, m, who)}${styleSec(m, color)}${rankSec(m, color)}${formSec(m)}${heroesSec(m)}${matchesSec(m)}${siteSec(m)}</div>`;
}

// Глубина сцены: картина и герой чуть смещаются вслед за курсором. Возвращает функцию, которая это снимает.
export function mountProfile(root) {
  const st = root.querySelector('.pf-stage');
  if (!st || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  let raf = 0;
  const move = (e) => {
    const r = st.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { st.style.setProperty('--px', x.toFixed(3)); st.style.setProperty('--py', y.toFixed(3)); });
  };
  const rest = () => { st.style.setProperty('--px', '0'); st.style.setProperty('--py', '0'); };
  st.addEventListener('pointermove', move);
  st.addEventListener('pointerleave', rest);
  return () => { cancelAnimationFrame(raf); st.removeEventListener('pointermove', move); st.removeEventListener('pointerleave', rest); };
}
