// Профиль игрока — «досье»: сцена с главным героем игрока и его цифрами, ниже стиль игры, путь по рангам, форма,
// герои, кастомки на сайте и последние матчи. Цифры считает сервер по открытым данным deadlock-api (server/stats.py);
// здесь только вид. Картина на сцене — фон главного героя из самой игры (site/assets/herobg, см. tools/fetch_hero_art.py).
import { meta } from './api.js?v=20261117235001';
import { openGame } from './score.js?v=20261117235001';
import { esc, ava, heroImg, heroName, badgeImg, badgeName, fmt, plural, clock, dateRu } from './ui.js?v=20261117235001';

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
const big = (n) => fmt(n).replace(/\s/g, '<i class="nsp"></i>');
const signed = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x));
const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const hero = (id) => meta.byId.get(id) || {};
const hue = (id) => hero(id).color || '#8d93a0';

function ago(ts) {
  const d = Date.now() / 1000 - ts;
  if (ts % 86400 === 0 && d < 86400) return d < 0 ? 'сегодня' : 'вчера или сегодня';     // у скрытого профиля время округлено до дня
  if (d < 3600) return Math.max(1, Math.round(d / 60)) + ' мин назад';
  if (d < 86400) return Math.round(d / 3600) + ' ч назад';
  const days = Math.round(d / 86400);
  if (days === 1) return 'вчера';
  if (days < 31) return days + ' ' + plural(days, 'день', 'дня', 'дней') + ' назад';
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------- сцена
// who: { name, avatar, chips (готовая разметка), action (кнопка справа сверху) }
// Матчей из игры нет (Steam не привязан или в базе игры пусто), а кастомки на сайте есть — сцена берёт героя и цифры
// из них: иначе у такого игрока вместо сцены был ряд нулей.
function stage(c, m, who, played) {
  const cu = played && played.sum;
  let sig = m && m.heroes && m.heroes.length ? m.heroes[0] : null;            // [герой, матчи, победы, KDA, душ/мин, урон/мин, оценка]
  const own = !!sig;
  if (!sig && cu && cu.heroes && cu.heroes.length) sig = cu.heroes[0];       // [герой, игр на сайте, побед]
  const h = sig ? hero(sig[0]) : {};
  const s = c.stats;
  const nums = [];
  if ((!s || !s.matches) && cu) {
    nums.push([big(cu.g), plural(cu.g, 'игра на сайте', 'игры на сайте', 'игр на сайте')]);
    nums.push([Math.round((100 * cu.w) / cu.g) + '%', `побед · ${cu.w}–${cu.g - cu.w}`]);
    if (cu.tg) {
      nums.push([dec((cu.k + cu.a) / Math.max(1, cu.d), 2), `KDA · ${dec(cu.k / cu.tg)} / ${dec(cu.d / cu.tg)} / ${dec(cu.a / cu.tg)}`]);
      nums.push([big(Math.round(cu.nw / cu.tg)), 'душ за игру']);
      nums.push([big(Math.round(cu.dmg / cu.tg)), 'урона за игру']);
    }
    nums.push([cu.place, `место из ${cu.of} на сайте`]);
  } else if (s && s.matches) {
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
      <span>${own ? 'главный герой' : 'главный герой в кастомках'} · ${fmt(sig[1])} ${own ? plural(sig[1], 'матч', 'матча', 'матчей') : plural(sig[1], 'игра', 'игры', 'игр')} · ${sig[1] ? Math.round((100 * sig[2]) / sig[1]) : 0}% побед</span></div>` : '';
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

// ---------------------------------------------------------------- форма: последние матчи волной
// Каждый матч — портрет героя на своей высоте: победа поднимает на ступень, поражение опускает. Серии видны как
// подъёмы и спуски, а самые длинные подсвечены. m.fm — те же 30 матчей по одному: [герой, победа, K, D, A, оценка, когда].
function formSec(m) {
  const src = m.fm && m.fm.length ? m.fm : (m.wl || '').split('').map((x) => [0, x === 'W' ? 1 : 0, null, null, null, null, 0]);
  if (!src.length) return '';
  const seq = src.slice(0, 30).reverse();             // старые слева, новые справа
  const n = seq.length;
  const wins = seq.filter((x) => x[1]).length;
  const runs = [];
  seq.forEach((x, i) => {
    const last = runs[runs.length - 1];
    if (last && last.win === !!x[1]) last.len += 1; else runs.push({ from: i, len: 1, win: !!x[1] });
  });
  const longest = (win) => runs.filter((r) => r.win === win && r.len >= 3).sort((p, q) => q.len - p.len || q.from - p.from)[0];
  const cur = runs[runs.length - 1];
  const now = cur.len > 1 ? `${cur.len} ${cur.win ? plural(cur.len, 'победа', 'победы', 'побед') : plural(cur.len, 'поражение', 'поражения', 'поражений')} подряд`
    : cur.win ? 'последний выигран' : 'последний проигран';
  // высоты: от нуля до и после каждого матча
  let lvl = 0;
  const lv = seq.map((x) => { lvl += x[1] ? 1 : -1; return lvl; });
  const lo = Math.min(0, ...lv);
  const hi = Math.max(0, ...lv);
  const H = 172, S = 30, PAD = 24;
  const room = H - 2 * PAD - S;
  const step = Math.min(18, room / Math.max(1, hi - lo));
  const top = (l) => PAD + (room - (hi - lo) * step) / 2 + (hi - l) * step;
  const line = lv.map((l, i) => `${i ? 'L' : 'M'}${i + 0.5} ${(top(l) + S / 2).toFixed(1)}`).join('');
  const zero = (top(0) + S / 2).toFixed(1);
  const band = (r) => (r ? `<div class="fm-band ${r.win ? 'w' : 'l'} ${r.from < 2 ? 'left' : r.from + r.len > n - 2 ? 'right' : ''}" style="left:${(100 * r.from / n).toFixed(2)}%;width:${(100 * r.len / n).toFixed(2)}%"><span>${r.len} ${r.win ? plural(r.len, 'победа', 'победы', 'побед') : plural(r.len, 'поражение', 'поражения', 'поражений')} подряд</span></div>` : '');
  const cols = seq.map((x, i) => {
    const [hid, win, k, d, a, score, at] = x;
    const tip = [hid ? heroName(hid) : '', win ? 'победа' : 'поражение', k == null ? '' : `${k}/${d}/${a}`, score == null ? '' : `оценка ${grade(score)}`, at ? ago(at) : ''].filter(Boolean).join(' · ');
    const pic = hid && hero(hid).icon ? `<img src="${esc(hero(hid).icon)}" alt="" loading="lazy">` : '';
    return `<div class="fm-c ${win ? 'w' : 'l'} ${i === n - 1 ? 'last' : ''}"><i style="top:${top(lv[i]).toFixed(1)}px" title="${esc(tip)}">${pic}</i></div>`;
  }).join('');
  // что стоит за этими матчами: на ком играл, как играл
  const by = new Map();
  let K = 0, D = 0, A = 0, scored = 0, sum = 0;
  for (const x of seq) {
    if (x[0]) { const h = by.get(x[0]) || [0, 0]; h[0] += 1; h[1] += x[1]; by.set(x[0], h); }
    if (x[2] != null) { K += x[2]; D += x[3]; A += x[4]; }
    if (x[5] != null) { scored += 1; sum += x[5]; }
  }
  const main = Array.from(by).sort((p, q) => q[1][0] - p[1][0]).slice(0, 4);
  const facts = [];
  if (main.length) facts.push(`<div class="fm-on"><span>играл на</span>${main.map(([id, v]) => `<em title="${esc(heroName(id))}: побед ${v[1]}, поражений ${v[0] - v[1]}">${heroImg(id, 'm')}<b>${v[1]}–${v[0] - v[1]}</b></em>`).join('')}</div>`);
  if (K + D + A) facts.push(`<div><b>${dec((K + A) / Math.max(1, D), 2)}</b><span>KDA за эти матчи</span></div>`);
  if (scored) facts.push(`<div><b>${grade(sum / scored)}</b><span>средняя оценка · ${Math.round(sum / scored)} из 100</span></div>`);
  if (m.m30) facts.push(`<div><b>${Math.round((100 * m.w30) / m.m30)}%</b><span>побед за 30 дней · ${fmt(m.m30)} ${plural(m.m30, 'матч', 'матча', 'матчей')}</span></div>`);
  const first = seq[0][6];
  return `<section class="pf-sec"><header><h2>Форма</h2><span>последние ${n} ${plural(n, 'матч', 'матча', 'матчей')} · победа поднимает на ступень, поражение опускает</span></header>
    <div class="pf-panel fm"><div class="fm-sum"><b class="fm-big">${wins}<i>–</i>${n - wins}</b><span>побед и поражений</span>
        <em class="fm-now ${cur.win ? 'w' : 'l'}">${now}</em></div>
      <div class="fm-scroll"><div class="fm-wave" style="--n:${n}" role="img" aria-label="${wins} ${plural(wins, 'победа', 'победы', 'побед')} и ${n - wins} ${plural(n - wins, 'поражение', 'поражения', 'поражений')}, сейчас ${now}">
        ${band(longest(true))}${band(longest(false))}
        <svg viewBox="0 0 ${n} ${H}" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="fmg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--hc)" stop-opacity=".2"/><stop offset="1" stop-color="var(--hc)" stop-opacity="0"/></linearGradient></defs>
          <path d="${line}L${n - 0.5} ${H}L0.5 ${H}Z" fill="url(#fmg)"/><line x1="0" x2="${n}" y1="${zero}" y2="${zero}" class="fm-zero"/><path d="${line}" class="fm-line"/></svg>
        <div class="fm-cols">${cols}</div></div>
        <div class="fm-axis"><span>${first ? ago(first) : 'раньше'}</span><span>сейчас</span></div></div>
      ${facts.length ? `<div class="fm-foot">${facts.join('')}</div>` : ''}</div></section>`;
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

const dayKey = (ts) => { const d = new Date(ts * 1000); return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate(); };
function dayTitle(ts) {
  const k = dayKey(ts);
  if (k === dayKey(Date.now() / 1000)) return 'Сегодня';
  if (k === dayKey(Date.now() / 1000 - 86400)) return 'Вчера';
  return dateRu(ts);
}

// Матчи идут по дням: у дня — счёт побед и поражений и сколько очков ранга он принёс. Сразу видно восемь матчей,
// остальные открываются кнопкой: длинная простыня одинаковых строк ничего не добавляла.
const SHOWN = 8;
function matchesSec(m) {
  if (!m.recent || !m.recent.length) return '';
  const days = [];
  m.recent.forEach((r, i) => {
    const last = days[days.length - 1];
    if (last && last.key === dayKey(r[8])) last.rows.push([r, i]); else days.push({ key: dayKey(r[8]), at: r[8], rows: [[r, i]] });
  });
  const one = ([r, i]) => {
    const [id, hid, win, k, d, a, nw, durS, at, mode, delta, score] = r;
    const inner = `${heroImg(hid, 'm')}<span class="mwho"><b>${esc(heroName(hid))}</b><small>${MODE[mode] || ''}</small></span>
      <b class="mres">${win ? 'Победа' : 'Поражение'}</b><span class="mkda">${k}<em>/</em>${d}<em>/</em>${a}</span>
      <span class="num">${fmt(Math.round(nw / 1000))}k</span><span class="num opt">${mmss(durS)}</span>
      <span class="num ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta == null ? '' : signed(delta)}</span>${stamp(score)}<span class="mago">${at % 86400 ? new Date(at * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''}</span>`;
    const cls = `mrow2 ${win ? 'w' : 'l'} ${i >= SHOWN ? 'late' : ''}`;
    return id ? `<a class="${cls}" href="https://statlocker.gg/match/${id}" target="_blank" rel="noopener" title="Матч на Statlocker">${inner}</a>`
      : `<div class="${cls}">${inner}</div>`;
  };
  const body = days.map((day) => {
    const w = day.rows.filter(([r]) => r[2]).length;
    const l = day.rows.length - w;
    const pts = day.rows.reduce((sum, [r]) => sum + (r[10] || 0), 0);
    const ranked = day.rows.some(([r]) => r[10] != null);
    return `<div class="mday ${day.rows[0][1] >= SHOWN ? 'late' : ''}"><b>${dayTitle(day.at)}</b><span>${w ? `${w} ${plural(w, 'победа', 'победы', 'побед')}` : ''}${w && l ? ' · ' : ''}${l ? `${l} ${plural(l, 'поражение', 'поражения', 'поражений')}` : ''}</span>
      ${ranked ? `<em class="${pts > 0 ? 'up' : pts < 0 ? 'down' : ''}">${signed(pts)} ${plural(Math.abs(pts), 'очко', 'очка', 'очков')} ранга</em>` : ''}</div>${day.rows.map(one).join('')}`;
  }).join('');
  const rest = m.recent.length - SHOWN;
  return `<section class="pf-sec"><header><h2>Последние матчи</h2><span>оценка — по KDA и душам в минуту</span></header>
    ${highlights(m.recent)}<div class="pf-panel pf-list mlist ${rest > 0 ? 'clip' : ''}">${body}
      ${rest > 0 ? `<button class="mmore" data-pf="more">Показать ещё ${rest}</button>` : ''}</div></section>`;
}

// ---------------------------------------------------------------- кастомки: игры через лобби на этом сайте
// pl — { sum: сводка игрока (server/customs.py: brief) | null, games: последние игры, adj: поправка силы }
function customsSec(pl) {
  const s = pl && pl.sum;
  if (!s) return '';
  const who = (x) => (x.login ? `<a class="plink" href="#/u/${esc(x.login)}">${esc(x.name)}</a>` : esc(x.name));
  const nums = [[`${s.w}–${s.g - s.w}`, `побед и поражений · ${Math.round((100 * s.w) / s.g)}%`]];
  if (s.tg) {
    nums.push([`${dec(s.k / s.tg)} / ${dec(s.d / s.tg)} / ${dec(s.a / s.tg)}`, 'K / D / A за игру']);
    nums.push([big(Math.round(s.dmg / s.tg)), 'урона за игру']);
  }
  nums.push([`${s.place}<small> из ${s.of}</small>`, 'место среди игроков сайта']);
  if (s.mvp) nums.push([s.mvp, plural(s.mvp, 'раз лучший игрок матча', 'раза лучший игрок матча', 'раз лучший игрок матча')]);
  if (pl.adj) nums.push([signed(pl.adj), 'поправка силы за игры на сайте']);
  const rels = [];
  if (s.vic) rels.push(`<div class="cu-rel"><span>чаще всех убивал</span><b>${who(s.vic)}</b><em>${s.vic.n} ${plural(s.vic.n, 'раз', 'раза', 'раз')}</em></div>`);
  if (s.nem) rels.push(`<div class="cu-rel"><span>чаще всех погибал от</span><b>${who(s.nem)}</b><em>${s.nem.n} ${plural(s.nem.n, 'раз', 'раза', 'раз')}</em></div>`);
  if (s.mate) rels.push(`<div class="cu-rel"><span>чаще всех в одной команде</span><b>${who(s.mate)}</b><em>${s.mate.n} ${plural(s.mate.n, 'игра', 'игры', 'игр')}, побед ${s.mate.w}</em></div>`);
  const heroes = (s.heroes || []).map((h) => `<em title="${esc(heroName(h[0]))}: побед ${h[2]}, поражений ${h[1] - h[2]}">${heroImg(h[0], 'm')}<b>${h[2]}–${h[1] - h[2]}</b></em>`).join('');
  const rows = (pl.games || []).map((g, i) => {
    const me = g.me;
    const hid = (me && me.hero) || g.hero;
    return `<button class="srow2 ${g.won ? 'w' : 'l'}" data-site="${i}">${hid ? heroImg(hid, 'm') : '<span class="hero m"></span>'}
      <span class="mwho"><b>${g.won ? 'Победа' : 'Поражение'} за «${TEAM[g.team]}»</b><small>${hid ? esc(heroName(hid)) + ' · ' : ''}${esc(g.title || '')}</small></span>
      ${me ? `<span class="mkda">${me.k}<em>/</em>${me.d}<em>/</em>${me.a}</span><span class="num opt">${fmt(Math.round((me.nw || 0) / 1000))}k душ</span>` : '<span></span><span class="opt"></span>'}
      <span class="num">${g.kills ? `${g.kills[0]} : ${g.kills[1]}` : ''}</span>
      <span class="mago">${dateRu(g.at)}${g.duration ? ` · ${clock(g.duration)}` : ''}</span></button>`;
  }).join('');
  return `<section class="pf-sec"><header><h2>Кастомки</h2><span>${s.g} ${plural(s.g, 'игра', 'игры', 'игр')} через лобби на этом сайте · <a class="plink on" href="#/stats">вся статистика кастомок</a></span></header>
    <div class="pf-panel cu"><div class="cu-nums">${nums.map((x) => `<div><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}</div>
      ${rels.length || heroes ? `<div class="cu-more">${rels.join('')}${heroes ? `<div class="cu-rel cu-on"><span>играл на</span><div>${heroes}</div></div>` : ''}</div>` : ''}</div>
    ${rows ? `<div class="pf-panel pf-list cu-list">${rows}</div>` : ''}</section>`;
}

// c — карточка игрока (badge, pts, src, stats), m — подробности (или null, если Steam не привязан), who — имя, аватар,
// ссылки; played — его кастомки на сайте
export function profileBlocks(c, m, who, played) {
  who = who || { name: '', avatar: '' };
  const cu = played && played.sum;
  const sig = m && m.heroes && m.heroes.length ? m.heroes[0][0] : cu && cu.heroes && cu.heroes.length ? cu.heroes[0][0] : null;
  const color = sig ? hue(sig) : '#8d93a0';
  if (!c.stats || !m || !c.stats.matches) {
    const why = !c.stats || !m ? 'Статистики из игры нет: Steam не привязан.' : 'В базе игры матчей этого игрока пока нет: статистика появится, когда он сыграет.';
    return `<div class="pf" style="--hc:${color}">${stage(c, c.stats && m ? m : null, who, played)}${customsSec(played)}
      <div class="pf-panel pf-empty">${why}</div></div>`;
  }
  return `<div class="pf" style="--hc:${color}">${stage(c, m, who, played)}${styleSec(m, color)}${rankSec(m, color)}${formSec(m)}${heroesSec(m)}${customsSec(played)}${matchesSec(m)}</div>`;
}

// Нажатия внутри профиля. played — те же кастомки, что отданы в profileBlocks; me — uid зрителя. -> true, если нажатие разобрано.
export function profileClick(e, played, me) {
  const more = e.target.closest('[data-pf="more"]');
  if (more) { more.closest('.mlist').classList.remove('clip'); more.remove(); return true; }
  const sg = e.target.closest('[data-site]');
  if (sg) { const g = ((played && played.games) || [])[+sg.dataset.site]; if (g) openGame(g, { me }); return true; }
  return false;
}
