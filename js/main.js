// Лобби: маршруты, шапка, главная, профиль, страница ведущего.
import { call, meta, loadMeta, session } from './api.js?v=20261116031127';
import {
  $, esc, ava, badgeImg, badgeName, heroImg, heroName, fmt, plural, toast, oops, modal, head, confirmHold,
  ICON, dateRu,
} from './ui.js?v=20261116031127';
import { user, onUser, refreshMe, login, logout, linkSteam, setUser } from './auth.js?v=20261116031127';
import { mountEvent } from './event.js?v=20261116031127';
import { profileBlocks } from './profile.js?v=20261116031127';

const view = $('#view');
const TEAM = { a: 'Янтарь', b: 'Сапфир' };
const PHASE = { gather: 'идёт запись', pick: 'капитаны набирают команды', teams: 'команды собраны', lobby: 'игроки заходят в игру', live: 'идёт матч', done: 'матч окончен' };
let unmount = null;
let seq = 0;
let timer = 0;

const parts = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } });

function leave() {
  clearInterval(timer);
  timer = 0;
  if (unmount) { unmount(); unmount = null; }
}

function top() {
  const me = user.me;
  const p = parts();
  const nav = [`<a href="#/" class="${p.length ? '' : 'on'}">Все лобби</a>`];
  if (me && me.can_host) nav.push(`<a href="#/${esc(me.login)}" class="${p[0] === me.login ? 'on' : ''}">Моё лобби</a>`);
  if (me) nav.push(`<a href="#/me" class="${p[0] === 'me' ? 'on' : ''}">Мой профиль</a>`);
  $('#top').innerHTML = `<a class="brand" href="#/"><i></i><span>Лобби</span></a><nav>${nav.join('')}</nav><span class="sp"></span>
    ${me ? `<a class="me" href="#/me" title="Профиль">${ava(me, 's')}<span>${esc(me.name)}</span></a>`
    : `<button class="btn primary sm" id="top-login">${ICON.twitch}<span>Войти</span></button>`}`;
  const b = $('#top-login');
  if (b) b.addEventListener('click', login);
}

async function route() {
  leave();
  const my = ++seq;
  const p = parts();
  document.body.classList.toggle('obs', p[0] === 'obs');
  top();
  window.scrollTo(0, 0);
  const fresh = () => my === seq;
  try {
    if (!p.length) await home(fresh);
    else if (p[0] === 'me') mePage();
    else if (p[0] === 'c' && p[1]) unmount = mountEvent(view, p[1].toLowerCase());
    else if (p[0] === 'u' && p[1]) await userPage(p[1].toLowerCase(), fresh);
    else if (p[0] === 'obs' && p[1]) await hostPage(p[1].toLowerCase(), fresh, true);
    else await hostPage(p[0].toLowerCase(), fresh, false);
  } catch (e) {
    if (fresh()) view.innerHTML = `<div class="card empty"><h3>${esc(e.message || 'Не получилось загрузить страницу')}</h3>
      <div class="row" style="justify-content:center;margin-top:14px"><a class="btn" href="#/">На главную</a></div></div>`;
  }
}

