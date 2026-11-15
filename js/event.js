// Страница лобби. Правило одно: один шаг — одна главная кнопка.
// Сверху «сцена»: что сейчас происходит и что нажать именно мне (игроку, капитану или ведущему).
// Под ней комната: места капитанов, список игроков, команды, драфт героев.
import { API, BASE, call, meta } from './api.js?v=20261116043100';
import {
  $, esc, ava, badgeImg, badgeName, heroImg, heroName, fmt, plural, clock, toast, oops, modal, head, closeModal,
  confirmHold, copy, rankPicker, pickedRank, ICON, morph,
} from './ui.js?v=20261116043100';
import { user, login, linkSteam, onUser } from './auth.js?v=20261116043100';
import { scoreHtml, gameRow, openGame } from './score.js?v=20261116043100';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
const TEAM_GEN = { a: 'Янтаря', b: 'Сапфира' };
const NO_CAPS = { a: null, b: null };
const ROLE = { owner: 'Организатор', host: 'Ведущий', caster: 'Кастер' };       // администрация лобби

const btn = (act, label, cls, extra) => `<button class="btn ${cls || ''}" data-act="${act}"${extra || ''}>${label}</button>`;
const P = (act, label, extra) => btn(act, label, 'primary xl', extra);      // главная кнопка шага
const S = (act, label, extra) => btn(act, label, 'xl', extra);              // вторая по важности
const Q = (act, label) => btn(act, label, 'ghost');                         // тихая: отмена, шаг назад

