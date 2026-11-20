// Запись на кастомки заранее — отдельно от лобби (просьба владельца 21.11: «запись отдельно от лобби… на главную
// просто кнопку „Записаться“ и список предполагаемых участников; когда будет лобби создано — предложение войти в лобби»).
// Блок стоит на главной и на странице ведущего: кнопка «Записаться», таймер до старта, список по порядку записи,
// предварительные команды по силе. Когда ведущий создаёт лобби, вместо «Записаться» появляется «Войти в лобби».
//
// Правило блока — одна кнопка и за руку (его же слова: «супер удобно, в одну кнопку… за ручку прям вело… лишних
// подтверждений не было»): человек жмёт «Записаться» один раз. Если нужен вход через Twitch или Steam, кнопка ведёт
// туда, а запись потом завершается сама (auth.js: want) — второй раз «Записаться» жать не надо. Шаги видны полоской.
import { call } from './api.js?v=20261121065955';
import {
  esc, ava, badgeImg, badgeName, fmt, toast, oops, confirmHold, ICON, startText, countdown, askStart,
} from './ui.js?v=20261121065955';
import { user, login, linkSteam, want } from './auth.js?v=20261121065955';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
const btn = (act, label, cls) => `<button class="btn ${cls || ''}" data-su="${act}">${label}</button>`;
const rank = (p) => (p.badge ? `${esc(badgeName(p.badge))}${p.pts != null ? ' · <span class="num">' + fmt(p.pts) + '</span>' : ''}` : 'без ранга');
const steps = (list, at) => `<ol class="steps su-steps">${list.map((t, i) => `<li class="${i === at ? 'on' : i < at ? 'done' : ''}"><i>${i < at ? '✓' : i + 1}</i><span>${t}</span></li>`).join('')}</ol>`;