// ---------------------------------------------------------------- главная
async function home(fresh) {
  const draw = (events) => {
    const me = user.me;
    const mine = me && events.find((e) => e.host.login === me.login);
    const btn = [];
    if (!me) btn.push(`<button class="btn primary xl" data-go="login">${ICON.twitch}<span>Войти через Twitch</span></button>`);
    if (me && me.can_host) btn.push(mine ? `<a class="btn primary xl" href="#/${esc(me.login)}">Открыть моё лобби</a>` : '<button class="btn primary xl" data-go="create">Создать лобби</button>');
    if (me && !me.steam) btn.push(`<button class="btn xl" data-go="steam">${ICON.steam}<span>Привязать Steam</span></button>`);
    const rows = events.map((e) => `<a class="card evrow" href="#/${esc(e.host.login)}">${ava(e.host)}
      <span class="t"><b>${esc(e.title)}</b><span>${PHASE[e.phase] || ''} · ${e.caps ? `записались ${e.seats + e.queue}` : `в составе ${e.seats} из ${e.cap}${e.queue ? ' · в очереди ' + e.queue : ''}`}${e.round > 1 ? ' · игра ' + e.round : ''}</span></span>
      ${e.host.live ? '<span class="chip live">LIVE</span>' : ''}<span class="btn sm primary">Зайти</span></a>`).join('');
    const prof = me ? `<section class="sec"><h2>Твой профиль</h2><a class="card evrow" href="#/me">${ava(me)}
      <span class="t"><b>${esc(me.name)}</b><span>${me.badge ? esc(badgeName(me.badge)) : me.steam ? 'в игре ранга пока нет' : 'без ранга'}${me.pts != null ? ' · сила ' + fmt(me.pts) : ''}${me.steam ? '' : ' · Steam не привязан'}</span></span>
      ${badgeImg(me.badge)}<span class="btn sm">Открыть</span></a></section>` : '';
    view.innerHTML = `<section class="hello"><h1>Кастомки Deadlock со зрителями</h1>
      <p>Ведущий создаёт лобби и кидает ссылку в чат. Зрители записываются, два капитана набирают команды, потом драфт героев и код для входа в игру.</p>
      ${btn.length ? `<div class="row">${btn.join('')}</div>` : ''}</section>
      <section class="sec"><h2>Открытые лобби</h2><div class="list">${rows || '<div class="card empty">Сейчас открытых лобби нет. Когда ведущий создаст лобби, оно появится здесь.</div>'}</div></section>${prof}
      <section class="sec"><h2>Как проходит игра</h2><ol class="flow">
        <li><b>Запись</b><span>Зрители заходят по ссылке и жмут «Записаться». Ранг и герои подтягиваются из Steam.</span></li>
        <li><b>Капитаны</b><span>Двое жмут «Стать капитаном» — или ведущий запускает голосование, и капитанов выбирают игроки.</span></li>
        <li><b>Команды и драфт</b><span>Капитаны по очереди берут игроков, потом банят и выбирают героев команде. Кто на ком играет, команда решает сама.</span></li>
        <li><b>Игра</b><span>Сайт создаёт лобби в Deadlock и показывает код игрокам команд. После матча — итог и следующая игра.</span></li>
      </ol></section>`;
  };
  view.innerHTML = '<div class="card empty">Загружаю…</div>';
  const load = async () => {
    const d = await call('/events');
    if (fresh()) draw(d.events);
  };
  view.onclick = async (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (b.dataset.go === 'login') login();
    if (b.dataset.go === 'steam') linkSteam();
    if (b.dataset.go === 'create') {
      try { await call('/events', {}); location.hash = '#/' + user.me.login; } catch (err) { oops(err); }
    }
  };
  await load();
  timer = setInterval(() => load().catch(() => {}), 20000);
}

