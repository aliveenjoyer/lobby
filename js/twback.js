// Возврат со страницы Twitch после «Разрешить» — вход в одно нажатие (auth.js: loginRedirect).
// Twitch кладёт токен в адрес после решётки: серверу сайта такой адрес не уходит, читает его только эта страница.
// Она сразу убирает токен из адреса, сверяет метку входа (state) со своей и меняет токен на вход на сайте.
import { call, session } from './api.js?v=20261123075649';

const box = document.getElementById('box');
const frag = new URLSearchParams(location.hash.replace(/^#/, ''));
const q = new URLSearchParams(location.search);
try { history.replaceState(null, '', location.pathname); } catch (e) { /* адрес останется как есть */ }
let saved = null;
try {
  saved = JSON.parse(sessionStorage.getItem('lobby.tw') || 'null');
  sessionStorage.removeItem('lobby.tw');
} catch (e) { /* хранилище закрыто */ }
// куда вернуть человека: на ту страницу сайта, где он нажал «Войти»
const back = saved && typeof saved.back === 'string' && /^#\/[\w\-/.]*$/.test(saved.back) ? saved.back : '#/';
const home = (flash) => {
  try { if (flash) sessionStorage.setItem('lobby.flash', flash); } catch (e) { /* без сообщения */ }
  location.replace('./' + back);
};
const fail = (text) => {
  // не получилось — следующий вход пойдёт по коду: человек не должен застрять
  try { sessionStorage.setItem('lobby.login', 'code'); } catch (e) { /* хранилище закрыто */ }
  box.innerHTML = '<h3>Войти не получилось</h3><p class="dim" style="margin:6px 0 14px"></p><a class="btn primary" href="./">Вернуться на сайт</a>';
  box.querySelector('p').textContent = text + ' Вернись на сайт и нажми «Войти» ещё раз — вход пойдёт по коду.';
  box.querySelector('a').href = './' + back;
};

const token = frag.get('access_token');
const state = frag.get('state') || q.get('state');
if (q.get('error') || frag.get('error')) home('Вход через Twitch отменён');
else if (!token) fail('Twitch не вернул вход.');
else if (!saved || !state || state !== saved.state || Date.now() - saved.at > 15 * 60000) fail('Эта страница открылась не после нажатия «Войти» на сайте.');
else {
  try {
    const r = await call('/auth/twitch/token', { token });
    session.set(r.token);
    home('Вошёл как ' + r.me.name);
  } catch (e) { fail(e.message || 'Сервер сайта не ответил.'); }
}
