// Страница лобби. Правило одно: один шаг — одна главная кнопка.
// Сверху «сцена»: что сейчас происходит и что нажать именно мне (игроку, капитану или ведущему).
// Под ней комната: места капитанов, список игроков, команды, драфт героев.
import { API, BASE, call, meta } from './api.js?v=20261116022036';
import {
  $, esc, ava, badgeImg, badgeName, heroImg, heroName, fmt, plural, clock, toast, oops, modal, head, closeModal,
  confirmHold, copy, rankPicker, pickedRank, ICON, morph,
} from './ui.js?v=20261116022036';
import { user, login, linkSteam, onUser } from './auth.js?v=20261116022036';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
const TEAM_GEN = { a: 'Янтаря', b: 'Сапфира' };
const NO_CAPS = { a: null, b: null };

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
  let showCode = false;
  let selHero = null;
  let lastHtml = '';
  let busy = false;
  let making = false;       // бот создаёт лобби в игре: это несколько секунд
  let pvTimer = 0;
  let pvAt = 0;
  const pageTitle = document.title;

  const meId = () => (user.me ? user.me.id : null);
  const isHost = () => !!(pv && pv.host);
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
    st = next;
    skew = next.now - Date.now() / 1000;
    if (!hostInfo && next.host.login) {
      hostInfo = {};
      call('/h/' + next.host.login).then((h) => { hostInfo = h; render(); }).catch(() => {});
    }
    const uid = meId();
    if (!prev || !pv || isHost() || whereOf(prev, uid) !== whereOf(next, uid) || !!prev.lobby !== !!next.lobby
        || (prev.lobby && next.lobby && prev.lobby.at !== next.lobby.at)) getPrivate();
    if (!next.draft || next.draft.done) selHero = null;
    if (next.phase !== 'lobby') showCode = false;
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

  function stepsHtml() {
    const s = st.settings;
    const d = st.draft;
    const ph = st.phase;
    const list = [['gather', 'Запись'], ['teams', 'Команды']];
    if (s.draft !== 'none') list.push(['draft', 'Драфт героев']);
    list.push(['game', 'Игра']);
    const cur = ph === 'gather' ? 'gather' : ph === 'pick' ? 'teams' : ph === 'teams' ? (d ? 'draft' : 'teams') : 'game';
    const idx = ph === 'closed' ? list.length : list.findIndex((x) => x[0] === cur);
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
    const viol = ((r && r.violations) || []).map((v) => `<div>${nm(v.uid)} сыграл на ${esc(heroName(v.hero))}: ${v.why === 'banned' ? 'герой был забанен' : 'по драфту должен был взять ' + esc(heroName(v.want))}</div>`).join('');
    return viol ? `<div class="viol">${viol}</div>` : '';
  }

  function codeBox() {
    const code = pv && pv.code;
    if (!code) return '<div class="codebox"><span class="code hid">•••••</span><span class="dim">Получаю код…</span></div>';
    return `<div class="codebox"><span class="code ${showCode ? '' : 'hid'}">${showCode ? esc(code) : '•••••'}</span>
      ${btn('show_code', showCode ? 'Скрыть код' : 'Показать код', '')}${btn('copy_code', 'Скопировать код', 'primary')}</div>`;
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
    // зритель, который ещё не записан: главная кнопка — записаться (или то, что этому мешает)
    const offerJoin = (text) => {
      if (blocked) { g.text = blocked.text; g.btns = blocked.btns; return; }
      const free = !caps() && st.seats.length < cap() && !st.queue.length && ['gather', 'teams', 'lobby'].includes(ph);
      g.text = text;
      g.btns = [P('join', caps() ? 'Записаться' : free ? 'Занять место' : 'Встать в очередь')];
      g.uses = ['join'];
    };

    if (ph === 'closed') {
      g.title = 'Лобби закрыто';
      g.text = host ? 'Игры закончены. Новое лобби создаётся одной кнопкой.' : 'Ведущий закончил игры на сегодня.';
      g.btns = [host ? P('new_lobby', 'Создать новое лобби') : '<a class="btn xl" href="#/">На главную</a>'];
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
      g.title = 'Матч идёт';
      if (host) {
        g.text = st.match && st.match.id ? 'Итог придёт из игры сам. Не пришёл — отметь победителя.' : 'Когда игра закончится, отметь победителя.';
        g.btns = [btn('win_a', 'Победил Янтарь', 'xl amber'), btn('win_b', 'Победил Сапфир', 'xl sapph')];
      } else g.text = w === 'seat' ? 'Удачи! Итог появится здесь сам.' : 'Итог появится здесь, когда игра закончится.';
      return g;
    }

    if (ph === 'lobby') {
      const lb = st.lobby;
      const bot = lb.mode === 'bot';
      if (host || w === 'seat') {
        g.title = 'Лобби в игре создано. Заходите';
        g.text = `Открой Deadlock, зайди в кастомные матчи и введи код.${k ? ` Твоя команда — «${TEAM[k]}».` : ''}`;
        g.below = codeBox();
        g.now = !host;
        if (host && bot) {
          g.text += ` Бот сидит в лобби наблюдателем и уйдёт через <span class="timer mono" data-until="${lb.leaves}"></span>.${lb.inside.length ? ` Зашли ${lb.inside.length} из ${st.seats.length}.` : ''}`;
          g.btns = [P('start', lb.start_sent ? 'Старт отправлен' : 'Запустить матч', lb.start_sent ? ' disabled' : ''), S('live', 'Матч уже идёт')];
        } else if (host) {
          g.text += ' Когда запустишь матч в игре, нажми «Матч начался».';
          g.btns = [P('live', 'Матч начался')];
        }
        if (host) g.quiet = [Q('lobby_close', 'Отменить лобби')];
      } else {
        g.title = 'Игроки заходят в игру';
        g.text = 'Код лобби видят только игроки команд.';
      }
      return g;
    }

    if (ph === 'teams') {
      const d = st.draft;
      if (d && !d.done) {
        const step = d.steps[d.i];
        const actor = step.t === 'ban' ? st.teams[step.team][0] : step.uid;
        g.tone = step.team;
        if (actor && actor === uid) {
          g.now = true;
          g.title = step.t === 'ban' ? 'Твой ход: забань героя' : 'Твой ход: выбери героя';
          g.text = `Нажми на героя в сетке ниже, потом на кнопку «${step.t === 'ban' ? 'Забанить' : 'Взять'}». Не успеешь — ${step.t === 'ban' ? 'бан пропадёт' : 'сайт выберет героя за тебя'}.`;
        } else {
          g.title = 'Драфт героев';
          g.text = `${step.t === 'ban' ? 'Банит' : 'Выбирает героя'} ${actor ? nm(actor) : 'ведущий'}, команда «${TEAM[step.team]}».${host ? ' Можешь сходить за любого игрока: выбери героя в сетке.' : ''}`;
        }
        if (host) g.quiet = [Q('draft_off', 'Сбросить драфт')];
        return g;
      }
      const needDraft = s.draft !== 'none' && !d;
      if (host) {
        const chk = st.check;
        if (st.dirty && !caps()) {
          g.title = 'Состав изменился';
          g.text = 'Кто-то вышел или сел после деления. Подели команды заново или перетащи игрока на место другого.';
          g.btns = [P('balance', 'Поделить заново')];
        } else if (needDraft) {
          g.title = 'Команды собраны';
          g.text = `Дальше драфт героев: по ${s.bans} ${plural(s.bans, 'бану', 'бана', 'банов')} с каждой стороны${s.draft === 'full' ? ', потом игроки по одному берут героев' : ''}.`;
          g.btns = [P('draft', 'Начать драфт')];
        } else {
          g.title = d ? 'Драфт окончен' : 'Команды собраны';
          g.text = 'Создай лобби в игре: бот откроет кастомную игру в Deadlock и выдаст код. Его увидят только игроки команд.';
          g.btns = [making ? P('lobby_bot', '<span class="spin"></span><span>Создаю лобби…</span>', ' disabled') : P('lobby_bot', 'Создать лобби в игре'),
            S('lobby_manual', 'Ввести код вручную')];
        }
        g.quiet = caps() ? [Q('unteam', 'Вернуться к записи')]
          : [st.dirty ? '' : Q('balance', 'Поделить заново'), Q('unteam', 'Вернуться к набору'),
            chk ? btn('check_off', `Отменить проверку готовности · <span class="timer mono" data-until="${chk.until}"></span>`, 'ghost') : Q('check', 'Проверить готовность')];
        return g;
      }
      if (w === 'seat') {
        g.title = `Ты в команде «${TEAM[k] || '…'}»`;
        g.tone = k || '';
        g.text = needDraft ? 'Ждём, когда ведущий начнёт драфт героев.' : 'Ждём код лобби от ведущего.';
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
      g.title = 'Запись на игру открыта';
      if (blocked) { g.title = blocked.title; g.text = blocked.text; g.btns = blocked.btns; return g; }
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
    const buttons = b.filter((x) => !used.includes(x[0])).map(([a, t, cl]) => btn(a, t, 'sm ' + (cl || ''))).join('');
    return `<div class="merow"><span class="lbl">Ты</span>${ava(me, 's')}<b>${esc(me.name)}</b>
      <span class="rk">${badge ? esc(badgeName(badge)) : 'без ранга'}</span><span class="state ${cls}">${state}</span><span class="sp"></span>${buttons}</div>`;
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
    return `<div class="tools"><span class="lbl">Управление лобби</span>${b.filter((x) => !used.includes(x[0])).map(([a, t]) => btn(a, t, 'ghost sm')).join('')}
      <span class="sp"></span>${btn('close', 'Закрыть лобби', 'ghost sm danger')}</div>`;
  }

  let shown = null;         // что сейчас на сцене: нужно заголовку вкладки
  let stageAt = 0;          // когда на сцене сменился шаг
  function stageHtml() {
    const g = stage();
    if (!shown || shown.title !== g.title) stageAt = Date.now();
    shown = g;
    const btns = g.btns.join('') + g.quiet.join('');
    return `<section class="stage ${g.tone} ${g.now ? 'now' : ''}">${stepsHtml()}
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
    if (uid === st.host.uid && !o.team) tags.push('<span class="tag">ведущий</span>');
    if (c.bot) tags.push('<span class="tag">тест</span>');
    else if (c.guest) tags.push('<span class="tag">гость</span>');
    if (!opt.obs) {
      const fl = c.flags || [];
      if (isHost() && fl.includes('few')) tags.push('<span class="tag">мало матчей</span>');
      if (isHost() && st.pinned.includes(uid)) tags.push('<span class="tag">закреплён</span>');
    }
    const d = st.draft;
    const pick = d && d.picks[uid];
    const turn = d && !d.done && d.steps[d.i].uid === uid;
    let dot = '';
    if (o.pool) dot = `<span class="dot ${isReady(uid) ? 'ok' : ''}" title="${isReady(uid) ? 'готов' : 'не готов'}"></span>`;
    else if (st.check && !c.guest) dot = `<span class="dot ${st.check.ready.includes(uid) ? 'ok' : ''}" title="${st.check.ready.includes(uid) ? 'готов' : 'ещё не подтвердил'}"></span>`;
    else if (st.lobby && st.lobby.mode === 'bot' && st.phase === 'lobby' && st.lobby.inside.length) {
      dot = `<span class="dot ${st.lobby.inside.includes(uid) ? 'ok' : ''}" title="${st.lobby.inside.includes(uid) ? 'в лобби' : 'ещё не в лобби'}"></span>`;
    }
    const right = pick ? heroImg(pick, 'pick') : `<span class="mains">${(c.mains || []).map((h) => heroImg(h)).join('')}</span>`;
    const drag = isHost() && st.teams && (st.phase === 'teams' || st.phase === 'lobby') && o.team ? ' draggable="true"' : '';
    return `<button class="slot ${uid === meId() ? 'me-row' : ''} ${turn ? 'turn' : ''} ${o.cap ? 'capn' : ''} ${o.pool && !isReady(uid) ? 'idle' : ''}" data-uid="${esc(uid)}"${drag}>
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
    return `<section class="card plist people"><header><h2>Игроки</h2><span class="dim num">записались ${st.queue.length} · готовы ${nReady} · нужно ${cap()}</span></header>
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

  function roomHtml() {
    const ph = st.phase;
    if (!st.teams) return caps() ? (ph === 'closed' ? '' : capsBlock() + playersBlock()) : seatsBlock();
    const d = st.draft;
    if (ph === 'teams' && d && !d.done) return draftHtml();
    const bar = st.sums && !opt.obs && !caps() ? `<div class="sumbar"><span>Баланс команд: <b>${esc(st.sums.words)}</b></span>
      ${st.dirty ? '<span class="chip warn">состав изменился</span>' : `<span class="num">разница в силе ${fmt(st.sums.diff)}</span>`}</div>` : '';
    const mid = caps() && (ph === 'pick' || (st.queue.length && ['teams', 'lobby'].includes(ph)));
    const tail = !caps() && st.queue.length ? `<section class="card plist"><header><h2>Очередь</h2><span class="dim num">${st.queue.length}</span></header>
      <div class="pgrid">${st.queue.map((u, i) => slot(u, { pos: i + 1 })).join('')}</div></section>` : '';
    return `${bar}<div class="arena ${mid ? 'three' : 'two'}">${teamCol('a')}${mid ? poolCol() : ''}${teamCol('b')}</div>${bansRow()}${tail}`;
  }

  // Экран драфта: лента ходов, две команды со слотами пиков и банов, таймер по центру, сетка героев.
  function draftHtml() {
    const d = st.draft;
    if (!d) return '';
    const t = st.teams;
    const step = d.done ? null : d.steps[d.i];
    const banned = new Set(d.bans.filter(Boolean));
    const taker = {};
    for (const [u, h] of Object.entries(d.picks)) taker[h] = u;
    const capUid = step ? t[step.team][0] : null;
    const actor = step ? (step.t === 'ban' ? capUid : step.uid) : null;
    const can = !!step && !opt.obs && (isHost() || meId() === capUid || (step.t === 'pick' && meId() === step.uid));
    const mains = step && step.t === 'pick' ? (card(step.uid).mains || []) : [];
    const tname = (k) => (t[k].length ? 'Команда ' + nm(t[k][0]) : TEAM[k]);
    const strip = d.steps.map((x, i) => `<i class="${x.team} ${d.done || i < d.i ? 'done' : i === d.i ? 'cur' : ''}">${x.t === 'ban' ? 'бан' : 'пик'}</i>`).join('');
    const picks = (k) => t[k].map((u) => {
      const h = d.picks[u];
      const hero = h && meta.byId.get(h);
      const cur = step && step.t === 'pick' && step.uid === u;
      return `<div class="dslot ${cur ? 'cur' : ''}">${hero && (hero.card || hero.icon) ? `<img src="${esc(hero.card || hero.icon)}" alt="${esc(hero.name)}">` : `<span>${h ? esc(heroName(h)) : '?'}</span>`}
        <b>${nm(u)}</b></div>`;
    }).join('');
    const bans = (k) => d.steps.map((x, i) => ({ x, i })).filter((o) => o.x.t === 'ban' && o.x.team === k).map((o) => {
      if (o.i >= d.bans.length) return `<div class="dban ${!d.done && o.i === d.i ? 'cur' : ''}"></div>`;
      const h = d.bans[o.i];
      return h ? `<div class="dban full" title="${esc(heroName(h))}">${heroImg(h)}</div>` : '<div class="dban" title="бан пропущен">—</div>';
    }).join('');
    const mid = step
      ? `<div class="dkind ${step.team}">${step.t === 'ban' ? 'Бан' : 'Выбор героя'}</div><div class="dclock mono" data-until="${d.until}"></div>
         <div class="dwho">${actor ? nm(actor) : ''}${can && meId() === actor ? ' — твой ход' : ''}</div>`
      : '<div class="dkind">Драфт окончен</div><div class="dwho">Берите в игре своих героев</div>';
    let go = '';
    if (step && can) {
      go = selHero && !banned.has(selHero)
        ? btn('draft_go', `${step.t === 'ban' ? 'Забанить' : 'Взять'}: ${esc(heroName(selHero))}`, 'primary xl')
        : `<span class="dim">Выбери героя ниже${isHost() && meId() !== actor && actor ? ': ты ходишь за ' + nm(actor) : ''}</span>`;
    } else if (step) go = '<span class="dim">Ждём хода</span>';
    const tiles = d.done ? '' : meta.heroes.map((h) => {
      const ban = banned.has(h.id);
      const who = taker[h.id];
      const off = ban || (!st.settings.dup && who);
      const cls = [off ? 'off' : '', selHero === h.id ? 'sel' : '', mains.includes(h.id) ? 'main' : '', can ? '' : 'idle'].join(' ');
      const mark = ban ? '<em class="x">бан</em>' : who ? `<em class="${teamOf(who) || ''}">взят</em>` : '';
      return `<button class="hcard ${cls}" data-hero="${h.id}" ${can && !off ? '' : 'tabindex="-1"'}>
        ${h.card || h.icon ? `<img src="${esc(h.card || h.icon)}" alt="" loading="lazy">` : ''}<span>${esc(h.name)}</span>${mark}</button>`;
    }).join('');
    return `<section class="card draft2">${d.done ? '' : `<div class="dstrip">${strip}</div>`}
      <div class="dhead"><b class="a">${tname('a')}</b><span>VS</span><b class="b">${tname('b')}</b></div>
      <div class="dboard"><div class="dside a"><div class="dpicks" style="--n:${Math.max(t.a.length, 1)}">${picks('a')}</div><div class="dbans">${bans('a')}</div></div>
        <div class="dmid">${mid}</div>
        <div class="dside b"><div class="dpicks" style="--n:${Math.max(t.b.length, 1)}">${picks('b')}</div><div class="dbans">${bans('b')}</div></div></div>
      ${d.done ? '' : `<div class="dgo">${go}</div><div class="hgrid2">${tiles}</div>`}</section>`;
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
      html = `${headHtml()}${st.note ? `<div class="note">${esc(st.note)}</div>` : ''}${stageHtml()}${roomHtml()}${hostInfoHtml()}`;
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
        <label class="field"><span>Режим игры</span>${sel('mode', meta.modes, s.mode)}</label>
        <label class="field"><span>Регион сервера</span>${sel('region', meta.regions, s.region)}</label>
      </div>
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
      const settings = { size: +g('size'), mode: g('mode'), region: g('region'), draft: g('draft'), teams: g('teams'), order: g('order'), bans: +g('bans'), pick_seconds: +g('pick_seconds'),
        rotation: f.has('rotation'), dup: f.has('dup'), lanes: f.has('lanes'), cheats: f.has('cheats') };
      if (!await act('settings', { settings })) return;
      const title = String(g('title')).trim();
      if (title && title !== st.title) await act('title', { title });
      if (String(g('note')).trim() !== (st.note || '')) await act('note', { note: String(g('note')) });
      m.close();
      toast('Настройки сохранены');
    });
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
    new_lobby: async () => {
      try { await call('/events', {}); window.dispatchEvent(new HashChangeEvent('hashchange')); } catch (e) { oops(e); }
    },
    settings: () => settingsModal(),
    guest: () => guestModal(),
    copy_link: () => copy(BASE + '/#/' + st.host.login, 'Ссылка скопирована: кидай в чат'),
    copy_obs: () => copy(BASE + '/#/obs/' + st.host.login, 'Ссылка для источника «Браузер» в OBS скопирована'),
    show_code: () => { showCode = !showCode; render(); },
    copy_code: () => { if (pv && pv.code) copy(pv.code, 'Код скопирован'); },
  };

  function onClick(e) {
    const a = e.target.closest('[data-act]');
    if (a) {
      e.preventDefault();
      if (a.closest('.stbtns') && Date.now() - stageAt < 600) return;
      if (!a.disabled && ACTS[a.dataset.act]) ACTS[a.dataset.act]();
      return;
    }
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
  connect();

  return function unmount() {
    dead = true;
    clearInterval(ticker);
    clearTimeout(pvTimer);
    if (es) es.close();
    offUser();
    document.title = pageTitle;
    root.removeEventListener('click', onClick);
    for (const ev of ['dragstart', 'dragend', 'dragover', 'drop']) root.removeEventListener(ev, onDrag);
    closeModal();
  };
}