// ---------------------------------------------------------------- профиль
function mePage() {
  const me = user.me;
  if (!me) {
    view.innerHTML = `<div class="card empty"><h3>Профиль</h3><p class="dim" style="margin:6px 0 14px">Войди через Twitch, чтобы привязать Steam и записываться на игры.</p>
      <button class="btn primary" id="p-login">${ICON.twitch}<span>Войти через Twitch</span></button></div>`;
    $('#p-login').addEventListener('click', login);
    return;
  }
  // Ранг берётся только из игры. Steam привязан, а ранга там нет — говорим, почему и что делать; указать самому нельзя.
  const left = me.stats ? me.stats.calib : null;
  const noRank = me.src === 'game' ? '' : `<div class="note">${left != null
    ? `В игре у тебя пока нет ранга: идёт калибровка${left > 0 ? `, ${plural(left, 'осталась', 'остались', 'осталось')} ${left} ${plural(left, 'игра', 'игры', 'игр')}` : ''}.`
    : 'В игре у тебя пока нет ранга: он появляется после рейтинговых матчей.'}
    Сайт берёт ранг только из игры. Когда он там появится, нажми «Обновить статистику». До тех пор ранг тебе может поставить ведущий лобби.</div>`;
  view.innerHTML = `<div class="phead">${ava(me, 'l')}<div class="t"><h1>${esc(me.name)}</h1>
      <div class="row" style="margin-top:6px"><a class="chip" href="https://twitch.tv/${esc(me.login)}" target="_blank" rel="noopener">twitch.tv/${esc(me.login)}</a>
        ${me.steam ? `<a class="chip" href="https://statlocker.gg/profile/${me.steam}" target="_blank" rel="noopener">Statlocker</a><span class="chip ok">Steam привязан</span>` : ''}</div></div>
      <button class="btn" data-p="logout">Выйти</button></div>
    ${me.steam ? profileBlocks({ badge: me.badge, pts: me.pts, src: me.src, stats: me.stats }, me.more) : ''}
    <h2 class="sech">Настройки профиля</h2>
    <div class="grid2">
      <section class="card"><header><h2>Steam и ранг</h2></header><div class="body" style="display:grid;gap:14px">
        ${me.steam ? `<div class="dim">Привязан Steam${me.steam_name ? ': ' + esc(me.steam_name) : ''}. Статистика обновляется сама, когда ты записываешься на игру.</div>
          ${noRank}
          <label class="switch"><span>Показывать ссылку на мой Statlocker на карточке</span><input type="checkbox" id="p-show" ${me.show_steam ? 'checked' : ''}><i></i></label>
          <div class="row"><button class="btn" data-p="refresh">Обновить статистику</button><button class="btn ghost" data-p="unlink">Отвязать Steam</button></div>`
    : `<p class="dim">Привяжи Steam: сайт узнает номер аккаунта, а по нему ранг, героев и статистику из игры. Без Steam записаться на игру нельзя — ранг берётся только оттуда. Пароль сайт не видит: вход идёт на странице Steam.</p>
          <div class="row"><button class="btn primary" data-p="steam">${ICON.steam}<span>Привязать Steam</span></button></div>`}
      </div></section>
      <div class="col">
        <section class="card"><header><h2>Игры на сайте</h2></header><div class="body"><div class="kv">
          <div><b>${me.games}</b><span>сыграно</span></div><div><b>${me.wins}</b><span>побед</span></div>
          <div><b>${me.adj > 0 ? '+' : ''}${fmt(me.adj)}</b><span>поправка силы</span></div></div></div></section>
        ${me.admin ? `<section class="card"><header><h2>Кто может создавать лобби</h2></header>
          <div class="body" style="display:grid;gap:10px" id="adm-hosts"><span class="dim">Загружаю…</span></div></section>` : ''}
        <section class="card"><header><h2>Удаление</h2></header><div class="body">
          <p class="dim" style="margin-bottom:12px">Удаление стирает с сайта твой профиль, привязку Steam и статистику игр.</p>
          <button class="btn danger" data-p="delete">Удалить профиль</button></div></section>
      </div></div>`;
  const save = async (path, body, ok) => {
    try { const d = await call(path, body); setUser(d.me); if (ok) toast(ok); } catch (e) { oops(e); }
  };
  const drawHosts = (d) => {
    const box = $('#adm-hosts');
    if (!box) return;
    const line = (l, right) => `<div class="row" style="justify-content:space-between"><span>${esc(l)}</span>${right}</div>`;
    box.innerHTML = `<p class="dim">Эти люди видят кнопку «Создать лобби». Впиши логин Twitch — после входа на сайт человек сможет вести свои лобби.</p>
      ${d.fixed.map((l) => line(l, '<span class="dim" style="font-size:13px">в настройках сервера</span>')).join('')}
      ${d.extra.map((l) => line(l, `<button class="btn sm" data-p="host_del" data-login="${esc(l)}">Убрать</button>`)).join('')}
      <div class="pickers" style="grid-template-columns:1fr auto"><input class="input" id="adm-login" maxlength="30" placeholder="логин Twitch" autocomplete="off">
      <button class="btn" data-p="host_add">Добавить</button></div>`;
  };
  if (me.admin) call('/admin/hosts').then(drawHosts).catch(oops);
  view.onclick = async (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const a = b.dataset.p;
    if (a === 'logout') { await logout(); location.hash = '#/'; }
    if (a === 'steam') linkSteam();
    if (a === 'refresh') { b.disabled = true; await save('/me/refresh', {}, 'Статистика обновлена'); }
    if (a === 'unlink') {
      const m = modal(`${head('Отвязать Steam?')}<div class="body"><p class="dim">Ранг и статистика пропадут с карточки. Тот же Steam можно привязать снова в любой момент, другой — через 30 дней.</p></div>
        <footer><button class="btn" data-close>Отмена</button><button class="btn danger" id="un-go">Отвязать Steam</button></footer>`);
      $('#un-go', m.el).addEventListener('click', async () => { m.close(); await save('/steam/unlink', {}, 'Steam отвязан'); });
    }
    if (a === 'host_add') {
      const l = $('#adm-login').value.trim().replace(/^@/, '');
      if (!l) { toast('Впиши логин Twitch', true); return; }
      try { drawHosts(await call('/admin/hosts', { add: l })); toast(l + ' теперь может создавать лобби'); } catch (err) { oops(err); }
    }
    if (a === 'host_del') {
      try { drawHosts(await call('/admin/hosts', { remove: b.dataset.login })); toast(b.dataset.login + ' больше не создаёт лобби'); } catch (err) { oops(err); }
    }
    if (a === 'delete') {
      if (await confirmHold({ title: 'Удалить профиль?', text: 'С сайта сотрутся профиль, привязка Steam и статистика игр. Вернуть их нельзя.', label: 'Удалить профиль', seconds: 3 })) {
        try { await call('/me/delete', {}); session.set(null); setUser(null); location.hash = '#/'; toast('Профиль удалён'); } catch (err) { oops(err); }
      }
    }
  };
  view.onchange = (e) => {
    if (e.target.id === 'p-show') save('/me', { show_steam: e.target.checked }, e.target.checked ? 'Ссылка на Statlocker видна всем' : 'Ссылка на Statlocker скрыта');
  };
}

