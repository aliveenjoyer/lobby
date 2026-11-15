// Страница кастомки: состав, очередь, команды, драфт, лобби, итог — и пульт стримера.
import { API, BASE, call, meta } from './api.js?v=20261115234546';
import {
  $, esc, ava, badgeImg, badgeName, heroImg, heroName, fmt, plural, clock, toast, oops, modal, head, closeModal,
  confirmHold, copy, rankPicker, pickedRank, ICON,
} from './ui.js?v=20261115234546';
import { user, login, linkSteam, onUser } from './auth.js?v=20261115234546';

const TEAM = { a: 'Янтарь', b: 'Сапфир' };
const TEAM_GEN = { a: 'Янтаря', b: 'Сапфира' };
const STEPS = [['gather', 'Набор'], ['teams', 'Команды'], ['draft', 'Драфт'], ['lobby', 'Лобби'], ['live', 'Игра'], ['done', 'Итог']];
const FLAG = { manual: 'ранг со слов', norank: 'без ранга', few: 'мало матчей', nosteam: 'без Steam' };

export function mountEvent(root, id, opt) {
  opt = opt || {};
  let st = null;            // состояние, как его видят все
  let pv = null;            // то, что видно только мне: код лобби, пульт стримера
  let hostInfo = null;      // ссылки и правила стримера
  let es = null;
  let dead = false;
  let skew = 0;             // часы сервера минус часы браузера, секунды
  let showCode = false;
  let selHero = null;
  let lastHtml = '';
  let busy = false;
  let pvTimer = 0;
  let pvAt = 0;
  const typed = {};         // что человек набрал в полях на странице — чтобы не терялось при обновлении

  const meId = () => (user.me ? user.me.id : null);
  const isHost = () => !!(pv && pv.host);
  const cards = () => (pv && pv.full) || st.cards;
  const card = (uid) => cards()[uid] || { uid, name: '?', badge: 0, pts: null, mains: [], flags: [] };
  const whereOf = (s, uid) => (!s || !uid ? null : s.seats.includes(uid) ? 'seat' : s.queue.includes(uid) ? 'queue' : null);
  const teamOf = (uid) => (!st.teams ? null : st.teams.a.includes(uid) ? 'a' : st.teams.b.includes(uid) ? 'b' : null);
  const cap = () => st.settings.size * 2;
  const now = () => Date.now() / 1000 + skew;

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
      if (e.code === 'auth') login(); else if (!quiet) oops(e);
      return null;
    } finally { busy = false; }
  }

  // ------------------------------------------------------------ куски страницы
  const gone = () => `<div class="card empty"><h3>Такой кастомки нет</h3><p class="dim" style="margin-top:6px">Возможно, ссылка устарела.</p>
    <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/">На главную</a></div></div>`;

  function headHtml() {
    const s = st.settings;
    const chips = [`${s.size} на ${s.size}`];
    if (s.mode !== 'normal') chips.push(meta.modes[s.mode] || s.mode);
    chips.push(meta.regions[s.region] || s.region);
    if (s.draft !== 'none') chips.push(meta.drafts[s.draft]);
    if (st.round > 1) chips.push('игра ' + st.round);
    const live = st.host.live ? `<a class="chip live" href="https://twitch.tv/${esc(st.host.login)}" target="_blank" rel="noopener">LIVE</a>` : '';
    return `<div class="ehead">${ava(st.host, 'l')}
      <div class="t"><h1>${esc(st.title)}</h1>
      <div class="chips">${live}${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}
      <a class="chip" href="#/${esc(st.host.login)}">страница ${esc(st.host.name)}</a></div></div></div>`;
  }

  function stepsHtml() {
    const drafting = st.phase === 'teams' && st.draft && !st.draft.done;
    const cur = st.phase === 'closed' ? 'closed' : drafting ? 'draft' : st.phase;
    const list = STEPS.filter((x) => x[0] !== 'draft' || st.settings.draft !== 'none');
    const idx = list.findIndex((x) => x[0] === cur);
    return `<ol class="steps">${list.map((x, i) => `<li class="${i === idx ? 'on' : i < idx || cur === 'closed' ? 'done' : ''}">${x[1]}</li>`).join('')}</ol>`;
  }

  function slot(uid, o) {
    o = o || {};
    const c = card(uid);
    const tags = [];
    if (c.live) tags.push('<span class="tag live">LIVE</span>');
    if (o.cap) tags.push('<span class="tag cap">капитан</span>');
    if (c.guest) tags.push('<span class="tag">гость</span>');
    if (!opt.obs) {
      for (const f of c.flags || []) if (FLAG[f] && (f !== 'nosteam' || !c.flags.includes('manual'))) tags.push(`<span class="tag">${FLAG[f]}</span>`);
      if (isHost() && st.pinned.includes(uid)) tags.push('<span class="tag">закреплён</span>');
    }
    const d = st.draft;
    const pick = d && d.picks[uid];
    const turn = d && !d.done && d.steps[d.i].uid === uid;
    let dot = '';
    if (st.check && !c.guest) dot = `<span class="dot ${st.check.ready.includes(uid) ? 'ok' : ''}" title="${st.check.ready.includes(uid) ? 'готов' : 'ещё не подтвердил'}"></span>`;
    else if (st.lobby && st.lobby.mode === 'bot' && st.phase === 'lobby' && st.lobby.inside.length) {
      dot = `<span class="dot ${st.lobby.inside.includes(uid) ? 'ok' : ''}" title="${st.lobby.inside.includes(uid) ? 'в лобби' : 'ещё не в лобби'}"></span>`;
    }
    const sub = c.badge ? `${esc(badgeName(c.badge))}${c.pts != null && !opt.obs ? ' · <span class="num">' + fmt(c.pts) + '</span>' : ''}` : 'ранг неизвестен';
    const right = pick ? heroImg(pick, 'pick') : `<span class="mains">${(c.mains || []).map((h) => heroImg(h)).join('')}</span>`;
    const drag = isHost() && st.teams && (st.phase === 'teams' || st.phase === 'lobby') && o.team ? ' draggable="true"' : '';
    return `<button class="slot ${uid === meId() ? 'me-row' : ''} ${turn ? 'turn' : ''}" data-uid="${esc(uid)}"${drag}>
      ${o.pos ? `<span class="pos">${o.pos}</span>` : ''}${ava(c)}
      <span class="who"><span class="nm"><b>${esc(c.name)}</b>${tags.join('')}</span><span class="sub">${sub}</span></span>
      ${right}${dot}${badgeImg(c.badge)}</button>`;
  }

  function rosterHtml() {
    const size = st.settings.size;
    if (!st.teams) {
      const rows = st.seats.map((u) => slot(u));
      for (let i = st.seats.length; i < cap(); i++) rows.push('<div class="slot free">Свободно</div>');
      return `<section class="card"><header><h2>Состав</h2><span class="dim num">${st.seats.length} из ${cap()}</span></header>
        <div class="body" style="padding:10px 0 0"><div class="slots pool" style="border-top:1px solid var(--line)">${rows.join('')}</div></div></section>`;
    }
    const res = st.match && st.match.result;
    const col = (k) => {
      const list = st.teams[k];
      const rows = list.map((u, i) => slot(u, { cap: i === 0 && list.length > 1, team: k }));
      for (let i = list.length; i < size; i++) rows.push('<div class="slot free">Свободно</div>');
      return `<section class="card team ${k} ${res && res.winner === k ? 'win' : ''}" data-team="${k}">
        <header><div class="row" style="justify-content:space-between"><span class="tn">${TEAM[k]}${res && res.winner === k ? ' · победа' : ''}</span>
        <span class="ts num">${st.sums && !opt.obs ? 'сила ' + fmt(st.sums[k]) : ''}</span></div></header>
        <div class="slots">${rows.join('')}</div></section>`;
    };
    const bar = st.sums && !opt.obs ? `<div class="sumbar"><span>Баланс: <b>${esc(st.sums.words)}</b></span>
      ${st.dirty ? '<span class="chip warn">состав изменился</span>' : `<span class="num">разница ${fmt(st.sums.diff)}</span>`}</div>` : '';
    return `<div>${bar}<div class="teams">${col('a')}${col('b')}</div></div>`;
  }

  function draftHtml() {
    const d = st.draft;
    if (!d) return '';
    const step = d.done ? null : d.steps[d.i];
    const banned = new Set(d.bans.filter(Boolean));
    const picked = new Set(Object.values(d.picks));
    let turn = '<div class="dturn">Драфт окончен. Берите в игре своих героев.</div>';
    let can = false;
    let mains = [];
    if (step) {
      const capUid = st.teams[step.team][0];
      const who = step.t === 'ban' ? card(capUid) : card(step.uid);
      can = isHost() || meId() === capUid || (step.t === 'pick' && meId() === step.uid);
      mains = step.t === 'pick' ? (card(step.uid).mains || []) : [];
      turn = `<div class="dturn ${step.team}">${step.t === 'ban' ? 'Бан' : 'Выбор героя'}: ${TEAM[step.team]} · ходит ${esc(who.name)}${can ? ' — твой ход' : ''}</div>`;
    }
    const banRow = (k) => {
      const items = d.steps.map((x, i) => ({ x, i })).filter((o) => o.x.t === 'ban' && o.x.team === k);
      return `<span class="set">Баны ${TEAM_GEN[k]}: ${items.map((o) => {
        if (o.i >= d.bans.length) return '<span class="skip">·</span>';
        return d.bans[o.i] ? heroImg(d.bans[o.i], 'm') : '<span class="skip" title="пропущен">—</span>';
      }).join('')}</span>`;
    };
    const tiles = meta.heroes.map((h) => {
      const off = banned.has(h.id) || (!st.settings.dup && picked.has(h.id));
      const cls = [off ? 'off' : '', banned.has(h.id) ? 'ban' : '', selHero === h.id ? 'sel' : '', mains.includes(h.id) ? 'main' : '', can ? '' : 'idle'].join(' ');
      return `<button class="htile ${cls}" data-hero="${h.id}" ${can && !off ? '' : 'tabindex="-1"'}>
        <img src="${esc(h.icon)}" alt="" loading="lazy"><span>${esc(h.name)}</span></button>`;
    }).join('');
    const go = step && can && selHero && !banned.has(selHero)
      ? `<div class="row" style="margin-top:12px"><button class="btn primary" data-act="draft_go">${step.t === 'ban' ? 'Забанить' : 'Взять'}: ${esc(heroName(selHero))}</button></div>` : '';
    return `<section class="card draft"><header><div><h2>Драфт</h2><div style="margin-top:6px">${turn}</div></div>
      ${step ? `<span class="timer mono" data-until="${d.until}"></span>` : ''}</header>
      <div class="body"><div class="bans">${banRow('a')}${banRow('b')}</div>${go}
      ${d.done ? '' : `<div class="hgrid">${tiles}</div>`}</div></section>`;
  }

  function codeBox() {
    const code = pv && pv.code;
    if (!code) return '';
    return `<div class="codebox"><span class="code ${showCode ? '' : 'hid'}">${showCode ? esc(code) : '•••••'}</span>
      <button class="btn sm" data-act="show_code">${showCode ? 'Скрыть' : 'Показать'}</button>
      <button class="btn sm primary" data-act="copy_code">Скопировать</button></div>`;
  }

  function resultLine() {
    const r = st.match && st.match.result;
    if (!r) return '';
    const src = r.source === 'game' ? 'итог пришёл из игры' : 'итог отметил стример';
    const dur = r.duration ? ` · ${Math.round(r.duration / 60)} мин` : '';
    const viol = (r.violations || []).map((v) => `<div>${esc(card(v.uid).name)} сыграл на ${esc(heroName(v.hero))}: ${v.why === 'banned' ? 'герой был забанен' : 'по драфту должен был взять ' + esc(heroName(v.want))}</div>`).join('');
    const link = st.match.id ? ` · <a class="link" href="https://statlocker.gg/match/${st.match.id}" target="_blank" rel="noopener">матч на Statlocker</a>` : '';
    return `<p>${src}${dur}${link}</p>${viol ? `<div class="viol">${viol}</div>` : ''}`;
  }

  function playerAction() {
    const me = user.me;
    const w = whereOf(st, meId());
    const s = st.settings;
    const ph = st.phase;
    if (!me) {
      return ['Хочешь сыграть?', 'Войди через Twitch и займи слот. Сайт сам соберёт равные команды.',
        `<button class="btn primary big" data-act="login">${ICON.twitch}<span>Войти через Twitch</span></button>`];
    }
    const chk = st.check;
    const ready = chk && chk.ready.includes(me.id);
    if (w === 'queue') {
      const pos = st.queue.indexOf(me.id) + 1;
      const b = [];
      if (chk && !ready) b.push('<button class="btn primary big" data-act="ready">Готов заменить</button>');
      b.push('<button class="btn" data-act="leave">Выйти из очереди</button>');
      return [`Ты в очереди: ${pos}-й`, chk ? (ready ? 'Готовность подтверждена. Если кто-то в составе не отзовётся, место твоё.'
        : `Идёт проверка готовности. Подтверди, и займёшь место того, кто не отзовётся. Осталось <span class="timer" data-until="${chk.until}"></span>`)
        : (s.rotation ? 'Очередь играет следующую игру первой. Освободится место раньше — сядешь сразу.' : 'Освободится место — сядешь сразу.'), b.join('')];
    }
    if (w === 'seat') {
      if (chk && !ready) {
        return ['Подтверди готовность', `Не нажмёшь — место уйдёт первому из очереди. Осталось <span class="timer" data-until="${chk.until}"></span>`,
          '<button class="btn primary big" data-act="ready">Я готов</button>'];
      }
      const out = '<button class="btn" data-act="leave">Выйти из состава</button>';
      const k = teamOf(me.id);
      if (ph === 'gather') return ['Ты в составе', chk ? 'Готовность подтверждена. Ждём остальных.' : 'Жди, пока стример поделит команды. Вкладку не закрывай: может быть проверка готовности.', out];
      if (ph === 'teams') {
        const d = st.draft;
        const txt = d && !d.done ? 'Идёт драфт: следи за своей очередью ниже.' : d && d.done ? 'Драфт окончен. Ждём код лобби.' : 'Команды готовы. Ждём код лобби.';
        return [`Ты в команде «${TEAM[k] || '…'}»`, txt, out];
      }
      if (ph === 'lobby') {
        return ['Лобби открыто', `Открой Deadlock, зайди в кастомные матчи и введи код. Займи место в команде «${TEAM[k] || '…'}».`, codeBox() + `<div class="row">${out}</div>`, true];
      }
      if (ph === 'live') return ['Матч идёт', 'Удачи. Итог появится здесь сам.', ''];
      if (ph === 'done') {
        const r = st.match && st.match.result;
        return [r ? `Победил ${TEAM[r.winner]}` : 'Игра окончена', 'Следующую игру стример начнёт сам.' + (s.rotation && st.queue.length ? ' Очередь сядет первой.' : ''), ''];
      }
    }
    if (ph === 'closed') return ['Кастомка закрыта', 'Стример закончил игры на сегодня.', `<a class="btn" href="#/${esc(st.host.login)}">Страница стримера</a>`];
    if (s.need_steam && !me.steam) {
      return ['Привяжи Steam', 'Стример просит Steam: по нему сайт узнаёт твой ранг и героев. Это одна кнопка, пароль сайт не видит.',
        `<button class="btn primary big" data-act="steam">${ICON.steam}<span>Привязать Steam</span></button>`];
    }
    if (!me.steam && !me.manual_badge) {
      return ['Укажи свой ранг', 'Привяжи Steam, чтобы ранг подставился сам, или выбери его в профиле.',
        `<button class="btn primary big" data-act="steam">${ICON.steam}<span>Привязать Steam</span></button><a class="btn" href="#/me">Указать вручную</a>`];
    }
    const free = st.seats.length < cap() && !st.queue.length && ['gather', 'teams', 'lobby'].includes(ph);
    if (free) return ['Есть свободное место', `В составе ${st.seats.length} из ${cap()}.`, '<button class="btn primary big" data-act="join">Занять слот</button>'];
    const n = st.queue.length;
    return [ph === 'live' || ph === 'done' ? 'Идёт игра' : 'Мест нет',
      `В очереди ${n} ${plural(n, 'человек', 'человека', 'человек')}.` + (s.rotation ? ' Очередь играет следующую игру первой.' : ''),
      '<button class="btn primary big" data-act="join">Встать в очередь</button>'];
  }

  function hostAction() {
    const ph = st.phase;
    const n = st.seats.length;
    const w = whereOf(st, meId());
    const self = ['gather', 'teams', 'lobby'].includes(ph)
      ? (w ? '<button class="btn ghost" data-act="leave">Выйти из состава самому</button>' : '<button class="btn ghost" data-act="join">Сесть в состав самому</button>') : '';
    const chk = st.check;
    const chkBtn = chk ? `<button class="btn" data-act="check_off">Отменить проверку · <span class="timer" data-until="${chk.until}"></span></button>`
      : '<button class="btn" data-act="check">Проверка готовности</button>';
    if (ph === 'gather') {
      return [`Набор: ${n} из ${cap()}`, n < 2 ? 'Кинь ссылку на эту страницу в чат. Когда состав соберётся, подели команды.' : 'Когда состав собран, подели команды. Сайт покажет три самых ровных варианта.',
        `<button class="btn primary big" data-act="balance" ${n < 2 ? 'disabled' : ''}>Поделить команды</button>${chkBtn}${self}`];
    }
    if (ph === 'teams') {
      const d = st.draft;
      const again = '<button class="btn" data-act="balance">Поделить заново</button><button class="btn ghost" data-act="unteam">Вернуться к набору</button>';
      if (st.dirty) return ['Состав изменился', 'Кто-то вышел или сел после деления. Подели команды заново или поправь вручную: перетащи игрока на другого.', `<button class="btn primary big" data-act="balance">Поделить заново</button>${chkBtn}${self}`];
      if (st.settings.draft !== 'none' && !d) return ['Команды готовы', 'Дальше драфт: ' + (st.settings.draft === 'bans' ? 'капитаны банят героев по очереди.' : 'баны, затем игроки по очереди берут героев.'), `<button class="btn primary big" data-act="draft">Начать драфт</button>${again}${chkBtn}`];
      if (d && !d.done) return ['Идёт драфт', 'Ты можешь сделать ход за любого игрока: выбери героя ниже.', '<button class="btn" data-act="draft_off">Сбросить драфт</button>'];
      return ['Команды готовы', 'Открой лобби: бот создаст его в игре и выдаст код. Код увидят только игроки в слотах.',
        `<button class="btn primary big" data-act="lobby_bot">Открыть лобби</button><button class="btn" data-act="lobby_manual">Вставить код из игры</button>${again}${chkBtn}`];
    }
    if (ph === 'lobby') {
      const lb = st.lobby;
      const bot = lb.mode === 'bot';
      const inside = bot && lb.inside.length ? ` В лобби ${lb.inside.length} из ${n}.` : '';
      const txt = bot ? `Бот создал лобби и сидит наблюдателем, уйдёт через <span class="timer" data-until="${lb.leaves}"></span>.${inside} Зайди в игру по коду сам.`
        : 'Код разослан игрокам в слотах. Когда запустишь матч в игре, нажми «Матч начался».';
      const b = bot ? `<button class="btn primary big" data-act="start" ${lb.start_sent ? 'disabled' : ''}>${lb.start_sent ? 'Старт отправлен' : 'Старт матча'}</button><button class="btn" data-act="live">Матч начался</button>`
        : '<button class="btn primary big" data-act="live">Матч начался</button>';
      return ['Лобби открыто', txt, codeBox() + `<div class="row">${b}<button class="btn ghost" data-act="lobby_close">Закрыть лобби</button>${self}</div>`, true];
    }
    const wins = '<button class="btn amber" data-act="win_a">Победил Янтарь</button><button class="btn sapph" data-act="win_b">Победил Сапфир</button>';
    if (ph === 'live') return ['Матч идёт', st.match && st.match.id ? 'Итог подтянется сам, когда игра закончится. Не подтянулся — отметь победителя.' : 'Когда игра закончится, отметь победителя.', wins];
    if (ph === 'done') {
      const r = st.match && st.match.result;
      const q = st.queue.length;
      return [r ? `Победил ${TEAM[r.winner]}` : 'Игра окончена', (st.settings.rotation && q ? `В следующей игре первыми сядут ${q} из очереди. ` : '') + 'Ошибся с итогом — нажми другую команду.',
        `<button class="btn primary big" data-act="next">Следующая игра</button>${wins}`];
    }
    return ['Кастомка закрыта', 'Новую можно открыть с главной страницы.', '<a class="btn primary" href="#/">На главную</a>'];
  }

  function actionHtml() {
    const [title, text, buttons, raw] = isHost() ? hostAction() : playerAction();
    return `<section class="card action"><h3>${esc(title)}</h3><p>${text}</p>${raw ? buttons : `<div class="row">${buttons}</div>`}
      ${st.phase === 'done' || (st.phase === 'live' && st.match && st.match.result) ? `<div class="dim" style="margin-top:12px;font-size:14px">${resultLine()}</div>` : ''}</section>`;
  }

  function queueHtml() {
    const rows = st.queue.map((u, i) => slot(u, { pos: i + 1 })).join('');
    return `<section class="card queue"><header><h2>Очередь</h2><span class="dim num">${st.queue.length}</span></header>
      <div class="body" style="padding:10px 0 0">${rows ? `<div class="slots" style="border-top:1px solid var(--line)">${rows}</div>` : '<div class="empty" style="padding:14px 16px 18px">Очередь пуста</div>'}</div></section>`;
  }

  function hostInfoHtml() {
    const h = hostInfo || {};
    const parts = [];
    if (h.schedule) parts.push(`<p>${esc(h.schedule)}</p>`);
    if (h.links && h.links.length) parts.push(`<div class="links">${h.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(l.title)}</a>`).join('')}</div>`);
    if (h.rules) parts.push(`<div><h2 style="margin-bottom:8px">Правила</h2><div class="rules">${esc(h.rules)}</div></div>`);
    if (!parts.length) return '';
    return `<section class="card"><header><h2>${esc(st.host.name)}</h2></header><div class="body" style="display:grid;gap:14px">${parts.join('')}</div></section>`;
  }

  const howHtml = () => `<section class="card"><header><h2>Как это работает</h2></header><div class="body"><ol class="how">
    <li>Войди через Twitch и один раз привяжи Steam: ранг и герои подставятся сами.</li>
    <li>Займи слот. Мест нет — встань в очередь: она играет следующую игру первой.</li>
    <li>Стример делит команды: сайт перебирает все варианты и берёт самые ровные.</li>
    <li>Когда лобби откроется, код увидят только игроки в слотах. Введи его в игре.</li></ol></div></section>`;

  function hostBar() {
    if (!isHost() || st.phase === 'closed') return '';
    return `<div class="hostbar"><div class="wrap"><span class="lbl">Пульт · смотрят ${st.viewers}</span>
      <button class="btn sm" data-act="settings">Настройки</button>
      <button class="btn sm" data-act="guest">Добавить гостя</button>
      <button class="btn sm" data-act="copy_link">Ссылка для чата</button>
      <button class="btn sm" data-act="copy_obs">Слой для OBS</button>
      <span style="flex:1"></span>
      <button class="btn sm danger" data-act="close">Закрыть кастомку</button></div></div>`;
  }

  function obsHtml() {
    const d = st.draft;
    let line = st.title;
    if (d && !d.done) {
      const step = d.steps[d.i];
      line = `${step.t === 'ban' ? 'Бан' : 'Пик'}: ${TEAM[step.team]} · <span class="timer mono" data-until="${d.until}"></span>`;
    } else if (st.match && st.match.result) line = `Победил ${TEAM[st.match.result.winner]}`;
    else line = esc(line);
    const body = st.teams ? rosterHtml() : `<div class="team card"><div class="slots">${st.seats.map((u) => slot(u)).join('') || '<div class="slot free">Набор открыт</div>'}</div></div>`;
    return `<div class="obsbox"><div class="obst"><span>${line}</span><span class="dim num">${st.seats.length} из ${cap()}</span></div>${body}</div>`;
  }

  function render() {
    if (!st || dead) return;
    let html;
    if (opt.obs) html = obsHtml();
    else {
      html = `${headHtml()}${stepsHtml()}${st.note ? `<div class="note">${esc(st.note)}</div>` : ''}
        <div class="egrid"><div class="col">${actionHtml()}${st.draft && !st.draft.done ? draftHtml() + rosterHtml() : rosterHtml() + draftHtml()}</div>
        <div class="col">${queueHtml()}${hostInfoHtml()}${howHtml()}</div></div>${hostBar()}`;
    }
    if (html === lastHtml) return;
    lastHtml = html;
    root.innerHTML = html;
    tick();
  }

  function tick() {
    const t = now();
    for (const el of root.querySelectorAll('[data-until]')) el.textContent = clock(+el.dataset.until - t);
  }
  const ticker = setInterval(tick, 250);

  // ------------------------------------------------------------ окна
  function showVariants(list) {
    let page = 0;
    const draw = () => {
      const part = list.slice(page * 3, page * 3 + 3);
      const m = modal(`${head('Варианты команд')}<div class="body">
        ${part.map((v, i) => {
          const teamCol = (k) => `<div><span class="v${k}">${TEAM[k]} · ${fmt(v['sum_' + k])}</span>${v[k].map((u) => `<div class="vp">${badgeImg(card(u).badge)}<b>${esc(card(u).name)}</b></div>`).join('')}</div>`;
          const per = v.diff / Math.max(v.a.length, 1) / 1000;
          return `<div class="variant"><div class="vh"><span>Вариант ${page * 3 + i + 1} · разница ${fmt(v.diff)} (${per < 0.1 ? 'команды равны' : per.toFixed(1).replace('.', ',') + ' подранга на игрока'})</span>
            <button class="btn sm primary" data-pick="${page * 3 + i}">Выбрать</button></div><div class="vt">${teamCol('a')}${teamCol('b')}</div></div>`;
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
      <div><b>${s.m30 ? s.wr30 + '%' : '—'}</b><span>побед за 30 дней (${s.m30})</span></div></div>
      ${s.heroes.length ? `<div class="hlist">${s.heroes.map((h) => `<div>${heroImg(h.id, 'm')}<span class="n">${esc(heroName(h.id))}</span><span class="dim num">${h.m} ${plural(h.m, 'матч', 'матча', 'матчей')} · ${h.wr}%</span></div>`).join('')}</div>` : ''}`
      : `<p class="dim">${c.guest ? 'Гостя добавил стример, статистики нет.' : 'Steam не привязан: статистики нет.'}</p>`;
    let tools = '';
    if (host && st.phase !== 'closed') {
      const b = [];
      const other = k === 'a' ? 'b' : 'a';
      if (k && ['teams', 'lobby'].includes(st.phase)) {
        b.push(`<label class="field"><span>Поменять местами с игроком другой команды</span><select class="input" id="pm-swap"><option value="">Выбери игрока</option>
          ${st.teams[other].map((u) => `<option value="${esc(u)}">${esc(card(u).name)} · ${esc(badgeName(card(u).badge))}</option>`).join('')}</select></label>`);
        if (st.teams[other].length < st.settings.size) b.push(`<button class="btn" data-h="move">Перенести в команду «${TEAM[other]}»</button>`);
        if (st.teams[k][0] !== uid) b.push('<button class="btn" data-h="captain">Сделать капитаном</button>');
      }
      if (w === 'queue') b.push('<button class="btn" data-h="seat">Посадить в состав вне очереди</button>');
      if (w === 'seat' && !['live', 'done'].includes(st.phase)) {
        b.push(`<button class="btn" data-h="pin">${st.pinned.includes(uid) ? 'Снять закрепление' : 'Закрепить в составе на все игры'}</button>`);
        if (!c.guest) b.push('<button class="btn" data-h="toqueue">Убрать в конец очереди</button>');
        b.push('<button class="btn danger" data-h="kick">Убрать из состава</button>');
      }
      if (w === 'queue') b.push('<button class="btn danger" data-h="kick">Убрать из очереди</button>');
      if (!c.guest && uid !== st.host.uid) {
        b.push(`<label class="field"><span>Поправить ранг (твоя оценка главнее значка)</span>${rankPicker('pm-rank', (pv.overrides || {})[uid] || 0)}</label>
          <div class="row"><button class="btn" data-h="override">Сохранить ранг</button>${(pv.overrides || {})[uid] ? '<button class="btn ghost" data-h="override_off">Сбросить поправку</button>' : ''}</div>`);
        b.push('<button class="btn danger" data-h="ban">Закрыть доступ к моим кастомкам</button>');
      }
      tools = `<div style="border-top:1px solid var(--line);padding-top:14px"><h2 style="margin-bottom:10px">Пульт стримера</h2><div class="acts">${b.join('')}</div></div>`;
    }
    const m = modal(`<header><div class="row" style="gap:12px">${ava(c, 'l')}<div><h3>${esc(c.name)}</h3>
      <div class="dim" style="font-size:13px">${esc(badgeName(c.badge))}${c.pts != null ? ' · сила ' + fmt(c.pts) : ''}${c.games ? ` · ${c.games} ${plural(c.games, 'кастомка', 'кастомки', 'кастомок')}, побед ${c.wins}` : ''}</div></div></div>
      <button class="x" data-close aria-label="Закрыть">×</button></header>
      <div class="body"><div class="row">${links.join('')}</div>${kv}${tools}</div>`);
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
        if (await confirmHold({ title: 'Закрыть доступ игроку ' + c.name + '?', text: 'Он вылетит из состава и очереди и не сможет записаться на твои кастомки. Вернуть доступ можно в настройках.', label: 'Закрыть доступ', seconds: 1.5 })) await act('ban', { uid, on: true });
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
    const m = modal(`${head('Настройки кастомки')}<form class="body" id="set-form">
      <label class="field"><span>Название</span><input class="input" name="title" maxlength="60" value="${esc(st.title)}"></label>
      <label class="field"><span>Объявление над составом (необязательно)</span><input class="input" name="note" maxlength="200" value="${esc(st.note || '')}" placeholder="Например: голос в Discord, ссылка в описании"></label>
      <div class="grid2" style="gap:10px">
        <label class="field"><span>Формат</span>${sel('size', sizes, s.size)}</label>
        <label class="field"><span>Режим</span>${sel('mode', meta.modes, s.mode)}</label>
        <label class="field"><span>Регион сервера</span>${sel('region', meta.regions, s.region)}</label>
        <label class="field"><span>Драфт</span>${sel('draft', meta.drafts, s.draft)}</label>
        <label class="field"><span>Банов на команду</span>${sel('bans', { 1: '1', 2: '2', 3: '3', 4: '4' }, s.bans)}</label>
        <label class="field"><span>Секунд на ход драфта</span>${sel('pick_seconds', { 15: '15', 20: '20', 30: '30', 45: '45', 60: '60' }, s.pick_seconds)}</label>
      </div>
      ${sw('need_steam', 'Steam обязателен (иначе ранг со слов)', s.need_steam)}
      ${sw('rotation', 'Очередь играет следующую игру первой', s.rotation)}
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
      const settings = { size: +g('size'), mode: g('mode'), region: g('region'), draft: g('draft'), bans: +g('bans'), pick_seconds: +g('pick_seconds'),
        need_steam: f.has('need_steam'), rotation: f.has('rotation'), dup: f.has('dup'), lanes: f.has('lanes'), cheats: f.has('cheats') };
      if (!await act('settings', { settings })) return;
      const title = String(g('title')).trim();
      if (title && title !== st.title) await act('title', { title });
      if (String(g('note')).trim() !== (st.note || '')) await act('note', { note: String(g('note')) });
      m.close();
    });
  }

  function guestModal() {
    const m = modal(`${head('Добавить гостя')}<div class="body">
      <p class="dim">Для друга без аккаунта на сайте: он сядет в состав с рангом, который ты укажешь.</p>
      <label class="field"><span>Имя</span><input class="input" id="g-name" maxlength="24"></label>
      <label class="field"><span>Ранг</span>${rankPicker('g-rank', 0)}</label></div>
      <footer><button class="btn" data-close>Отмена</button><button class="btn primary" id="g-add">Добавить</button></footer>`);
    $('#g-add', m.el).addEventListener('click', async () => {
      const name = $('#g-name', m.el).value.trim();
      const badge = pickedRank('g-rank');
      if (!name || !badge) { toast('Нужны имя и ранг', true); return; }
      if (await act('guest', { name, badge })) m.close();
    });
  }

  function codeModal() {
    const m = modal(`${head('Код лобби из игры')}<div class="body">
      <p class="dim">Создай кастомный матч в Deadlock и вставь сюда его код. Код увидят только игроки в слотах.</p>
      <input class="input mono" id="lc-code" maxlength="10" placeholder="A1B2C" autocomplete="off" style="text-transform:uppercase;font-size:20px;height:48px;letter-spacing:.14em"></div>
      <footer><button class="btn" data-close>Отмена</button><button class="btn primary" id="lc-go">Открыть лобби</button></footer>`);
    const go = async () => { if (await act('lobby_code', { code: $('#lc-code', m.el).value.trim() })) m.close(); };
    $('#lc-go', m.el).addEventListener('click', go);
    $('#lc-code', m.el).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  // ------------------------------------------------------------ нажатия
  const ACTS = {
    login: () => login(),
    steam: () => (user.me ? linkSteam() : login()),
    join: async () => {
      const r = await act('join');
      if (r) toast(r.where === 'seat' ? 'Ты в составе' : 'Ты в очереди');
    },
    leave: () => act('leave'),
    ready: () => act('ready'),
    balance: async () => { const r = await act('balance'); if (r && r.variants) showVariants(r.variants); },
    unteam: () => act('unteam'),
    check: () => act('check', { on: true }),
    check_off: () => act('check', { on: false }),
    draft: () => act('draft', { on: true }),
    draft_off: () => act('draft', { on: false }),
    draft_go: async () => {
      const d = st.draft;
      if (!d || d.done || !selHero) return;
      const hero = selHero;
      selHero = null;
      await act(d.steps[d.i].t === 'ban' ? 'ban_hero' : 'pick_hero', { hero });
      render();
    },
    lobby_bot: async () => { toast('Бот создаёт лобби…'); await act('lobby_bot'); },
    lobby_manual: () => codeModal(),
    lobby_close: () => act('lobby_close'),
    start: () => act('start'),
    live: () => act('live'),
    win_a: () => act('result', { winner: 'a' }),
    win_b: () => act('result', { winner: 'b' }),
    next: () => act('next'),
    close: async () => {
      if (await confirmHold({ title: 'Закрыть кастомку?', text: 'Состав и очередь разойдутся, страница закроется для записи. Сыгранные игры останутся в истории.', label: 'Закрыть кастомку', seconds: 1.5 })) await act('close');
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
    if (a) { e.preventDefault(); if (!a.disabled && ACTS[a.dataset.act]) ACTS[a.dataset.act](); return; }
    const h = e.target.closest('[data-hero]');
    if (h && !h.classList.contains('off') && !h.classList.contains('idle')) { selHero = +h.dataset.hero === selHero ? null : +h.dataset.hero; render(); return; }
    const s = e.target.closest('[data-uid]');
    if (s && !opt.obs) playerModal(s.dataset.uid);
  }
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

  root.innerHTML = '<div class="card empty">Загружаю кастомку…</div>';
  connect();

  return function unmount() {
    dead = true;
    clearInterval(ticker);
    clearTimeout(pvTimer);
    if (es) es.close();
    offUser();
    root.removeEventListener('click', onClick);
    for (const ev of ['dragstart', 'dragend', 'dragover', 'drop']) root.removeEventListener(ev, onDrag);
    closeModal();
  };
}