export function mountEvent(root, id, opt) {
  opt = opt || {};
  let st = null;            // состояние, как его видят все
  let pv = null;            // то, что видно только мне: код лобби, права ведущего
  let hostInfo = null;      // ссылки и правила ведущего
  let es = null;
  let dead = false;
  let skew = 0;             // часы сервера минус часы браузера, секунды
  let selHero = null;
  let lastHtml = '';
  let busy = false;
  let making = false;       // бот создаёт лобби в игре: это несколько секунд
  let pvTimer = 0;
  let pvAt = 0;
  const pageTitle = document.title;

  const meId = () => (user.me ? user.me.id : null);
  const isHost = () => !!(pv && pv.host);                   // ведёт лобби: организатор или назначенный им ведущий
  const isOwner = () => !!(pv && pv.owner);                 // организатор: назначает администрацию и закрывает лобби
  const roleOf = (uid) => (!uid ? null : uid === st.host.uid ? 'owner' : st.staff[uid] || null);
  const cards = () => (pv && pv.full) || st.cards;
  const card = (uid) => cards()[uid] || { uid, name: '?', badge: 0, pts: null, mains: [], flags: [] };
  const whereOf = (s, uid) => (!s || !uid ? null : s.seats.includes(uid) ? 'seat' : s.queue.includes(uid) ? 'queue' : null);
  const teamOf = (uid) => (!st.teams ? null : st.teams.a.includes(uid) ? 'a' : st.teams.b.includes(uid) ? 'b' : null);
  const cap = () => st.settings.size * 2;
  const caps = () => st.settings.teams === 'captains';       // капитаны набирают команды; иначе сайт делит по рангу
  const isReady = (u) => st.ready.includes(u) || !!(st.cards[u] && st.cards[u].guest);
  const capOf = (uid) => (!uid || st.phase !== 'gather' ? null : st.caps.a === uid ? 'a' : st.caps.b === uid ? 'b' : null);
  const now = () => Date.now() / 1000 + skew;
  const nm = (uid) => esc(card(uid).name);
  // ранг берётся только из игры; если его там нет — так и пишем (калибровка: рейтинг уже играет, ранг ещё не выдан)
  const rankLine = (c) => (c.badge ? `${esc(badgeName(c.badge))}${c.pts != null && !opt.obs ? ' · <span class="num">' + fmt(c.pts) + '</span>' : ''}`
    : (c.flags || []).includes('calib') ? 'без ранга: калибровка' : 'без ранга');
  function voteCount() {
    const cnt = {};
    for (const t of Object.values(st.votes)) cnt[t] = (cnt[t] || 0) + 1;
    return cnt;
  }

  // ------------------------------------------------------------ связь
  function connect() {
    if (dead) return;
    es = new EventSource(API + '/events/' + id + '/stream');
    es.onmessage = (e) => { try { apply(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    es.addEventListener('table', (e) => {
      try { if (st && st.match) { st.match.table = JSON.parse(e.data); render(); } } catch (err) { console.error(err); }
    });
    es.onerror = () => {
      if (dead || es.readyState !== 2) return;         // сам переподключится
      es = null;
      call('/events/' + id).then((s) => {
        apply(s);
        if (s.phase !== 'closed') setTimeout(connect, 3000);
      }).catch((e) => {
        if (e.status === 404) { root.innerHTML = gone(); return; }
        setTimeout(connect, 4000);
      });
    };
  }

  function apply(next) {
    const prev = st;
    next.caps = next.caps || NO_CAPS;
    next.voting = next.voting || null;
    next.staff = next.staff || {};
    next.lobby_wait = !!next.lobby_wait;
    next.lobby_err = next.lobby_err || null;
    st = next;
    skew = next.now - Date.now() / 1000;
    const fin = (s) => !!(s && s.match && s.match.table && !s.match.table.live);
    if (next.host.login && (!hostInfo || (prev && (prev.phase !== next.phase || prev.round !== next.round || fin(prev) !== fin(next))))) {
      hostInfo = hostInfo || {};
      call('/h/' + next.host.login).then((h) => { hostInfo = h; render(); }).catch(() => {});
    }
    const uid = meId();
    if (!prev || !pv || isHost() || whereOf(prev, uid) !== whereOf(next, uid) || !!prev.lobby !== !!next.lobby
        || (prev.lobby && next.lobby && prev.lobby.at !== next.lobby.at) || (uid && prev.staff[uid] !== next.staff[uid])) getPrivate();
    if (!next.draft || next.draft.done) selHero = null;
    if (prev && prev.voting && !next.voting && next.phase === 'gather' && !opt.obs) {
      const { a, b } = next.caps;
      toast(a && b ? `Капитаны выбраны: ${card(a).name} и ${card(b).name}`
        : a ? `Голоса получил только ${card(a).name}. Второй капитан может вызваться сам`
          : 'Никто не проголосовал: капитаны не выбраны', !a);
    }
    render();
    if (next.phase === 'closed' && es) { es.close(); es = null; }
  }

  function getPrivate() {
    if (!user.me) { pv = { you: null, host: false, code: null }; return; }
    clearTimeout(pvTimer);
    const wait = Math.max(0, 700 - (Date.now() - pvAt));
    pvTimer = setTimeout(async () => {
      pvAt = Date.now();
      try { pv = await call('/events/' + id + '/private'); render(); } catch (e) { /* попробуем на следующем обновлении */ }
    }, wait);
  }

  async function act(what, extra, quiet) {
    if (busy) return null;
    if (!user.me) { login(); return null; }
    busy = true;
    try {
      return await call('/events/' + id + '/act', Object.assign({ do: what }, extra || {}));
    } catch (e) {
      if (e.code === 'auth') login();
      else if (e.code === 'steam') needSteam(e.message);
      else if (!quiet) oops(e);
      return null;
    } finally { busy = false; }
  }

  // ------------------------------------------------------------ шапка и шаги
  const gone = () => `<div class="card empty"><h3>Такого лобби нет</h3><p class="dim" style="margin-top:6px">Возможно, ссылка устарела.</p>
    <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/">На главную</a></div></div>`;

  function headHtml() {
    const s = st.settings;
    const chips = [`${s.size} на ${s.size}`];
    if (s.mode !== 'normal') chips.push(meta.modes[s.mode] || s.mode);
    chips.push(meta.regions[s.region] || s.region);
    chips.push(caps() ? 'команды набирают капитаны' : 'команды делит сайт');
    if (s.draft !== 'none') chips.push('драфт: ' + (s.draft === 'bans' ? 'только баны' : 'баны и пики'));
    if (st.round > 1) chips.push('игра ' + st.round);
    const live = st.host.live ? `<a class="chip live" href="https://twitch.tv/${esc(st.host.login)}" target="_blank" rel="noopener">LIVE</a>` : '';
    return `<div class="ehead">${ava(st.host, 'm')}
      <div class="t"><h1>${esc(st.title)}</h1>
      <div class="chips">${live}${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}
      <a class="chip" href="#/${esc(st.host.login)}">страница ${esc(st.host.name)}</a>
      ${isHost() ? '<span class="chip">смотрят <span data-viewers></span></span>' : ''}</div></div></div>`;
  }

  function stepList() {
    const list = [['gather', 'Запись'], ['teams', 'Команды']];
    if (st.settings.draft !== 'none') list.push(['draft', 'Драфт героев']);
    list.push(['game', 'Игра']);
    const ph = st.phase;
    const cur = ph === 'gather' ? 'gather' : ph === 'pick' ? 'teams' : ph === 'teams' ? (st.draft ? 'draft' : 'teams') : 'game';
    return { list, idx: ph === 'closed' ? list.length : list.findIndex((x) => x[0] === cur) };
  }
  const stepNo = () => stepList().idx + 1;

  function stepsHtml() {
    const { list, idx } = stepList();
    return `<ol class="steps">${list.map((x, i) => `<li class="${i === idx ? 'on' : i < idx ? 'done' : ''}"><i>${i < idx ? '✓' : i + 1}</i><span>${x[1]}</span></li>`).join('')}</ol>`;
  }

  // ------------------------------------------------------------ сцена: что сейчас и что нажать
  // Что мешает записаться: вход или Steam (ранг берётся только из игры). Ведущему можно без Steam.
  function gate() {
    const me = user.me;
    if (!me) {
      return { title: 'Запись на игру открыта', text: 'Войди через Twitch — и сможешь записаться или стать капитаном.',
        btns: [P('login', `${ICON.twitch}<span>Войти через Twitch</span>`)] };
    }
    if (isHost()) return null;
    if (!me.steam) {
      return { title: 'Привяжи Steam, чтобы записаться', text: 'Ранг и герои берутся только из игры — по твоему Steam. Вход идёт на странице Steam, пароль сайт не видит.',
        btns: [P('steam', `${ICON.steam}<span>Привязать Steam</span>`)] };
    }
    return null;
  }

  function resultText() {
    const r = st.match && st.match.result;
    if (!r) return '';
    const src = r.source === 'game' ? 'Итог пришёл из игры' : 'Итог отметил ведущий';
    const dur = r.duration ? `, матч шёл ${Math.round(r.duration / 60)} мин` : '';
    const link = st.match.id ? ` <a class="link" href="https://statlocker.gg/match/${st.match.id}" target="_blank" rel="noopener">Матч на Statlocker</a>.` : '';
    return `${src}${dur}.${link}`;
  }
  function violations() {
    const r = st.match && st.match.result;
    const viol = ((r && r.violations) || []).map((v) => `<div>${nm(v.uid)} сыграл на ${esc(heroName(v.hero))}: ${v.why === 'banned' ? 'герой был забанен' : v.why === 'notpicked' ? 'этого героя команда не брала' : 'при разборе героев занял ' + esc(heroName(v.want))}</div>`).join('');
    return viol ? `<div class="viol">${viol}</div>` : '';
  }

  function stage() {
    const uid = meId();
    const host = isHost();
    const ph = st.phase;
    const s = st.settings;
    const w = whereOf(st, uid);
    const k = teamOf(uid);
    const g = { title: '', text: '', timer: null, btns: [], quiet: [], below: '', tone: '', now: false, uses: [] };
    const blocked = gate();
    const caster = roleOf(uid) === 'caster' && !w;
    // зритель, который ещё не записан: главная кнопка — записаться (или то, что этому мешает)
    const offerJoin = (text) => {
      // кастеру главное — код лобби, а не запись; сыграть сам он может кнопкой «Записаться» в строке «Ты»
      if (caster) { g.text = 'Ты кастер: когда появится лобби в игре, здесь будет код — заходи наблюдателем. Ссылка на слой для OBS — в строке ниже.'; return; }
      if (blocked) { g.text = blocked.text; g.btns = blocked.btns; return; }
      const free = !caps() && st.seats.length < cap() && !st.queue.length && ['gather', 'teams', 'lobby'].includes(ph);
      g.text = text;
      g.btns = [P('join', caps() ? 'Записаться' : free ? 'Занять место' : 'Встать в очередь')];
      g.uses = ['join'];
    };

    if (ph === 'closed') {
      g.title = 'Лобби закрыто';
      g.text = isOwner() ? 'Игры закончены. Новое лобби создаётся одной кнопкой.' : 'Игры на сегодня закончены.';
      g.btns = [isOwner() ? P('new_lobby', 'Создать новое лобби') : '<a class="btn xl" href="#/">На главную</a>'];
      return g;
    }

    if (ph === 'done') {
      const r = st.match && st.match.result;
      g.title = r ? `Победил ${TEAM[r.winner]}` : 'Игра окончена';
      g.tone = r ? r.winner : '';
      g.text = resultText();
      g.below = violations();
      if (st.seats.some((u) => card(u).bot)) g.text += ' Это была проба с тестовыми игроками: в историю и рейтинг она не попала.';
      if (host) {
        g.btns = [P('next', 'Следующая игра')];
        if (r) g.quiet = [Q('win_' + (r.winner === 'a' ? 'b' : 'a'), `Исправить итог: победил ${TEAM[r.winner === 'a' ? 'b' : 'a']}`)];
      } else g.text += ' Следующую игру начнёт ведущий: когда откроется запись, отметь «готов».';
      return g;
    }

    if (ph === 'live') {
      const m = st.match || {};
      const seen = !!(m.table || m.watch);                  // сайт сам следит за игрой: таблица и итог придут без кнопок
      g.title = 'Матч идёт';
      if (host) {
        g.text = seen ? 'Сайт следит за игрой: таблица ниже обновляется сама, итог появится, как только матч закончится. Отмечать победителя нужно, только если что-то пошло не так.'
          : m.id ? 'Ищу трансляцию матча: через минуту здесь появится живая таблица. Если не появится — отметь победителя, когда игра закончится.'
            : 'Когда игра закончится, отметь победителя.';
        g.btns = [btn('win_a', 'Победил Янтарь', 'xl amber'), btn('win_b', 'Победил Сапфир', 'xl sapph')];
      } else {
        g.text = `${w === 'seat' ? 'Удачи! ' : ''}${m.table ? 'Таблица матча ниже обновляется сама. Итог появится здесь, когда игра закончится.' : 'Итог появится здесь, когда игра закончится.'}`;
      }
      return g;
    }

    if (ph === 'lobby') {
      const lb = st.lobby;
      const bot = lb.mode === 'bot';
      const role = roleOf(uid);
      if (host || w === 'seat' || role) {                     // кастеру код тоже нужен: он заходит наблюдателем
        const inside = bot && !!uid && lb.inside.includes(uid);          // бот сообщает, кто уже зашёл в лобби
        const dd = st.draft;
        const sharing = !!dd && dd.done && dd.mode === 'full' && !!k;
        const about = `${k ? ` Твоя команда — «${TEAM[k]}».` : role === 'caster' ? ' Ты кастер: заходи наблюдателем.' : ''}${sharing ? (dd.take[uid] ? ` Твой герой — ${esc(heroName(dd.take[uid]))}.` : ' Не забудь занять героя своей команды ниже.') : ''}`;
        const count = bot && lb.inside.length ? ` В лобби уже ${lb.inside.length} из ${st.seats.length}.` : '';
        if (inside) {
          g.title = 'Ты в лобби. Ждём остальных';
          g.text = `${count}${about}`.trim();
        } else {
          g.title = 'Лобби в игре готово';
          g.text = `Нажми «Подключиться к лобби»: код скопируется, останется вставить его в Deadlock.${about}${count}`;
          g.now = !host;
        }
        const connect = (cls) => btn('connect', 'Подключиться к лобби', cls);
        if (host && bot) {
          g.text += ` Бот уйдёт из лобби через <span class="timer mono" data-until="${lb.leaves}"></span>.`;
          const first = !k || inside;                         // ведущий уже в лобби (или не играет) — его главный шаг: старт
          const start = btn('start', lb.start_sent ? 'Старт отправлен' : 'Запустить матч', first ? 'primary xl' : 'xl', lb.start_sent ? ' disabled' : '');
          g.btns = first ? [start, connect('xl')] : [connect('primary xl'), start];
          g.quiet = [Q('live', 'Матч уже идёт'), Q('lobby_close', 'Отменить лобби')];
        } else if (host) {
          g.text += ' Когда запустишь матч в игре, нажми «Матч начался».';
          g.btns = [P('live', 'Матч начался'), connect('xl')];
          g.quiet = [Q('lobby_close', 'Отменить лобби')];
        } else g.btns = [connect(inside ? 'xl' : 'primary xl')];
      } else {
        g.title = 'Игроки заходят в игру';
        g.text = 'Подключиться к лобби могут только игроки команд.';
      }
      return g;
    }

    if (ph === 'teams') {
      const d = st.draft;
      if (d && !d.done) {
        const step = d.steps[d.i];
        const actor = st.teams[step.team][0];                 // и банит, и берёт героев капитан команды
        const over = d.over != null;
        g.tone = step.team;
        if (actor && actor === uid) {
          g.now = true;
          g.title = step.t === 'ban' ? 'Твой ход: забань героя' : 'Твой ход: возьми героя команде';
          g.text = `Нажми на героя в сетке ниже, потом на кнопку «${step.t === 'ban' ? 'Забанить' : 'Взять'}». ${over ? 'Идёт дополнительное время твоей команды' : 'Выйдет время хода — пойдёт дополнительное время команды'}: кончится и оно — ${step.t === 'ban' ? 'бан пропадёт' : 'герой возьмётся случайный'}.`;
        } else {
          g.title = 'Драфт героев';
          g.text = `${step.t === 'ban' ? 'Банит' : 'Берёт героя'} команда «${TEAM[step.team]}»${actor ? `, капитан ${nm(actor)}` : ''}.${over ? ' Идёт её дополнительное время.' : ''}${host ? ' Можешь сходить за капитана: выбери героя в сетке.' : ' Кто на ком играет, команды решат после драфта.'}`;
        }
        if (host) g.quiet = [Q('draft_off', 'Сбросить драфт')];
        return g;
      }
      const needDraft = s.draft !== 'none' && !d;
      const sharing = !!d && d.done && d.mode === 'full';       // драфт окончен: игроки разбирают героев своей команды
      const got = sharing ? st.seats.filter((u) => d.take[u]).length : 0;
      const mine = sharing && uid ? d.take[uid] : null;
      if (host) {
        const chk = st.check;
        if (st.dirty && !caps()) {
          g.title = 'Состав изменился';
          g.text = 'Кто-то вышел или сел после деления. Подели команды заново или перетащи игрока на место другого.';
          g.btns = [P('balance', 'Поделить заново')];
        } else if (needDraft) {
          g.title = 'Команды собраны';
          g.text = `Дальше драфт героев: по ${s.bans} ${plural(s.bans, 'бану', 'бана', 'банов')} с каждой стороны${s.draft === 'full' ? ', потом капитаны по одному берут героев командам' : ''}.`;
          g.btns = [P('draft', 'Начать драфт')];
        } else {
          const share = sharing ? `Игроки разбирают героев: заняли ${got} из ${st.seats.length}.${k && !mine ? ' Займи героя и ты — нажми на него ниже.' : ''} ` : '';
          const manual = [making ? P('lobby_bot', '<span class="spin"></span><span>Создаю лобби…</span>', ' disabled') : P('lobby_bot', 'Создать лобби в игре'),
            S('lobby_manual', 'Ввести код вручную')];
          g.title = d ? 'Драфт окончен' : 'Команды собраны';
          if (st.lobby_wait) {                                // сайт уже создаёт лобби сам
            g.title = 'Создаю лобби в игре…';
            g.text = `${share}Бот открывает кастомную игру в Deadlock — это несколько секунд. Потом у игроков появится кнопка «Подключиться к лобби».`;
            g.btns = [P('lobby_bot', '<span class="spin"></span><span>Создаю лобби…</span>', ' disabled')];
          } else if (st.lobby_err) {
            g.title = 'Лобби в игре не создалось';
            g.text = `${esc(st.lobby_err)}. ${share}Попробуй ещё раз — или создай лобби в игре сам и введи код.`;
            g.btns = manual;
          } else {
            const test = st.seats.some((u) => card(u).bot);
            g.text = `${share}${test ? 'С тестовыми игроками лобби в игре само не создаётся: настоящих лобби бот даёт немного. Нажми кнопку, если хочешь проверить и этот шаг.'
              : 'Создай лобби в игре: бот откроет кастомную игру в Deadlock, а у игроков появится кнопка «Подключиться к лобби».'}`;
            g.btns = manual;
          }
        }
        g.quiet = caps() ? [Q('unteam', 'Вернуться к записи')]
          : [st.dirty ? '' : Q('balance', 'Поделить заново'), Q('unteam', 'Вернуться к набору'),
            chk ? btn('check_off', `Отменить проверку готовности · <span class="timer mono" data-until="${chk.until}"></span>`, 'ghost') : Q('check', 'Проверить готовность')];
        return g;
      }
      if (w === 'seat') {
        g.tone = k || '';
        if (sharing && !mine) {
          g.now = true;
          g.title = 'Займи героя';
          g.text = 'Нажми на героя своей команды ниже — так вы решаете, кто на ком играет. Поменяться можно, пока матч не начался.';
        } else if (sharing) {
          g.title = `Твой герой — ${heroName(mine)}`;
          g.text = `Передумал — нажми на другого свободного героя своей команды. ${st.lobby_wait ? 'Сайт создаёт лобби в игре: сейчас появится кнопка «Подключиться к лобби».' : 'Ждём лобби в игре.'}`;
        } else {
          g.title = `Ты в команде «${TEAM[k] || '…'}»`;
          g.text = needDraft ? 'Ждём, когда ведущий начнёт драфт героев.' : 'Ждём лобби в игре: появится кнопка «Подключиться к лобби».';
        }
        return g;
      }
      g.title = d ? 'Драфт окончен' : 'Команды собраны';
      if (w === 'queue') g.text = caps() ? 'Ты в запасе: если кто-то выйдет, капитан возьмёт игрока оттуда. На следующую игру запись общая.' : 'Ты в очереди: освободится место — сядешь сразу.';
      else offerJoin(caps() ? 'Можно записаться в запас и на следующую игру.' : 'Освободится место — займёшь его.');
      return g;
    }

    if (ph === 'pick') {
      const turn = st.pick && st.pick.turn;
      const capU = turn ? st.teams[turn][0] : null;
      const free = st.queue.filter(isReady).length;
      g.timer = st.pick && st.pick.until;
      g.tone = turn || '';
      if (capU && capU === uid) {
        g.now = true;
        g.title = 'Твой ход: возьми игрока';
        g.text = `Нажми «Взять» у игрока в списке свободных.${g.timer ? ' Не успеешь — сайт возьмёт сильнейшего.' : ''}`;
      } else if (host && !free) {
        g.timer = null;
        g.title = 'Свободных игроков нет';
        g.text = 'Команды неполные. Подожди, пока кто-то запишется, или играйте так.';
        g.btns = [P('pick_done', 'Играть этими командами')];
      } else {
        const iCap = w === 'seat' && k && st.teams[k][0] === uid;
        g.title = iCap ? `Ты капитан «${TEAM_GEN[k]}»` : w === 'seat' && k ? `Ты в команде «${TEAM[k]}»` : 'Капитаны набирают команды';
        g.text = turn ? `Игрока берёт ${capU ? nm(capU) : 'ведущий'}, команда «${TEAM[turn]}».${iCap ? ' Потом твой ход.' : ''}` : '';
        if (host) g.text += ' Можешь взять игрока за капитана кнопкой «Взять».';
        else if (w === 'queue' && st.ready.includes(uid)) g.text += ' Ты в списке свободных.';
        else if (w === 'queue') {
          g.now = true;
          g.title = 'Отметь, что готов';
          g.text = 'Капитаны берут только готовых.';
          g.btns = [P('ready_on', 'Я готов')];
          g.uses = ['ready_on'];
        } else if (!w) offerJoin(g.text + ' Запишись — попадёшь в список свободных.');
      }
      if (host) g.quiet = [free && g.title !== 'Свободных игроков нет' ? Q('pick_done', 'Закончить набор') : '', Q('unteam', 'Вернуться к записи')];
      return g;
    }

    return caps() ? gatherCaps(g, blocked, offerJoin) : gatherAuto(g, offerJoin);
  }

  // Запись, капитаны набирают команды: общий список, два места капитанов, голосование по кнопке ведущего.
  function gatherCaps(g, blocked, offerJoin) {
    const uid = meId();
    const host = isHost();
    const w = whereOf(st, uid);
    const voting = st.voting;
    const nPool = st.queue.length;
    const nReady = st.queue.filter(isReady).length;
    const { a: ca, b: cb } = st.caps;
    const mine = uid ? st.votes[uid] : null;
    if (voting) {
      const voters = st.queue.filter((u) => st.ready.includes(u));        // живые готовые игроки
      const voted = voters.filter((u) => st.votes[u]).length;
      g.timer = voting.until;
      if (host) {
        g.title = 'Идёт голосование за капитанов';
        g.text = `Проголосовали ${voted} из ${voters.length}. Двое с большинством голосов станут капитанами.${w === 'queue' && !mine ? ' Проголосуй и ты: кнопка «Голос» у игрока в списке.' : ''}`;
        g.btns = [P('vote_close', 'Завершить голосование')];
      } else if (w === 'queue') {
        g.title = 'Голосование за капитанов';
        g.now = !mine;
        g.text = mine ? `Твой голос — ${nm(mine)}. Можно передумать, пока идёт время.` : 'Нажми «Голос» у игрока в списке ниже. Двое с большинством голосов станут капитанами.';
      } else {
        g.title = 'Голосование за капитанов';
        offerJoin('Игроки выбирают двух капитанов. Запишись, чтобы тоже голосовать и играть.');
      }
      return g;
    }
    if (host) {
      if (ca && cb) {
        g.title = 'Капитаны на месте';
        g.text = `${nReady < cap() ? `Готовы ${nReady} из ${cap()} — команды получатся неполными. ` : ''}Начинай набор: капитаны по очереди берут игроков в команды.`;
        g.btns = [P('pick_start', 'Начать набор команд')];
        g.quiet = [Q('vote_open', 'Переголосовать')];
      } else if (nPool < 2) {
        g.title = 'Лобби создано. Позови игроков';
        g.text = 'Кинь ссылку в чат: зрители записываются сами. Хочешь сначала попробовать один — добавь тестовых игроков, они голосуют и ходят сами.';
        g.btns = [P('copy_link', 'Скопировать ссылку для чата'), S('bots', 'Добавить тестовых игроков')];
        g.uses = ['copy_link', 'bots'];
      } else if (nReady < 2) {
        g.title = 'Ждём, пока игроки отметят «готов»';
        g.text = `Записались ${nPool}, готовы ${nReady}. Капитанов выбирают из готовых.`;
        g.btns = [S('copy_link', 'Скопировать ссылку для чата')];
        g.uses = ['copy_link'];
      } else {
        g.title = ca || cb ? 'Нужен второй капитан' : 'Нужны два капитана';
        g.text = ca || cb ? 'Кто-то из игроков нажимает «Стать капитаном». Или запусти голосование — тогда обоих выберут игроки.'
          : 'Запусти голосование: игроки за 30 секунд выберут двоих. Или двое сами нажимают «Стать капитаном» ниже.';
        g.btns = [P('vote_open', 'Капитаны по голосованию')];
      }
      return g;
    }
    if (!w) {
      g.title = roleOf(uid) === 'caster' ? 'Ты кастер этого лобби' : 'Запись на игру открыта';
      if (blocked && roleOf(uid) !== 'caster') { g.title = blocked.title; g.text = blocked.text; g.btns = blocked.btns; return g; }
      offerJoin(`${nPool ? `Уже записались ${nPool}. ` : ''}Запишись игроком — или сразу нажми «Стать капитаном» ниже и набирай свою команду.`);
      return g;
    }
    const cp = capOf(uid);
    if (cp) {
      g.title = `Ты капитан «${TEAM_GEN[cp]}»`;
      g.tone = cp;
      g.text = ca && cb ? 'Ждём, когда ведущий начнёт набор. Будешь по очереди с другим капитаном брать игроков в команду.'
        : 'Ждём второго капитана. Потом ведущий начнёт набор, и ты будешь брать игроков в свою команду.';
      return g;
    }
    if (!st.ready.includes(uid)) {
      g.now = true;
      g.title = st.round > 1 ? `Игра ${st.round}. Играешь?` : 'Ты в списке. Готов играть?';
      g.text = 'Капитаны берут только тех, кто отметил «готов».';
      g.btns = [P('ready_on', 'Я готов')];
      g.uses = ['ready_on'];
      return g;
    }
    g.title = 'Ты в списке игроков';
    g.text = ca && cb ? 'Капитаны выбраны. Ждём, когда ведущий начнёт набор команд.'
      : 'Ждём двух капитанов. Хочешь набирать команду сам — нажми «Стать капитаном» ниже.';
    return g;
  }

  // Запись, сайт делит по рангу: места и очередь.
  function gatherAuto(g, offerJoin) {
    const uid = meId();
    const host = isHost();
    const w = whereOf(st, uid);
    const n = st.seats.length;
    const chk = st.check;
    const ready = chk && uid && chk.ready.includes(uid);
    if (host) {
      if (n < 2) {
        g.title = 'Лобби создано. Позови игроков';
        g.text = 'Кинь ссылку в чат: зрители занимают места сами. Делить команды можно, когда в составе хотя бы двое.';
        g.btns = [P('copy_link', 'Скопировать ссылку для чата'), S('bots', 'Добавить тестовых игроков')];
        g.uses = ['copy_link', 'bots'];
      } else {
        g.title = `В составе ${n} из ${cap()}`;
        g.text = 'Когда состав собран, подели команды: сайт покажет самые ровные варианты.';
        g.btns = [P('balance', 'Поделить команды')];
      }
      if (n) g.quiet = [chk ? btn('check_off', `Отменить проверку готовности · <span class="timer mono" data-until="${chk.until}"></span>`, 'ghost') : Q('check', 'Проверить готовность')];
      return g;
    }
    if (w === 'seat') {
      if (chk && !ready) {
        g.now = true;
        g.timer = chk.until;
        g.title = 'Подтверди готовность';
        g.text = 'Не нажмёшь — место уйдёт первому из очереди.';
        g.btns = [P('ready', 'Я готов')];
      } else {
        g.title = 'Ты в составе';
        g.text = chk ? 'Готовность подтверждена. Ждём остальных.' : 'Ждём, когда ведущий поделит команды. Вкладку не закрывай: может быть проверка готовности.';
      }
      return g;
    }
    if (w === 'queue') {
      g.title = `Ты в очереди: ${st.queue.indexOf(uid) + 1}-й`;
      if (chk && !ready) {
        g.now = true;
        g.timer = chk.until;
        g.text = 'Идёт проверка готовности. Подтверди — и займёшь место того, кто не отзовётся.';
        g.btns = [P('ready', 'Готов заменить')];
      } else {
        g.text = chk ? 'Готовность подтверждена. Если кто-то в составе не отзовётся, место твоё.'
          : st.settings.rotation ? 'Очередь играет следующую игру первой. Освободится место раньше — сядешь сразу.' : 'Освободится место — сядешь сразу.';
      }
      return g;
    }
    const free = n < cap() && !st.queue.length;
    g.title = free ? 'Есть свободное место' : 'Мест нет';
    offerJoin(free ? `В составе ${n} из ${cap()}.` : `В очереди ${st.queue.length} ${plural(st.queue.length, 'человек', 'человека', 'человек')}.${st.settings.rotation ? ' Очередь играет следующую игру первой.' : ''}`);
    return g;
  }

  // Строка «Ты»: кто я в этом лобби и мои тихие кнопки. Кнопку, которая уже стоит главной на сцене, не повторяем.
  function meRow(used) {
    const me = user.me;
    if (!me || st.phase === 'closed') return '';
    const uid = me.id;
    const w = whereOf(st, uid);
    const k = teamOf(uid);
    const ph = st.phase;
    const c = st.cards[uid];
    const badge = c ? c.badge : me.badge;
    let state = 'не записан';
    let cls = '';
    const b = [];
    if (w === 'seat') {
      state = k ? `команда «${TEAM[k]}»${st.teams[k][0] === uid && (caps() || st.teams[k].length > 1) ? ', капитан' : ''}` : 'в составе';
      cls = k || 'ok';
      if (!['live', 'done'].includes(ph)) b.push(['leave', k ? 'Выйти из команды' : 'Выйти из состава']);
    } else if (w === 'queue' && caps()) {
      const cp = capOf(uid);
      if (cp) { state = `капитан «${TEAM_GEN[cp]}»`; cls = cp; b.push(['cap_drop', 'Не быть капитаном']); }
      else if (st.ready.includes(uid)) { state = 'в списке, готов'; cls = 'ok'; b.push(['ready_off', 'Не готов']); }
      else { state = 'в списке, не готов'; b.push(['ready_on', 'Я готов', 'ok']); }
      b.push(['leave', 'Выйти из списка']);
    } else if (w === 'queue') {
      state = `в очереди, ${st.queue.indexOf(uid) + 1}-й`;
      b.push(['leave', 'Выйти из очереди']);
    } else if (!gate() && !['live', 'done'].includes(ph)) {
      b.push(['join', caps() ? 'Записаться' : 'Записаться на игру', 'ok']);
    }
    const role = roleOf(uid);
    if (role === 'caster') b.unshift(['copy_obs', 'Слой для OBS']);
    const buttons = b.filter((x) => !used.includes(x[0])).map(([a, t, cl]) => btn(a, t, 'sm ' + (cl || ''))).join('');
    return `<div class="merow"><span class="lbl">Ты</span>${ava(me, 's')}<b>${esc(me.name)}</b>
      <span class="rk">${badge ? esc(badgeName(badge)) : 'без ранга'}</span>${role ? `<span class="state">${ROLE[role].toLowerCase()}</span>` : ''}
      <span class="state ${cls}">${state}</span><span class="sp"></span>${buttons}</div>`;
  }

  // Тихая полоса ведущего: всё, что не относится к текущему шагу.
  function toolsHtml(used) {
    if (!isHost() || st.phase === 'closed') return '';
    const ph = st.phase;
    const hasBots = Object.values(st.cards).some((c) => c.bot);
    const b = [];
    if (!['live', 'done'].includes(ph)) b.push(['settings', 'Настройки'], ['guest', 'Добавить гостя']);
    if (ph === 'gather') b.push(hasBots ? ['bots_clear', 'Убрать тестовых'] : ['bots', 'Тестовые игроки']);
    if (ph === 'gather' && caps() && !st.voting && st.ready.length > 1) b.push(['ready_reset', 'Переспросить готовность']);
    b.push(['copy_link', 'Ссылка для чата'], ['copy_obs', 'Слой для OBS']);
    // «Закрыть лобби» прижата к правому краю отдельно: при любой ширине она на одном и том же месте
    return `<div class="tools"><div class="tl"><span class="lbl">Управление лобби</span>${b.filter((x) => !used.includes(x[0])).map(([a, t]) => btn(a, t, 'ghost sm')).join('')}</div>
      ${isOwner() ? btn('close', 'Закрыть лобби', 'ghost sm danger') : ''}</div>`;
  }

  let shown = null;         // что сейчас на сцене: нужно заголовку вкладки
  let stageAt = 0;          // когда на сцене сменился шаг
  let stageSeq = 0;         // сколько раз сменился: по чётности меняется класс, и заголовок шага появляется с движением
  function stageHtml() {
    const g = stage();
    if (!shown || shown.title !== g.title) { stageAt = Date.now(); stageSeq += 1; }
    shown = g;
    const btns = g.btns.join('') + g.quiet.join('');
    const num = st.phase === 'closed' || g.timer ? '' : `<span class="stnum" aria-hidden="true">${stepNo()}</span>`;
    return `<section class="stage ${g.tone} ${g.now ? 'now' : ''} ${stageSeq % 2 ? 'swa' : 'swb'}">${num}${stepsHtml()}
      <div class="stbody"><div class="sthead"><div><h2 class="sttitle">${esc(g.title)}</h2>${g.text ? `<p class="sttext">${g.text}</p>` : ''}</div>
        ${g.timer ? `<span class="stclock mono" data-until="${g.timer}"></span>` : ''}</div>
        ${g.below}${btns ? `<div class="stbtns">${btns}</div>` : ''}</div>
      ${meRow(g.uses)}${toolsHtml(g.uses)}</section>`;
  }

  // ------------------------------------------------------------ комната: игроки, капитаны, команды
  function slot(uid, o) {
    o = o || {};
    const c = card(uid);
    const tags = [];
    if (c.live) tags.push('<span class="tag live">LIVE</span>');
    if (o.cap) tags.push(`<span class="tag cap ${o.cap === true ? '' : o.cap}">капитан</span>`);
    if (roleOf(uid) && !o.team) tags.push(`<span class="tag">${ROLE[roleOf(uid)].toLowerCase()}</span>`);
    if (!o.team) {                                            // в узкой колонке команды пометки съедали бы имя
      if (c.bot) tags.push('<span class="tag">тест</span>');
      else if (c.guest) tags.push('<span class="tag">гость</span>');
    }
    if (!opt.obs) {
      const fl = c.flags || [];
      if (isHost() && fl.includes('few')) tags.push('<span class="tag">мало матчей</span>');
      if (isHost() && st.pinned.includes(uid)) tags.push('<span class="tag">закреплён</span>');
    }
    const d = st.draft;
    const pick = d && d.take ? d.take[uid] : null;            // герой, которого игрок занял после драфта
    let dot = '';
    if (o.pool) dot = `<span class="dot ${isReady(uid) ? 'ok' : ''}" title="${isReady(uid) ? 'готов' : 'не готов'}"></span>`;
    else if (st.check && !c.guest) dot = `<span class="dot ${st.check.ready.includes(uid) ? 'ok' : ''}" title="${st.check.ready.includes(uid) ? 'готов' : 'ещё не подтвердил'}"></span>`;
    else if (st.lobby && st.lobby.mode === 'bot' && st.phase === 'lobby' && st.lobby.inside.length) {
      dot = `<span class="dot ${st.lobby.inside.includes(uid) ? 'ok' : ''}" title="${st.lobby.inside.includes(uid) ? 'в лобби' : 'ещё не в лобби'}"></span>`;
    }
    const right = pick ? heroImg(pick, 'pick') : '';
    const drag = isHost() && st.teams && (st.phase === 'teams' || st.phase === 'lobby') && o.team ? ' draggable="true"' : '';
    return `<button class="slot ${uid === meId() ? 'me-row' : ''} ${o.cap ? 'capn' : ''} ${o.pool && !isReady(uid) ? 'idle' : ''}" data-uid="${esc(uid)}"${drag}>
      ${dot}${o.pos ? `<span class="pos">${o.pos}</span>` : ''}${ava(c)}
      <span class="who"><span class="nm"><b>${esc(c.name)}</b>${tags.join('')}</span><span class="sub">${rankLine(c)}</span></span>
      ${right}${o.extra || ''}${badgeImg(c.badge)}</button>`;
  }

  // Свободное место. Когда сайт делит по рангу — нажал и сел; в командах капитанов это просто пустая строка.
  function freeSlot(first) {
    const open = !opt.obs && !caps() && ['gather', 'teams', 'lobby'].includes(st.phase) && !st.queue.length && !whereOf(st, meId());
    if (!open) return '<div class="slot free">Свободное место</div>';
    return `<button class="slot free take ${first ? 'first' : ''}" data-act="${user.me ? 'join' : 'login'}">${first ? '+ Занять место' : 'Свободное место'}</button>`;
  }

  // Два места капитанов. Свободное место — это кнопка «Стать капитаном».
  function capsBlock() {
    const uid = meId();
    const host = isHost();
    const mineCap = capOf(uid);
    const cnt = voteCount();
    const one = (k) => {
      const c = st.caps[k];
      let body;
      if (c) {
        const p = card(c);
        const off = opt.obs ? '' : c === uid ? '<span class="mini" role="button" data-act="cap_drop">Отказаться</span>'
          : host ? `<span class="mini" role="button" data-act="cap_free_${k}">Снять</span>` : '';
        body = `<button class="capwho" data-uid="${esc(c)}">${ava(p, 'm')}
          <span class="who"><b>${esc(p.name)}</b><span class="sub">${rankLine(p)}${cnt[c] ? ` · ${cnt[c]} ${plural(cnt[c], 'голос', 'голоса', 'голосов')}` : ''}</span></span>${off}${badgeImg(p.badge)}</button>`;
      } else if (st.voting) body = '<div class="capfree"><span>Решит голосование</span></div>';
      else if (opt.obs || mineCap) body = '<div class="capfree"><span>Капитана пока нет</span></div>';
      else {
        body = `<div class="capfree">${btn('cap_' + k, 'Стать капитаном', 'xl ' + (k === 'a' ? 'amber' : 'sapph'))}
          ${host ? btn('assign_' + k, 'Назначить игрока', 'ghost sm') : ''}</div>`;
      }
      return `<section class="capslot ${k} ${c ? 'full' : ''}"><h3>Капитан «${TEAM_GEN[k]}»</h3>${body}</section>`;
    };
    return `<div class="capsrow">${one('a')}<span class="vs">VS</span>${one('b')}</div>`;
  }

  // Общий список записавшихся. Во время голосования у готовых игроков появляется кнопка «Голос».
  function playersBlock() {
    const uid = meId();
    const voting = !!st.voting;
    const cnt = voteCount();
    const mine = uid ? st.votes[uid] : null;
    const canVote = voting && uid && st.queue.includes(uid);
    const nReady = st.queue.filter(isReady).length;
    const rows = st.queue.map((u) => {
      let extra = '';
      if (voting) {
        extra = (cnt[u] ? `<span class="votes" title="голосов">${cnt[u]}</span>` : '')
          + (canVote && isReady(u) ? `<span class="mini ${mine === u ? 'on' : ''}" role="button" data-vote="${esc(u)}">${mine === u ? 'Твой голос' : 'Голос'}</span>` : '');
      }
      return slot(u, { pool: true, cap: capOf(u), extra });
    }).join('');
    return `<section class="card plist people ${voting ? 'voting' : ''}"><header><h2>Игроки</h2><span class="dim num">записались ${st.queue.length} · готовы ${nReady} · нужно ${cap()}</span></header>
      ${rows ? `<div class="pgrid">${rows}</div>` : '<div class="empty">Пока никто не записался</div>'}</section>`;
  }

  function teamCol(k) {
    const size = st.settings.size;
    const list = st.teams[k];
    const res = st.match && st.match.result;
    const turn = st.phase === 'pick' && st.pick && st.pick.turn === k;
    const rows = list.map((u, i) => slot(u, { cap: i === 0 && (caps() || list.length > 1) ? k : null, team: k }));
    for (let i = list.length; i < size; i++) rows.push(freeSlot(i === list.length));
    return `<section class="card team ${k} ${turn ? 'turn' : ''} ${res && res.winner === k ? 'win' : ''}" data-team="${k}">
      <header><span class="tn">${TEAM[k]}${res && res.winner === k ? ' — победа' : ''}</span>
      <span class="ts num">${st.sums && !opt.obs ? 'сила ' + fmt(st.sums[k]) : `${list.length} из ${size}`}</span></header>
      <div class="slots">${rows.join('')}</div></section>`;
  }

  // Свободные игроки во время набора (капитан жмёт «Взять») и запас после него.
  function poolCol() {
    const uid = meId();
    const picking = st.phase === 'pick';
    const turn = picking && st.pick && st.pick.turn;
    const myTurn = turn && st.teams[turn][0] === uid;
    const canPick = turn && (isHost() || myTurn);
    const list = st.queue.filter(isReady).concat(st.queue.filter((u) => !isReady(u)));
    const rows = list.map((u) => slot(u, { pool: true,
      extra: canPick && isReady(u) ? `<span class="mini ${myTurn ? 'on' : ''}" role="button" data-pick="${esc(u)}">Взять</span>` : '' })).join('');
    const ready = st.queue.filter(isReady).length;
    return `<section class="card poolcol"><header><h2>${picking ? 'Свободные игроки' : 'Запас'}</h2>
      <span class="dim num">${picking ? `готовы ${ready} из ${st.queue.length}` : st.queue.length}</span></header>
      ${rows ? `<div class="slots">${rows}</div>` : `<div class="empty">${picking ? 'Свободных игроков нет' : 'В запасе никого'}</div>`}</section>`;
  }

  function seatsBlock() {
    const rows = st.seats.map((u) => slot(u));
    for (let i = st.seats.length; i < cap(); i++) rows.push(freeSlot(i === st.seats.length));
    const q = st.queue.map((u, i) => slot(u, { pos: i + 1 })).join('');
    return `<section class="card plist"><header><h2>Состав</h2><span class="dim num">${st.seats.length} из ${cap()}</span></header><div class="pgrid">${rows.join('')}</div></section>
      ${q ? `<section class="card plist"><header><h2>Очередь</h2><span class="dim num">${st.queue.length}</span></header><div class="pgrid">${q}</div></section>` : ''}`;
  }

  function bansRow() {
    const d = st.draft;
    const bans = d && d.done ? d.bans.filter(Boolean) : [];
    if (!bans.length) return '';
    return `<div class="bansrow"><span>Забанены</span>${bans.map((h) => `<span class="dban full" title="${esc(heroName(h))}">${heroImg(h)}</span>`).join('')}</div>`;
  }

  // Таблица матча: во время игры живая, после — итоговая. Победителя берём из итога лобби: ведущий мог его поправить.
  function scoreBlock() {
    const m = st.match;
    if (!m || !m.table || !['live', 'done'].includes(st.phase)) return '';
    return scoreHtml(m.table, { me: opt.obs ? null : meId(), card: (u) => cards()[u] || null, win: m.result ? m.result.winner : null });
  }

  function roomHtml() {
    const ph = st.phase;
    if (!st.teams) return caps() ? (ph === 'closed' ? '' : capsBlock() + playersBlock()) : seatsBlock();
    const d = st.draft;
    // во время драфта под доской — составы команд: люди должны видеть, кто с кем (просьба владельца на живой игре 16.11)
    if (ph === 'teams' && d && !d.done) return `${draftHtml()}<div class="arena two">${teamCol('a')}${teamCol('b')}</div>`;
    const bar = st.sums && !opt.obs && !caps() ? `<div class="sumbar"><span>Баланс команд: <b>${esc(st.sums.words)}</b></span>
      ${st.dirty ? '<span class="chip warn">состав изменился</span>' : `<span class="num">разница в силе ${fmt(st.sums.diff)}</span>`}</div>` : '';
    const mid = caps() && (ph === 'pick' || (st.queue.length && ['teams', 'lobby'].includes(ph)));
    const tail = !caps() && st.queue.length ? `<section class="card plist"><header><h2>Очередь</h2><span class="dim num">${st.queue.length}</span></header>
      <div class="pgrid">${st.queue.map((u, i) => slot(u, { pos: i + 1 })).join('')}</div></section>` : '';
    return `${scoreBlock()}${bar}${heroesHtml()}${bansRow()}<div class="arena ${mid ? 'three' : 'two'}">${teamCol('a')}${mid ? poolCol() : ''}${teamCol('b')}</div>${tail}`;
  }

  // Доска драфта: лента ходов, слоты героев двух команд (без ников: игроки разберут героев сами после драфта),
  // часы по центру, запас дополнительного времени у каждой команды, сетка героев.
  function draftHtml() {
    const d = st.draft;
    if (!d) return '';
    const t = st.teams;
    const step = d.done ? null : d.steps[d.i];
    const banned = new Set(d.bans.filter(Boolean));
    const taken = { a: new Set(d.picks.a), b: new Set(d.picks.b) };
    const capUid = step ? t[step.team][0] : null;
    const can = !!step && !opt.obs && (isHost() || (!!capUid && meId() === capUid));
    const over = !!step && d.over != null;
    const tname = (k) => (t[k].length ? 'Команда ' + nm(t[k][0]) : TEAM[k]);
    const strip = d.steps.map((x, i) => `<i class="${x.team} ${d.done || i < d.i ? 'done' : i === d.i ? 'cur' : ''}">${x.t === 'ban' ? 'бан' : 'пик'}</i>`).join('');
    const count = (k) => d.steps.filter((x) => x.t === 'pick' && x.team === k).length;
    const picks = (k) => {
      const cur = step && step.t === 'pick' && step.team === k ? d.picks[k].length : -1;
      let out = '';
      for (let i = 0; i < count(k); i++) {
        const h = d.picks[k][i];
        const hero = h && meta.byId.get(h);
        out += `<div class="dslot ${i === cur ? 'cur' : ''}">${hero && (hero.card || hero.icon) ? `<img src="${esc(hero.card || hero.icon)}" alt=""><b>${esc(hero.name)}</b>`
          : `<span>${h ? esc(heroName(h)) : '?'}</span>`}</div>`;
      }
      return out;
    };
    const bans = (k) => d.steps.map((x, i) => ({ x, i })).filter((o) => o.x.t === 'ban' && o.x.team === k).map((o) => {
      if (o.i >= d.bans.length) return `<div class="dban ${!d.done && o.i === d.i ? 'cur' : ''}"></div>`;
      const h = d.bans[o.i];
      return h ? `<div class="dban full" title="${esc(heroName(h))}">${heroImg(h)}</div>` : '<div class="dban" title="бан пропущен">—</div>';
    }).join('');
    // запас дополнительного времени команды: тикает, только когда её время хода вышло
    const reserve = (k) => `<div class="dres ${over && step.team === k ? 'on' : ''}" title="Дополнительное время команды на весь драфт">доп. время
      ${over && step.team === k ? `<b class="mono" data-until="${d.until}"></b>` : `<b class="mono">${clock(d.reserve[k])}</b>`}</div>`;
    const mid = step
      ? `<div class="dkind ${step.team}">${step.t === 'ban' ? 'Бан' : 'Выбор героя'}</div>
         <div class="dclock mono ${over ? 'over' : ''}" data-until="${d.until}"></div>
         <div class="dwho">${over ? 'идёт дополнительное время' : capUid ? 'ходит ' + nm(capUid) : ''}${can && meId() === capUid ? ' — твой ход' : ''}</div>`
      : `<div class="dkind">Драфт окончен</div><div class="dwho">${d.mode === 'full' ? 'Игроки разбирают героев' : 'Берите героев в игре'}</div>`;
    let go = '';
    if (step && can) {
      go = selHero && !banned.has(selHero)
        ? btn('draft_go', `${step.t === 'ban' ? 'Забанить' : 'Взять'}: ${esc(heroName(selHero))}`, 'primary xl')
        : `<span class="dim">Выбери героя ниже${isHost() && meId() !== capUid && capUid ? ': ты ходишь за ' + nm(capUid) : ''}</span>`;
    } else if (step) go = '<span class="dim">Ждём хода капитана</span>';
    const tiles = d.done ? '' : meta.heroes.map((h) => {
      const ban = banned.has(h.id);
      const by = taken.a.has(h.id) ? 'a' : taken.b.has(h.id) ? 'b' : null;
      // одинаковые герои разрешены — чужой выбор не мешает, повторяться нельзя только в своей команде
      const off = ban || (step.t === 'pick' && (st.settings.dup ? taken[step.team].has(h.id) : !!by));
      const cls = [off ? 'off' : '', selHero === h.id ? 'sel' : '', can ? '' : 'idle'].join(' ');
      const mark = ban ? '<em class="x">бан</em>' : by ? `<em class="${by}">взят</em>` : '';
      return `<button class="hcard ${cls}" data-hero="${h.id}" ${can && !off ? '' : 'tabindex="-1"'}>
        ${h.card || h.icon ? `<img src="${esc(h.card || h.icon)}" alt="" loading="lazy">` : ''}<span>${esc(h.name)}</span>${mark}</button>`;
    }).join('');
    return `<section class="card draft2">${d.done ? '' : `<div class="dstrip">${strip}</div>`}
      <div class="dhead"><b class="a">${tname('a')}</b><span>VS</span><b class="b">${tname('b')}</b></div>
      <div class="dboard"><div class="dside a"><div class="dpicks" style="--n:${Math.max(count('a'), 1)}">${picks('a')}</div><div class="dbans">${d.done ? '' : reserve('a')}${bans('a')}</div></div>
        <div class="dmid">${mid}</div>
        <div class="dside b"><div class="dpicks" style="--n:${Math.max(count('b'), 1)}">${picks('b')}</div><div class="dbans">${bans('b')}${d.done ? '' : reserve('b')}</div></div></div>
      ${d.done ? '' : `<div class="dgo">${go}</div><div class="hgrid2">${tiles}</div>`}</section>`;
  }

  // После драфта: герои каждой команды. Игрок нажимает на героя своей команды и занимает его — так команды
  // сами решают, кто на ком играет. Нажал на своего ещё раз — освободил.
  function heroesHtml() {
    const d = st.draft;
    if (!d || !d.done || d.mode !== 'full') return '';
    const uid = meId();
    const myTeam = teamOf(uid);
    const open = ['teams', 'lobby'].includes(st.phase) && !opt.obs;
    const col = (k) => {
      const who = {};
      for (const u of st.teams[k]) if (d.take[u]) who[d.take[u]] = u;
      const cards = d.picks[k].map((h) => {
        const hero = meta.byId.get(h);
        const owner = who[h];
        const mine = !!owner && owner === uid;
        const can = open && myTeam === k && (!owner || mine);
        return `<button class="tcard ${mine ? 'mine' : ''} ${owner && !mine ? 'busy' : ''} ${can ? '' : 'idle'}" ${can ? `data-take="${h}"` : 'tabindex="-1"'}>
          ${hero && (hero.card || hero.icon) ? `<img src="${esc(hero.card || hero.icon)}" alt="" loading="lazy">` : ''}
          <span class="hn">${esc(heroName(h))}</span><span class="by">${owner ? nm(owner) : can ? 'Занять' : 'свободен'}</span></button>`;
      }).join('');
      const got = st.teams[k].filter((u) => d.take[u]).length;
      return `<section class="card heroes ${k}"><header><span class="tn">Герои команды «${TEAM[k]}»</span>
        <span class="ts num">заняли ${got} из ${st.teams[k].length}</span></header>
        <div class="tgrid" style="--n:${Math.max(d.picks[k].length, 1)}">${cards || '<div class="empty">Героев нет</div>'}</div></section>`;
    };
    return `<div class="arena two hsplit">${col('a')}${col('b')}</div>`;
  }

  function staffHtml() {
    const owner = isOwner() && st.phase !== 'closed';
    const row = (uid, role) => {
      const c = card(uid);
      const off = owner && role !== 'owner' ? `<span class="mini" role="button" data-unstaff="${esc(uid)}">Снять</span>` : '';
      return `<button class="slot staffrow ${uid === meId() ? 'me-row' : ''}" data-uid="${esc(uid)}">${ava(c)}
        <span class="who"><span class="nm"><b>${esc(c.name)}</b>${c.live ? '<span class="tag live">LIVE</span>' : ''}</span>
        <span class="sub">${ROLE[role]}</span></span>${off}</button>`;
    };
    const ids = Object.keys(st.staff);
    const rows = [row(st.host.uid, 'owner')]
      .concat(ids.filter((u) => st.staff[u] === 'host').map((u) => row(u, 'host')), ids.filter((u) => st.staff[u] === 'caster').map((u) => row(u, 'caster')));
    return `<section class="card staff"><header><h2>Администрация</h2></header><div class="slots">${rows.join('')}</div>
      ${owner ? `<div class="staffadd">${btn('staff_add', 'Назначить ведущего или кастера', 'wide')}
        <p class="dim">Ведущий управляет лобби вместе с тобой. Кастер видит код лобби и заходит в игру наблюдателем.</p></div>` : ''}</section>`;
  }

  // Прошедшие игры этого ведущего: нажал — открылась таблица матча.
  function pastHtml() {
    const list = (hostInfo && hostInfo.matches) || [];
    if (!list.length) return '';
    return `<section class="card past"><header><h2>Прошедшие игры</h2><span class="dim num">${list.length}</span></header>
      <div class="glist">${list.map(gameRow).join('')}</div></section>`;
  }

  function hostInfoHtml() {
    const h = hostInfo || {};
    const parts = [];
    if (h.schedule) parts.push(`<p>${esc(h.schedule)}</p>`);
    if (h.links && h.links.length) parts.push(`<div class="links">${h.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(l.title)}</a>`).join('')}</div>`);
    if (h.rules) parts.push(`<div><h2 style="margin-bottom:8px">Правила</h2><div class="rules">${esc(h.rules)}</div></div>`);
    if (!parts.length) return '';
    return `<section class="card hostinfo"><header><h2>${esc(st.host.name)}</h2></header><div class="body" style="display:grid;gap:14px">${parts.join('')}</div></section>`;
  }

  // Слой для OBS: без кнопок и служебных пометок.
  function obsHtml() {
    const d = st.draft;
    if (d && st.phase === 'teams') return `<div class="obsbox wide">${draftHtml()}</div>`;
    let line = esc(st.title);
    if (st.match && st.match.result) line = `Победил ${TEAM[st.match.result.winner]}`;
    else if (st.phase === 'pick' && st.pick && st.pick.turn) {
      line = `Игрока берёт ${nm(st.teams[st.pick.turn][0])}${st.pick.until ? ` · <span class="timer mono" data-until="${st.pick.until}"></span>` : ''}`;
    } else if (st.voting) line = `Голосование за капитанов · <span class="timer mono" data-until="${st.voting.until}"></span>`;
    let body;
    let count;
    const score = scoreBlock();
    if (score) return `<div class="obsbox wide"><div class="obst"><span>${line}</span></div>${score}</div>`;
    if (st.teams) { body = `<div class="arena two">${teamCol('a')}${teamCol('b')}</div>`; count = `${st.seats.length} из ${cap()}`; }
    else if (caps()) { body = capsBlock(); count = `записались ${st.queue.length}`; }
    else {
      body = `<div class="team card"><div class="slots">${st.seats.map((u) => slot(u)).join('') || '<div class="slot free">Запись открыта</div>'}</div></div>`;
      count = `${st.seats.length} из ${cap()}`;
    }
    return `<div class="obsbox"><div class="obst"><span>${line}</span><span class="dim num">${count}</span></div>${body}</div>`;
  }

  function render() {
    if (!st || dead) return;
    let html;
    if (opt.obs) html = obsHtml();
    else {
      html = `${headHtml()}${st.note ? `<div class="note">${esc(st.note)}</div>` : ''}
        <div class="lobby"><div class="lmain">${stageHtml()}${roomHtml()}</div><aside class="lside">${staffHtml()}${pastHtml()}${hostInfoHtml()}</aside></div>`;
      document.title = (shown && shown.now ? '● ' + shown.title + ' — ' : '') + pageTitle;       // «твой ход» видно и с другой вкладки
    }
    if (html !== lastHtml) {
      lastHtml = html;
      morph(root, html);
      tick();
    }
    // число зрителей меняется часто: ради него страницу не перерисовываем
    const v = root.querySelector('[data-viewers]');
    if (v) v.textContent = st.viewers;
  }

  function tick() {
    const t = now();
    for (const el of root.querySelectorAll('[data-until]')) {
      const txt = clock(+el.dataset.until - t);
      if (el.textContent !== txt) el.textContent = txt;
    }
    for (const el of root.querySelectorAll('[data-since]')) {            // часы матча в живой таблице идут вперёд
      const txt = clock(Math.floor(t - +el.dataset.since));
      if (el.textContent !== txt) el.textContent = txt;
    }
  }
  const ticker = setInterval(tick, 250);

  // ------------------------------------------------------------ окна
  function needSteam(text) {
    const m = modal(`${head('Нужен Steam')}<div class="body"><p class="dim">${esc(text)}. Вход идёт на странице Steam, пароль сайт не видит.</p></div>
      <footer><button class="btn" data-close>Не сейчас</button>
      <button class="btn primary" id="nr-steam">${ICON.steam}<span>Привязать Steam</span></button></footer>`);
    $('#nr-steam', m.el).addEventListener('click', () => { m.close(); linkSteam(); });
  }

  function showVariants(list) {
    let page = 0;
    const draw = () => {
      const part = list.slice(page * 3, page * 3 + 3);
      const m = modal(`${head('Варианты команд')}<div class="body">
        ${part.map((v, i) => {
          const teamCol2 = (k) => `<div><span class="v${k}">${TEAM[k]} · ${fmt(v['sum_' + k])}</span>${v[k].map((u) => `<div class="vp">${badgeImg(card(u).badge)}<b>${nm(u)}</b></div>`).join('')}</div>`;
          const per = v.diff / Math.max(v.a.length, 1) / 1000;
          return `<div class="variant"><div class="vh"><span>Вариант ${page * 3 + i + 1} · разница ${fmt(v.diff)} (${per < 0.1 ? 'команды равны' : per.toFixed(1).replace('.', ',') + ' подранга на игрока'})</span>
            <button class="btn sm primary" data-pick="${page * 3 + i}">Выбрать</button></div><div class="vt">${teamCol2('a')}${teamCol2('b')}</div></div>`;
        }).join('')}</div>
        <footer><button class="btn" data-more ${list.length <= 3 ? 'disabled' : ''}>Ещё варианты</button></footer>`, { wide: true });
      m.el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pick]');
        if (b) {
          const v = list[+b.dataset.pick];
          if (await act('teams', { a: v.a, b: v.b })) m.close();
        } else if (e.target.closest('[data-more]')) {
          page = (page + 1) % Math.ceil(list.length / 3);
          draw();
        }
      });
    };
    draw();
  }

  function playerModal(uid) {
    const c = card(uid);
    const s = c.stats;
    const host = isHost();
    const w = whereOf(st, uid);
    const k = teamOf(uid);
    const links = [];
    if (c.login) links.push(`<a class="btn sm" href="https://twitch.tv/${esc(c.login)}" target="_blank" rel="noopener">${ICON.twitch}<span>Twitch</span></a>`);
    if (c.steam) links.push(`<a class="btn sm" href="https://statlocker.gg/profile/${c.steam}" target="_blank" rel="noopener">Statlocker</a>`);
    if (c.login) links.push(`<a class="btn sm" href="#/u/${esc(c.login)}" data-close>Профиль</a>`);
    const kv = s ? `<div class="kv">
      <div><b>${fmt(s.matches)}</b><span>матчей в базе</span></div>
      <div><b>${s.wr == null ? '—' : s.wr + '%'}</b><span>побед</span></div>
      <div><b>${s.kda == null ? '—' : String(s.kda).replace('.', ',')}</b><span>KDA</span></div>
      <div><b>${fmt(s.spm)}</b><span>душ в минуту</span></div>
      <div><b>${s.m30 ? s.wr30 + '%' : '—'}</b><span>побед за 30 дней (${s.m30})</span></div>
      ${s.index != null ? `<div><b>${s.index}</b><span>индекс игры из 100</span></div>` : ''}</div>
      ${s.heroes.length ? `<div class="hlist">${s.heroes.map((h) => `<div>${heroImg(h.id, 'm')}<span class="n">${esc(heroName(h.id))}</span><span class="dim num">${h.m} ${plural(h.m, 'матч', 'матча', 'матчей')} · ${h.wr}%</span></div>`).join('')}</div>` : ''}`
      : `<p class="dim">${c.bot ? 'Тестовый игрок: добавлен, чтобы попробовать лобби одному. Голосует и ходит сам.' : c.guest ? 'Гостя добавил ведущий, статистики нет.' : 'Steam не привязан: статистики нет.'}</p>`;
    const calib = (c.flags || []).includes('calib');
    const noRank = !c.badge && !c.guest ? `<p class="note">В игре у него пока нет ранга${calib ? ': идёт калибровка' : ''}. Сайт берёт ранг только из игры. ${host ? 'Чтобы команды считались честно, поставь ему ранг сам — поле ниже.' : 'Ранг ему может поставить ведущий.'}</p>` : '';
    let tools = '';
    if (host && st.phase !== 'closed') {
      const b = [];
      const other = k === 'a' ? 'b' : 'a';
      if (isOwner() && !c.guest && uid !== st.host.uid) {
        const r = st.staff[uid];
        if (r !== 'host') b.push('<button class="btn" data-h="staff_host">Сделать ведущим лобби</button>');
        if (r !== 'caster') b.push('<button class="btn" data-h="staff_caster">Сделать кастером</button>');
        if (r) b.push('<button class="btn" data-h="staff_off">Снять из администрации</button>');
      }
      if (w === 'queue' && caps() && st.phase === 'gather' && !st.voting) {
        const cp = capOf(uid);
        if (cp) b.push('<button class="btn" data-h="uncap">Снять с капитанов</button>');
        else b.push('<button class="btn" data-h="cap_a">Назначить капитаном «Янтаря»</button><button class="btn" data-h="cap_b">Назначить капитаном «Сапфира»</button>');
      }
      if (k && ['teams', 'lobby'].includes(st.phase)) {
        b.push(`<label class="field"><span>Поменять местами с игроком другой команды</span><select class="input" id="pm-swap"><option value="">Выбери игрока</option>
          ${st.teams[other].map((u) => `<option value="${esc(u)}">${nm(u)} · ${esc(badgeName(card(u).badge))}</option>`).join('')}</select></label>`);
        if (st.teams[other].length < st.settings.size) b.push(`<button class="btn" data-h="move">Перенести в команду «${TEAM[other]}»</button>`);
        if (st.teams[k][0] !== uid) b.push('<button class="btn" data-h="captain">Сделать капитаном команды</button>');
      }
      if (w === 'queue' && (!caps() || st.teams)) b.push(`<button class="btn" data-h="seat">${caps() ? 'Добавить в команду, где меньше игроков' : 'Посадить в состав вне очереди'}</button>`);
      if (w === 'seat' && !['live', 'done'].includes(st.phase)) {
        if (!caps()) b.push(`<button class="btn" data-h="pin">${st.pinned.includes(uid) ? 'Снять закрепление' : 'Закрепить в составе на все игры'}</button>`);
        if (!c.guest) b.push(`<button class="btn" data-h="toqueue">${caps() ? 'Вернуть в свободные игроки' : 'Убрать в конец очереди'}</button>`);
        b.push(`<button class="btn danger" data-h="kick">${caps() ? 'Убрать из команды и из лобби' : 'Убрать из состава'}</button>`);
      }
      if (w === 'queue') b.push(`<button class="btn danger" data-h="kick">${caps() ? 'Убрать из списка' : 'Убрать из очереди'}</button>`);
      if (!c.guest && uid !== st.host.uid) {
        b.push(`<label class="field"><span>Ранг от ведущего: твоя оценка главнее ранга из игры</span>${rankPicker('pm-rank', (pv.overrides || {})[uid] || 0)}</label>
          <div class="row"><button class="btn" data-h="override">Сохранить ранг</button>${(pv.overrides || {})[uid] ? '<button class="btn ghost" data-h="override_off">Сбросить поправку</button>' : ''}</div>`);
        b.push('<button class="btn danger" data-h="ban">Закрыть доступ к моим лобби</button>');
      }
      if (b.length) tools = `<div style="border-top:1px solid var(--line);padding-top:14px"><h2 style="margin-bottom:10px">Действия ведущего</h2><div class="acts">${b.join('')}</div></div>`;
    }
    const m = modal(`<header><div class="row" style="gap:12px">${ava(c, 'l')}<div><h3>${esc(c.name)}</h3>
      <div class="dim" style="font-size:13px">${esc(badgeName(c.badge))}${c.pts != null ? ' · сила ' + fmt(c.pts) : ''}${c.games ? ` · ${c.games} ${plural(c.games, 'игра', 'игры', 'игр')} на сайте, побед ${c.wins}` : ''}</div></div></div>
      <button class="x" data-close aria-label="Закрыть">×</button></header>
      <div class="body">${links.length ? `<div class="row">${links.join('')}</div>` : ''}${noRank}${kv}${tools}</div>`);
    m.el.addEventListener('change', async (e) => {
      if (e.target.id === 'pm-swap' && e.target.value) { if (await act('swap', { u1: uid, u2: e.target.value })) m.close(); }
    });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-h]');
      if (!b) return;
      const h = b.dataset.h;
      let ok = null;
      if (h === 'move') ok = await act('move', { uid, to: k === 'a' ? 'b' : 'a' });
      else if (h === 'captain') ok = await act('captain', { uid });
      else if (h === 'staff_host' || h === 'staff_caster') ok = await act('staff', { uid, role: h.slice(6) });
      else if (h === 'staff_off') ok = await act('staff', { uid, role: null });
      else if (h === 'cap_a' || h === 'cap_b') ok = await act('cap_set', { team: h.slice(-1), uid });
      else if (h === 'uncap') ok = await act('cap_set', { team: capOf(uid), uid: null });
      else if (h === 'seat') ok = await act('seat', { uid });
      else if (h === 'pin') ok = await act('pin', { uid, on: !st.pinned.includes(uid) });
      else if (h === 'toqueue') ok = await act('kick', { uid, queue: true });
      else if (h === 'kick') ok = await act('kick', { uid });
      else if (h === 'override') {
        const badge = pickedRank('pm-rank');
        if (!badge) { toast('Выбери ранг', true); return; }
        ok = await act('override', { uid, badge });
      } else if (h === 'override_off') ok = await act('override', { uid, badge: null });
      else if (h === 'ban') {
        m.close();
        if (await confirmHold({ title: 'Закрыть доступ игроку ' + c.name + '?', text: 'Он вылетит из этого лобби и не сможет записаться в твои следующие. Вернуть доступ можно в настройках.', label: 'Закрыть доступ', seconds: 1.5 })) await act('ban', { uid, on: true });
        return;
      }
      if (ok) m.close();
    });
  }

  function settingsModal() {
    const s = st.settings;
    const sel = (name, map, cur) => `<select class="input" name="${name}">${Object.entries(map).map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const sw = (name, label, on) => `<label class="switch"><span>${label}</span><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><i></i></label>`;
    const sizes = Object.fromEntries([6, 5, 4, 3, 2, 1].map((n) => [n, `${n} на ${n}`]));
    const banned = (pv.banned || []).map((b) => `<div class="row" style="justify-content:space-between"><span>${esc(b.name)}</span><button class="btn sm" data-unban="${esc(b.uid)}">Вернуть доступ</button></div>`).join('');
    const m = modal(`${head('Настройки лобби')}<form class="body" id="set-form">
      <label class="field"><span>Название</span><input class="input" name="title" maxlength="60" value="${esc(st.title)}"></label>
      <label class="field"><span>Объявление для игроков (необязательно)</span><input class="input" name="note" maxlength="200" value="${esc(st.note || '')}" placeholder="Например: голос в Discord, ссылка в описании"></label>
      <div class="grid2" style="gap:10px">
        <label class="field"><span>Формат</span>${sel('size', sizes, s.size)}</label>
        <label class="field"><span>Кто набирает команды</span>${sel('teams', meta.teams, s.teams)}</label>
        <label class="field"><span>Драфт героев</span>${sel('draft', meta.drafts, s.draft)}</label>
        <label class="field"><span>Банов на команду</span>${sel('bans', { 1: '1', 2: '2', 3: '3', 4: '4' }, s.bans)}</label>
        <label class="field"><span>Порядок выбора героев</span>${sel('order', meta.orders, s.order)}</label>
        <label class="field"><span>Секунд на ход</span>${sel('pick_seconds', { 15: '15', 20: '20', 30: '30', 45: '45', 60: '60' }, s.pick_seconds)}</label>
        <label class="field"><span>Дополнительное время команды на драфт</span>${sel('reserve_seconds', { 0: 'нет', 30: '0:30', 60: '1:00', 90: '1:30', 120: '2:00', 180: '3:00' }, s.reserve_seconds == null ? 90 : s.reserve_seconds)}</label>
        <label class="field"><span>Режим игры</span>${sel('mode', meta.modes, s.mode)}</label>
        <label class="field"><span>Регион сервера</span>${sel('region', meta.regions, s.region)}</label>
      </div>
      ${sw('auto_lobby', 'Создавать лобби в игре самому, когда драфт окончен', s.auto_lobby !== false)}
      ${sw('rotation', 'Очередь играет следующую игру первой (когда команды делит сайт)', s.rotation)}
      ${sw('dup', 'Одинаковые герои разрешены', s.dup)}
      ${sw('lanes', 'Случайные линии', s.lanes)}
      ${sw('cheats', 'Читы включены', s.cheats)}
      ${banned ? `<div style="border-top:1px solid var(--line);padding-top:12px;display:grid;gap:8px"><h2>Закрыт доступ</h2>${banned}</div>` : ''}
      </form><footer><button class="btn" data-close>Отмена</button><button class="btn primary" id="set-save">Сохранить</button></footer>`);
    m.el.addEventListener('click', async (e) => {
      const u = e.target.closest('[data-unban]');
      if (u) { e.preventDefault(); if (await act('ban', { uid: u.dataset.unban, on: false })) { m.close(); toast('Доступ возвращён'); } }
    });
    $('#set-save', m.el).addEventListener('click', async () => {
      const f = new FormData($('#set-form', m.el));
      const g = (n) => f.get(n);
      const settings = { size: +g('size'), mode: g('mode'), region: g('region'), draft: g('draft'), teams: g('teams'), order: g('order'), bans: +g('bans'), pick_seconds: +g('pick_seconds'), reserve_seconds: +g('reserve_seconds'),
        auto_lobby: f.has('auto_lobby'), rotation: f.has('rotation'), dup: f.has('dup'), lanes: f.has('lanes'), cheats: f.has('cheats') };
      if (!await act('settings', { settings })) return;
      const title = String(g('title')).trim();
      if (title && title !== st.title) await act('title', { title });
      if (String(g('note')).trim() !== (st.note || '')) await act('note', { note: String(g('note')) });
      m.close();
      toast('Настройки сохранены');
    });
  }

  // Организатор назначает ведущего или кастера по логину Twitch (игрока из списка — и из его карточки).
  function staffModal() {
    const m = modal(`${head('Назначить в администрацию')}<div class="body">
      <label class="field"><span>Логин на Twitch</span><input class="input" id="sf-login" maxlength="30" placeholder="например, qissme_" autocomplete="off"></label>
      <label class="field"><span>Роль</span><select class="input" id="sf-role">
        <option value="host">Ведущий — управляет лобби вместе с тобой</option>
        <option value="caster">Кастер — видит код лобби, заходит наблюдателем</option></select></label>
      <p class="dim">Человек должен хотя бы раз войти на сайт через Twitch. Ведущий может всё, кроме закрытия лобби и назначений. Список запомнится для твоих следующих лобби.</p></div>
      <footer><button class="btn" data-close>Отмена</button><button class="btn primary" id="sf-go">Назначить</button></footer>`);
    const go = async () => {
      const login = $('#sf-login', m.el).value.trim();
      if (!login) { toast('Впиши логин Twitch', true); return; }
      const role = $('#sf-role', m.el).value;
      if (await act('staff', { login, role })) { m.close(); toast(`${login} — ${ROLE[role].toLowerCase()} лобби`); }
    };
    $('#sf-go', m.el).addEventListener('click', go);
    $('#sf-login', m.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  // Ведущий сам назначает капитана команды из записавшихся.
  function assignModal(k) {
    const rows = st.queue.filter((u) => st.caps.a !== u && st.caps.b !== u)
      .map((u) => `<button class="btn" data-pickcap="${esc(u)}">${nm(u)}<span class="dim">&nbsp;· ${esc(badgeName(card(u).badge))}</span></button>`).join('');
    const m = modal(`${head('Капитан «' + TEAM_GEN[k] + '»')}<div class="body">
      ${rows ? `<p class="dim">Выбери игрока из записавшихся.</p><div class="acts">${rows}</div>` : '<p class="dim">Пока некого назначить: никто не записался.</p>'}</div>`);
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pickcap]');
      if (b && await act('cap_set', { team: k, uid: b.dataset.pickcap })) m.close();
    });
  }

  function guestModal() {
    const m = modal(`${head('Добавить гостя')}<div class="body">
      <p class="dim">Для друга без аккаунта на сайте: он попадёт в список игроков с рангом, который ты укажешь, и будет считаться готовым.</p>
      <label class="field"><span>Имя</span><input class="input" id="g-name" maxlength="24"></label>
      <label class="field"><span>Ранг</span>${rankPicker('g-rank', 0)}</label></div>
      <footer><button class="btn" data-close>Отмена</button><button class="btn primary" id="g-add">Добавить гостя</button></footer>`);
    $('#g-add', m.el).addEventListener('click', async () => {
      const name = $('#g-name', m.el).value.trim();
      const badge = pickedRank('g-rank');
      if (!name || !badge) { toast('Нужны имя и ранг', true); return; }
      if (await act('guest', { name, badge })) m.close();
    });
  }

  // «Подключиться к лобби»: код уже скопирован; показываем, куда его вставить. Сам код скрыт, пока не попросят:
  // страницу часто показывают на стриме.
  function connectModal() {
    const k = teamOf(meId());
    const m = modal(`${head('Подключиться к лобби')}<div class="body">
      <p>Код лобби скопирован. Осталось вставить его в игре:</p>
      <ol class="todo"><li>Открой Deadlock.</li><li>Зайди в кастомные матчи и выбери вход по коду.</li>
        <li>Вставь код (Ctrl+V)${k ? ` и сядь в команду «${TEAM[k]}»` : ' и зайди наблюдателем'}.</li></ol>
      <div class="codebox"><span class="code hid" id="cn-code">•••••</span><button class="btn" id="cn-show">Показать код</button>
        <button class="btn primary" id="cn-copy">Скопировать ещё раз</button></div></div>
      <footer><a class="btn" href="steam://rungameid/1422450">Запустить Deadlock</a><button class="btn primary" data-close>Готово</button></footer>`);
    let open = false;
    $('#cn-show', m.el).addEventListener('click', () => {
      open = !open;
      const el = $('#cn-code', m.el);
      el.textContent = open && pv && pv.code ? pv.code : '•••••';
      el.classList.toggle('hid', !open);
      $('#cn-show', m.el).textContent = open ? 'Скрыть код' : 'Показать код';
    });
    $('#cn-copy', m.el).addEventListener('click', () => { if (pv && pv.code) copy(pv.code, 'Код лобби скопирован'); });
  }

  function codeModal() {
    const m = modal(`${head('Код лобби из игры')}<div class="body">
      <p class="dim">Создай кастомный матч в Deadlock сам и вставь сюда его код. Код увидят только игроки команд.</p>
      <input class="input mono" id="lc-code" maxlength="10" placeholder="A1B2C" autocomplete="off" style="text-transform:uppercase;font-size:20px;height:48px;letter-spacing:.14em"></div>
      <footer><button class="btn" data-close>Отмена</button><button class="btn primary" id="lc-go">Показать код игрокам</button></footer>`);
    const go = async () => { if (await act('lobby_code', { code: $('#lc-code', m.el).value.trim() })) m.close(); };
    $('#lc-go', m.el).addEventListener('click', go);
    $('#lc-code', m.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  // ------------------------------------------------------------ нажатия
  const claim = async (k) => { const r = await act('cap_claim', { team: k }); if (r) toast(`Ты капитан «${TEAM_GEN[r.team]}»`); };
  const ACTS = {
    login: () => login(),
    steam: () => (user.me ? linkSteam() : login()),
    join: async () => {
      const r = await act('join');
      if (r) toast(r.where === 'seat' ? 'Ты в составе' : r.where === 'pool' ? 'Ты в списке игроков' : 'Ты в очереди');
    },
    leave: () => act('leave'),
    ready: () => act('ready'),
    ready_on: () => act('ready', { on: true }),
    ready_off: () => act('ready', { on: false }),
    ready_reset: async () => { if (await act('ready_reset')) toast('Отметки «готов» сняты: игроки подтверждают заново'); },
    cap_a: () => claim('a'),
    cap_b: () => claim('b'),
    cap_drop: () => act('cap_drop'),
    cap_free_a: () => act('cap_set', { team: 'a', uid: null }),
    cap_free_b: () => act('cap_set', { team: 'b', uid: null }),
    assign_a: () => assignModal('a'),
    assign_b: () => assignModal('b'),
    vote_open: () => act('vote_open'),
    vote_close: () => act('vote_close'),
    pick_start: () => act('pick_start'),
    pick_done: () => act('pick_done'),
    bots: async () => { const r = await act('bots'); if (r) toast(`Тестовых игроков добавлено: ${r.added}. Они голосуют и ходят сами`); },
    bots_clear: async () => { if (await act('bots_clear')) toast('Тестовые игроки убраны'); },
    balance: async () => { const r = await act('balance'); if (r && r.variants) showVariants(r.variants); },
    unteam: async () => {
      if (await confirmHold({ title: 'Вернуться к записи?', text: 'Команды распадутся, игроки вернутся в общий список. Капитаны останутся на своих местах.', label: 'Вернуться к записи', seconds: 1 })) await act('unteam');
    },
    check: () => act('check', { on: true }),
    check_off: () => act('check', { on: false }),
    draft: () => act('draft', { on: true }),
    draft_off: async () => {
      if (await confirmHold({ title: 'Сбросить драфт?', text: 'Все баны и выбранные герои пропадут, драфт придётся начать заново.', label: 'Сбросить драфт', seconds: 1 })) await act('draft', { on: false });
    },
    draft_go: async () => {
      const d = st.draft;
      if (!d || d.done || !selHero) return;
      const hero = selHero;
      selHero = null;
      await act(d.steps[d.i].t === 'ban' ? 'ban_hero' : 'pick_hero', { hero });
      render();
    },
    lobby_bot: async () => {
      making = true;
      render();
      try { await act('lobby_bot'); } finally { making = false; render(); }
    },
    lobby_manual: () => codeModal(),
    lobby_close: () => act('lobby_close'),
    start: () => act('start'),
    live: () => act('live'),
    win_a: () => act('result', { winner: 'a' }),
    win_b: () => act('result', { winner: 'b' }),
    next: () => act('next'),
    close: async () => {
      if (await confirmHold({ title: 'Закрыть лобби?', text: 'Запись закроется, игроки разойдутся. Сыгранные игры останутся в истории.', label: 'Закрыть лобби', seconds: 1.5 })) await act('close');
    },
    staff_add: () => staffModal(),
    new_lobby: async () => {
      try { await call('/events', {}); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { oops(e); }
    },
    settings: () => settingsModal(),
    guest: () => guestModal(),
    copy_link: () => copy(BASE + '/#/' + st.host.login, 'Ссылка скопирована: кидай в чат'),
    copy_obs: () => copy(BASE + '/#/obs/' + st.host.login, 'Ссылка для источника «Браузер» в OBS скопирована'),
    connect: () => {
      if (!pv || !pv.code) { toast('Код лобби ещё не пришёл. Секунду', true); getPrivate(); return; }
      copy(pv.code, 'Код лобби скопирован');
      connectModal();
    },
  };

  function onClick(e) {
    const gm = e.target.closest('[data-game]');
    if (gm) { const m = ((hostInfo && hostInfo.matches) || [])[+gm.dataset.game]; if (m) openGame(m); return; }
    const a = e.target.closest('[data-act]');
    if (a) {
      e.preventDefault();
      if (a.closest('.stbtns') && Date.now() - stageAt < 600) return;
      if (!a.disabled && ACTS[a.dataset.act]) ACTS[a.dataset.act]();
      return;
    }
    const tk = e.target.closest('[data-take]');
    if (tk) {                                                   // занять героя своей команды; по своему ещё раз — освободить
      e.preventDefault();
      const hero = +tk.dataset.take;
      act('take_hero', { hero: st.draft && st.draft.take[meId()] === hero ? null : hero });
      return;
    }
    const un = e.target.closest('[data-unstaff]');
    if (un) { e.preventDefault(); act('staff', { uid: un.dataset.unstaff, role: null }); return; }
    const v = e.target.closest('[data-vote]');
    const pk = e.target.closest('[data-pick]');
    if (v || pk) {
      e.preventDefault();
      if (Date.now() - listAt < 500) return;
      listAt = Date.now();
      if (v) act('vote', { uid: st.votes[meId()] === v.dataset.vote ? null : v.dataset.vote });
      else act('pick', { uid: pk.dataset.pick });
      return;
    }
    const h = e.target.closest('[data-hero]');
    if (h && !h.classList.contains('off') && !h.classList.contains('idle')) { selHero = +h.dataset.hero === selHero ? null : +h.dataset.hero; render(); return; }
    const s = e.target.closest('[data-uid]');
    if (s && !opt.obs) playerModal(s.dataset.uid);
  }
  let listAt = 0;           // когда в последний раз нажимали «Взять» или «Голос»
  let dragUid = null;
  function onDrag(e) {
    const s = e.target.closest && e.target.closest('.slot[draggable]');
    if (e.type === 'dragstart') { if (s) { dragUid = s.dataset.uid; s.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; } return; }
    if (e.type === 'dragend') { dragUid = null; root.querySelectorAll('.drag,.over').forEach((x) => x.classList.remove('drag', 'over')); return; }
    if (!dragUid || !s || s.dataset.uid === dragUid) return;
    e.preventDefault();
    if (e.type === 'dragover') { root.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); s.classList.add('over'); }
    if (e.type === 'drop') { const u1 = dragUid; dragUid = null; act('swap', { u1, u2: s.dataset.uid }); }
  }
  root.addEventListener('click', onClick);
  for (const ev of ['dragstart', 'dragend', 'dragover', 'drop']) root.addEventListener(ev, onDrag);
  const offUser = onUser(() => { pv = null; lastHtml = ''; if (st) { getPrivate(); render(); } });

  root.innerHTML = '<div class="card empty">Загружаю лобби…</div>';
  if (!opt.obs) document.body.classList.add('lobbypage');     // страница лобби шире остальных: справа колонка администрации
  connect();

  return function unmount() {
    dead = true;
    clearInterval(ticker);
    clearTimeout(pvTimer);
    if (es) es.close();
    offUser();
    document.title = pageTitle;
    document.body.classList.remove('lobbypage');
    root.removeEventListener('click', onClick);
    for (const ev of ['dragstart', 'dragend', 'dragover', 'drop']) root.removeEventListener(ev, onDrag);
    closeModal();
  };
}