async function userPage(login, fresh) {
  view.innerHTML = '<div class="card empty">Загружаю…</div>';
  const c = (await call('/u/' + encodeURIComponent(login))).user;
  if (!fresh()) return;
  view.onclick = null;
  view.innerHTML = `<div class="phead">${ava(c, 'l')}<div class="t"><h1>${esc(c.name)}</h1>
      <div class="row" style="margin-top:6px">${c.live ? '<span class="chip live">LIVE</span>' : ''}
        <a class="chip" href="https://twitch.tv/${esc(c.login)}" target="_blank" rel="noopener">twitch.tv/${esc(c.login)}</a>
        ${c.steam ? `<a class="chip" href="https://statlocker.gg/profile/${c.steam}" target="_blank" rel="noopener">Statlocker</a>` : ''}
        ${c.host ? `<a class="chip" href="#/${esc(c.login)}">страница ведущего</a>` : ''}
        ${c.games ? `<span class="chip">${c.games} ${plural(c.games, 'игра', 'игры', 'игр')} на сайте, побед ${c.wins}</span>` : ''}</div></div></div>
    ${profileBlocks(c, c.more)}`;
}

// ---------------------------------------------------------------- страница ведущего
function matchRow(m) {
  const names = (k) => (m.teams && m.teams[k] ? m.teams[k].map((p) => esc(p.name)).join(', ') : '');
  const w = m.winner;
  return `<div class="mrow"><span class="dim d">${dateRu(m.at)}${m.round > 1 ? ' · игра ' + m.round : ''}</span>
    <span><span class="w ${w}">Победил ${TEAM[w]}</span><span class="dim"> — ${names(w)}</span><br><span class="mute" style="font-size:13px">против: ${names(w === 'a' ? 'b' : 'a')}</span></span>
    ${m.match_id ? `<a class="btn sm" href="https://statlocker.gg/match/${m.match_id}" target="_blank" rel="noopener">Матч</a>` : '<span></span>'}</div>`;
}