// su — запись с сервера (App.signup_view): { id, start, size, host, list: [{uid, login, name, avatar, badge, pts}],
// prelim: { games, rest } | null, lobby: { id, login, phase } | null, inside: [uid — кто из записавшихся уже в лобби] }
// o.here — блок стоит на странице самого ведущего: ссылка на неё не нужна.
export function signupHtml(su, o) {
  const me = user.me;
  const left = su.start - Date.now() / 1000;
  const idx = me ? su.list.findIndex((p) => p.uid === me.id) : -1;
  const boss = !!me && (me.id === su.host.uid || me.admin);              // открыл запись (или администратор сайта)
  const ready = !!me && (!!me.steam || boss);                            // вход и Steam есть
  const cap = su.size * 2;
  const when = startText(su.start);
  const g = { title: 'Запись на кастомки', text: '', btns: [], quiet: [], now: false, step: 0, steps: ['Вход', 'Steam', 'Запись', 'Лобби'] };
  if (su.lobby) {
    const inside = !!me && su.inside.includes(me.id);
    g.steps = idx >= 0 ? g.steps : ['Вход', 'Steam', 'Лобби'];
    g.step = !me ? 0 : !ready ? 1 : g.steps.length - 1;
    g.now = !inside;
    g.title = inside ? 'Ты уже в лобби' : 'Лобби создано — заходи';
    g.text = inside ? 'Игра собирается в лобби.'
      : idx >= 0 ? `Твой номер в списке — ${idx + 1}. Жми «Войти в лобби», чтобы занять своё место.${idx >= cap ? ` В первую игру идут первые ${cap} по списку. Ты в запасе: сыграешь в следующей — или в этой, если кто-то выше не придёт.` : ''}`
        : 'Жми «Войти в лобби»: встанешь в список сразу за теми, кто записался заранее.';
    if (su.inside.length) g.text += ` В лобби уже ${su.inside.length} из ${su.list.length} записавшихся.`;
    g.btns = [btn('enter', inside ? 'Открыть лобби' : 'Войти в лобби', 'primary xl')];
  } else {
    // лобби по записи создаёт тот, кто её открыл; когда время пришло, это его главная кнопка (на шаге главная кнопка одна)
    const main = left <= 0 && boss;
    const lead = left > 0 ? `Старт ${when}.` : main ? `Старт был ${when}. ` : `Время пришло: старт был ${when}. Ждём, когда ведущий создаст лобби.`;
    if (idx >= 0) {
      g.step = 3;
      g.title = `Ты записан — твой номер ${idx + 1}`;
      const spare = idx >= cap ? ` В первую игру идут первые ${cap} по списку. Ты в запасе: сыграешь в следующей — или в этой, если кто-то выше не придёт.` : '';
      g.text = main ? `${lead}Жми «Создать лобби»: всем записавшимся (их ${su.list.length}) появится кнопка «Войти в лобби», а в лобби они встанут по порядку записи.`
        : left > 0 ? `${lead} Больше ничего делать не нужно: когда ведущий создаст лобби, здесь появится кнопка «Войти в лобби».${spare}`
          : `Время пришло: старт был ${when}. Как только ведущий создаст лобби, здесь появится кнопка «Войти в лобби» — вкладку можно не закрывать.${spare}`;
      g.quiet.push(btn('leave', 'Отписаться', 'ghost'));
    } else if (me && !ready) {
      g.step = 1;
      g.now = !!want.get('signup', su.id);                               // он уже нажал «Записаться» — ведём дальше
      g.title = 'Остался один шаг — Steam';
      g.text = `${lead} Ранг и героев сайт берёт из игры — по твоему Steam. Привяжи его, и запись завершится сама.`;
      g.btns = [btn('join', `${ICON.steam}<span>Привязать Steam</span>`, 'primary xl')];
    } else {
      g.step = me ? 2 : 0;
      g.text = main ? `${lead}Жми «Создать лобби»: всем записавшимся (их ${su.list.length}) появится кнопка «Войти в лобби», а в лобби они встанут по порядку записи. Играешь сам — запишись.`
        : `${lead} ${su.list.length ? `Уже записались ${su.list.length}. ` : ''}Кто раньше записался, тот раньше попадает в игру.${me ? '' : ' Жми «Записаться» — сайт проведёт через вход Twitch и Steam, это минута.'}`;
      g.btns = [btn('join', 'Записаться', main ? 'xl' : 'primary xl')];
    }
    if (main) { g.title = 'Время пришло — создавай лобби'; g.now = true; g.step = 3; }
    if (boss && me.can_host) (main ? g.btns : g.quiet).unshift(btn('lobby', 'Создать лобби', main ? 'primary xl' : 'xl'));
    if (boss) g.quiet.push(btn('time', 'Изменить время', 'ghost'), btn('close', 'Закрыть запись', 'ghost'));
  }
  const by = new Map(su.list.map((p) => [p.uid, p]));
  // Список делится чертой на игры: первые cap по записи — первая игра, дальше вторая или запас. Метка «следующая игра»
  // в каждой строке сжимала имена до «Wi…», а черта говорит то же самое один раз.
  const n = su.list.length;
  const cut = (i) => {
    if (n <= cap || i % cap) return '';
    const full = i + cap <= n;
    const words = !i ? `первые ${cap} по порядку записи` : full ? 'играют следом' : 'играют следующими — или в этой игре, если кто-то выше не придёт';
    return `<div class="su-cut"><b>${!i ? 'Первая игра' : full ? `Игра ${i / cap + 1}` : `Запас · ${n - i}`}</b><span>${words}</span></div>`;
  };
  const rows = su.list.map((p, i) => {
    const tags = [];
    if (su.lobby && su.inside.includes(p.uid)) tags.push('<span class="tag ok">в лобби</span>');
    return `${cut(i)}<a class="slot ${me && p.uid === me.id ? 'me-row' : ''}" href="#/u/${esc(p.login)}"><span class="pos">${i + 1}</span>${ava(p)}
      <span class="who"><span class="nm"><b>${esc(p.name)}</b>${tags.join('')}</span><span class="sub">${rank(p)}</span></span>
      ${boss && !su.lobby ? `<span class="su-x" role="button" data-su-kick="${esc(p.uid)}" title="Убрать из списка" aria-label="Убрать ${esc(p.name)} из списка">×</span>` : ''}${badgeImg(p.badge)}</a>`;
  }).join('');
  let pre = '';
  if (su.prelim && su.prelim.games.length && !su.lobby) {
    const side = (k, ids, sum) => `<div class="pl-side ${k}"><div class="pl-h"><span class="tn">${TEAM[k]}</span><span class="num">сила ${fmt(sum)}</span></div>
      ${ids.map((u) => { const p = by.get(u) || { name: '?' }; return `<a class="pl-p ${me && u === me.id ? 'mine' : ''}" href="#/u/${esc(p.login || '')}">${ava(p, 's')}<b>${esc(p.name)}</b>${badgeImg(p.badge)}</a>`; }).join('')}</div>`;
    const games = su.prelim.games.map((x, i) => `<div class="pl-game"><div class="pl-t"><b>${su.prelim.games.length > 1 ? `Игра ${i + 1}` : 'Первая игра'}</b><span class="dim">${esc(x.words || '')}</span></div>
      <div class="pl-vs">${side('a', x.a, x.sum_a)}${side('b', x.b, x.sum_b)}</div></div>`).join('');
    // запас здесь не повторяем: он уже отделён чертой в списке выше
    pre = `<section class="card prelim"><header><h2>Предварительные команды</h2><span class="dim">по силе игроков и порядку записи · настоящие наберут капитаны в лобби</span></header>${games}</section>`;
  }
  const timer = !su.lobby && left > 0 ? `<div class="su-clock"><span>до старта</span><b class="stclock mono long" data-su-until="${su.start}">${countdown(left)}</b></div>` : '';
  const buttons = g.btns.join('') + g.quiet.join('');
  return `<div class="su" data-su-id="${esc(su.id)}"><section class="stage ${g.now ? 'now' : ''}">
      <div class="su-head">${ava(su.host, 's')}<b>Кастомки ${esc(su.host.name)}</b>${su.host.live ? '<span class="chip live">LIVE</span>' : ''}
        ${o && o.here ? '' : `<a class="plink on" href="#/${esc(su.host.login)}">страница ведущего</a>`}</div>
      ${steps(g.steps, g.step)}
      <div class="stbody"><div class="sthead ${timer ? 'longt' : ''}"><div><h2 class="sttitle">${esc(g.title).replace(/ — /g, '&nbsp;— ')}</h2><p class="sttext">${g.text}</p></div>${timer}</div>
        ${buttons ? `<div class="stbtns">${buttons}</div>` : ''}</div></section>
    <section class="card plist"><header><h2>Записались</h2><span class="dim num">${n}${n ? ' · по порядку записи' : ''}${n <= cap ? `<span class="su-wide"> · в одной игре ${cap}</span>` : ''}</span></header>
      ${rows ? `<div class="pgrid">${rows}</div>` : '<div class="empty">Пока никто не записался. Будь первым.</div>'}</section>${pre}</div>`;
}