async function hostPage(login, fresh, obs) {
  if (!/^[a-z0-9_]{2,30}$/.test(login)) throw new Error('Такой страницы нет');
  view.innerHTML = obs ? '' : '<div class="card empty">Загружаю…</div>';
  let shown = null;            // id показанного лобби или '' для страницы без него
  let lastKey = '';
  const draw = async () => {
    const h = await call('/h/' + login);
    if (!fresh()) return;
    const want = h.event || '';
    const key = JSON.stringify(h);
    if (shown === want && (want || key === lastKey)) return;
    lastKey = key;
    if (unmount) { unmount(); unmount = null; }
    shown = want;
    if (want) { view.onclick = null; unmount = mountEvent(view, want, { obs }); return; }
    if (obs) { view.innerHTML = ''; return; }
    const hs = h.host;
    view.innerHTML = `<div class="phead">${ava(hs, 'l')}<div class="t"><h1>${esc(hs.name)}</h1>
        <div class="row" style="margin-top:6px">${hs.live ? '<span class="chip live">LIVE</span>' : ''}
          <a class="chip" href="https://twitch.tv/${esc(hs.login)}" target="_blank" rel="noopener">twitch.tv/${esc(hs.login)}</a></div>
        ${h.about ? `<p class="dim" style="margin-top:10px">${esc(h.about)}</p>` : ''}</div></div>
      <div class="grid2"><div class="col">
        <section class="stage"><div class="stbody"><div><h2 class="sttitle">Лобби сейчас не открыто</h2>
          <p class="sttext">${h.mine ? 'Создай лобби и кинь ссылку на эту страницу в чат: зрители записываются сами.' : h.schedule ? esc(h.schedule) : 'Когда ведущий создаст лобби, оно появится на этой странице.'}</p></div>
          ${h.mine ? '<div class="stbtns"><button class="btn primary xl" data-hp="create">Создать лобби</button><button class="btn xl" data-hp="edit">Изменить страницу</button></div>' : ''}</div></section>
        ${h.links.length ? `<section class="card"><header><h2>Ссылки</h2></header><div class="body"><div class="links">${h.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(l.title)}</a>`).join('')}</div></div></section>` : ''}
        ${h.rules ? `<section class="card"><header><h2>Правила</h2></header><div class="body"><div class="rules">${esc(h.rules)}</div></div></section>` : ''}
      </div><section class="card"><header><h2>Прошедшие игры</h2><span class="dim num">${h.matches.length}</span></header>
        <div class="body" style="padding:10px 0 0">${h.matches.length ? `<div style="border-top:1px solid var(--line)">${h.matches.map(matchRow).join('')}</div>` : '<div class="empty">Игр пока не было</div>'}</div></section></div>`;
    view.onclick = async (e) => {
      const b = e.target.closest('[data-hp]');
      if (!b) return;
      if (b.dataset.hp === 'create') { try { await call('/events', {}); await draw(); } catch (err) { oops(err); } }
      if (b.dataset.hp === 'edit') editHost(h, () => { draw().catch(oops); });
    };
  };
  await draw();
  timer = setInterval(() => draw().catch(() => {}), 15000);
}

function editHost(h, done) {
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const l = h.links[i] || { title: '', url: '' };
    rows.push(`<div class="pickers" style="grid-template-columns:1fr 1.6fr"><input class="input" data-lt maxlength="40" placeholder="Название" value="${esc(l.title)}">
      <input class="input" data-lu maxlength="300" placeholder="https://…" value="${esc(l.url)}"></div>`);
  }
  const m = modal(`${head('Моя страница')}<div class="body">
    <label class="field"><span>Пара слов о кастомках</span><input class="input" id="hp-about" maxlength="300" value="${esc(h.about)}"></label>
    <label class="field"><span>Когда играем</span><input class="input" id="hp-sched" maxlength="120" value="${esc(h.schedule)}" placeholder="Каждое воскресенье в 18:00 по Москве"></label>
    <label class="field"><span>Правила</span><textarea class="input" id="hp-rules" maxlength="2000">${esc(h.rules)}</textarea></label>
    <div class="field"><span>Ссылки: канал, донат, свои сервисы</span>${rows.join('')}</div></div>
    <footer><button class="btn" data-close>Отмена</button><button class="btn primary" id="hp-save">Сохранить</button></footer>`, { wide: true });
  $('#hp-save', m.el).addEventListener('click', async () => {
    const t = Array.from(m.el.querySelectorAll('[data-lt]'));
    const u = Array.from(m.el.querySelectorAll('[data-lu]'));
    const links = t.map((x, i) => ({ title: x.value.trim(), url: u[i].value.trim() })).filter((l) => l.title || l.url);
    const bad = links.find((l) => !l.title || !/^https?:\/\//.test(l.url));
    if (bad) { toast('У ссылки нужны название и адрес с https://', true); return; }
    try {
      await call('/h', { about: $('#hp-about', m.el).value, schedule: $('#hp-sched', m.el).value, rules: $('#hp-rules', m.el).value, links });
      m.close();
      toast('Страница сохранена');
      done();
    } catch (e) { oops(e); }
  });
}

// ---------------------------------------------------------------- свой запуск: быстрый вход под выдуманными людьми
function devBar() {
  const bar = document.createElement('div');
  bar.className = 'devbar';
  bar.innerHTML = '<b>DEV</b><input id="dv-login" placeholder="логин" value="viewer1"><button class="btn sm" id="dv-go">Войти как</button><button class="btn sm" id="dv-steam">+Steam</button>';
  document.body.appendChild(bar);
  $('#dv-go').addEventListener('click', async () => {
    try { const d = await call('/dev/login', { login: $('#dv-login').value.trim() }); session.set(d.token); setUser(d.me); toast('Вошёл как ' + d.me.name); } catch (e) { oops(e); }
  });
  $('#dv-steam').addEventListener('click', async () => {
    try { const d = await call('/dev/steam', { acc: 100000 + Math.floor(Math.random() * 899999) }); setUser(d.me); toast('Steam привязан (выдуманный)'); } catch (e) { oops(e); }
  });
}

// ---------------------------------------------------------------- запуск
async function boot() {
  try { await loadMeta(); } catch (e) {
    view.innerHTML = `<div class="card empty"><h3>Сервер лобби не отвечает</h3><p class="dim" style="margin-top:6px">${esc(e.message)}</p>
      <div class="row" style="justify-content:center;margin-top:14px"><button class="btn" onclick="location.reload()">Обновить страницу</button></div></div>`;
    top();
    return;
  }
  await refreshMe();
  onUser(() => { top(); const p = parts(); if (!p.length || p[0] === 'me') route(); });
  window.addEventListener('hashchange', route);
  if (meta.dev) devBar();
  try {
    const flash = sessionStorage.getItem('lobby.flash');
    if (flash) { sessionStorage.removeItem('lobby.flash'); toast(flash); }
  } catch (e) { /* нет хранилища */ }
  route();
}
boot();