// Ведущий открывает запись: спрашиваем время (по умолчанию — ближайшие 18:00 по Москве). -> true, если открыл.
export async function openSignup() {
  const r = await askStart(0, { title: 'Запись на кастомки', save: 'Открыть запись',
    text: 'На главной появится кнопка «Записаться» с таймером и список записавшихся. Лобби заранее создавать не нужно: создашь его перед игрой, и записавшимся покажется кнопка «Войти в лобби» — их места в очереди останутся по порядку записи.' });
  if (!r || !r.at) return false;
  try { await call('/signup', { do: 'open', start: r.at }); toast(`Запись открыта: старт ${startText(r.at)}`); return true; } catch (e) { oops(e); return false; }
}

// Человек нажал «Записаться», и его остановил вход или Steam. Когда они готовы, записываем сами — второй раз жать не надо.
let resuming = false;
export async function resumeSignup(list, refresh) {
  const me = user.me;
  if (!me || resuming) return;
  for (const su of list || []) {
    if (!want.get('signup', su.id)) continue;
    const boss = me.id === su.host.uid || me.admin;
    if (su.lobby || su.list.some((p) => p.uid === me.id)) { want.clear(); return; }
    if (!me.steam && !boss) return;                           // ещё нужен Steam: на блоке стоит кнопка этого шага
    resuming = true;
    want.clear();
    try { const r = await call('/signup', { do: 'join', id: su.id }); toast(`Готово: ты записан, твой номер — ${r.n}`); } catch (e) { oops(e); }
    resuming = false;
    await refresh();
    return;
  }
}

// Нажатия внутри блоков записи. list — записи, которые сейчас на странице; refresh — перечитать их с сервера.
// -> true, если нажатие было по блоку записи.
export function signupClick(e, list, refresh) {
  const kick = e.target.closest('[data-su-kick]');
  const b = kick || e.target.closest('[data-su]');
  if (!b) return false;
  const box = b.closest('[data-su-id]');
  const su = box && (list || []).find((x) => x.id === box.dataset.suId);
  if (!su) return false;
  e.preventDefault();
  const me = user.me;
  const boss = !!me && (me.id === su.host.uid || me.admin);
  const send = async (body, ok) => {
    try { const r = await call('/signup', Object.assign({ id: su.id }, body)); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); } catch (err) { oops(err); }
    await refresh();
  };
  (async () => {
    if (kick) {
      const p = su.list.find((x) => x.uid === kick.dataset.suKick) || { name: 'игрока' };
      if (await confirmHold({ title: `Убрать ${p.name} из списка?`, text: 'Место в списке не сохранится: если запишется снова, встанет в конец.', label: 'Убрать из списка', seconds: 1 })) await send({ do: 'kick', uid: kick.dataset.suKick }, 'Убран из списка');
      return;
    }
    const a = b.dataset.su;
    if (a === 'join') {
      // одна кнопка на все шаги: нет входа — ведём на Twitch, нет Steam — на Steam; запись потом завершится сама
      if (!me) { want.set('signup', su.id); login(); } else if (!me.steam && !boss) { want.set('signup', su.id); linkSteam(); } else await send({ do: 'join' }, (r) => `Ты записан, твой номер — ${r.n}`);
    } else if (a === 'leave') await send({ do: 'leave' }, 'Ты отписался');          // игроку — без подтверждений
    else if (a === 'time') {
      const r = await askStart(su.start, { title: 'Время старта' });
      if (r && r.at) await send({ do: 'time', start: r.at }, `Старт ${startText(r.at)}`);
    } else if (a === 'close') {                               // стирает список — поэтому с удержанием кнопки
      if (await confirmHold({ title: 'Закрыть запись?', text: su.list.length ? `Список записавшихся (${su.list.length}) пропадёт. Вернуть его нельзя.` : 'Блок записи пропадёт с главной.', label: 'Закрыть запись', seconds: 2 })) await send({ do: 'close' }, 'Запись закрыта');
    } else if (a === 'lobby') {
      try { await call('/events', { signup: su.id }); location.hash = '#/' + me.login; } catch (err) { oops(err); }
    } else if (a === 'enter') {
      // вход в лобби одним нажатием: записываем в него и открываем его страницу. Нет входа или Steam — страница лобби
      // проведёт через них и запишет сама (тот же want).
      if (me && (me.steam || boss) && !su.inside.includes(me.id)) { try { await call(`/events/${su.lobby.id}/act`, { do: 'join' }); } catch (err) { /* уже в лобби */ } } else if (!me || !me.steam) want.set('lobby', su.lobby.id);
      location.hash = '#/' + su.lobby.login;
    }
  })();
  return true;
}

// Таймеры блоков записи идут сами; один общий на страницу.
if (typeof document !== 'undefined' && !window.lobbySignupTick) {
  window.lobbySignupTick = true;
  setInterval(() => {
    for (const el of document.querySelectorAll('[data-su-until]')) {
      const txt = countdown(+el.dataset.suUntil - Date.now() / 1000);
      if (el.textContent !== txt) el.textContent = txt;
    }
  }, 500);
}
