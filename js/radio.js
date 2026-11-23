// Мини-плеер радио Encore FM (radio.aliveenjoyer.art) в углу Лобби: слушать эфир, пока идёт кастомка.
// Свёрнут — кнопка «Радио» с тем, что сейчас играет. Нажал — раскрывается окошко с плеером радио (mini.html), звук
// идёт с той же секунды, что у всех слушателей. Переходы внутри Лобби его не трогают: страница не перезагружается.
// На телефоне кнопка открывает радио в новой вкладке — окошко там закрыло бы пол-экрана.
const RADIO = 'https://radio.aliveenjoyer.art/';
const API = 'https://173-249-26-11.sslip.io:8444/radio';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const box = document.createElement('div');
box.className = 'rdo';
box.innerHTML = `
  <button class="rdo-pill" type="button" aria-label="Радио Encore FM">
    <span class="rdo-eq" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="rdo-t"><b>Радио</b><small class="rdo-now">Encore FM</small></span>
    <span class="rdo-go" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.9l10.4-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5Z"/></svg></span>
  </button>
  <div class="rdo-card" hidden>
    <div class="rdo-head"><span class="rdo-eq" aria-hidden="true"><i></i><i></i><i></i></span><b class="rdo-name">Encore FM</b>
      <span class="rdo-track"></span><span class="rdo-sp"></span>
      <a class="rdo-open" href="${RADIO}" target="_blank" rel="noopener">Открыть радио ↗</a>
      <button class="rdo-min" type="button" aria-label="Свернуть" title="Свернуть — музыка не остановится"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 11h14v2H5z"/></svg></button>
      <button class="rdo-x" type="button" aria-label="Выключить радио" title="Выключить радио"><svg viewBox="0 0 24 24"><path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg></button></div>
    <div class="rdo-frame"></div>
  </div>`;
document.body.appendChild(box);
const pill = box.querySelector('.rdo-pill');
const card = box.querySelector('.rdo-card');
const now = box.querySelector('.rdo-now');

function open() {
  if (window.matchMedia('(max-width: 760px)').matches) { window.open(RADIO, '_blank', 'noopener'); return; }
  const f = document.createElement('iframe');
  f.src = RADIO + 'mini.html?autoplay=1';
  f.title = 'Радио Encore FM';
  f.allow = 'autoplay; encrypted-media';
  f.loading = 'eager';
  box.querySelector('.rdo-frame').appendChild(f);
  card.hidden = false;
  pill.hidden = true;
}
// свернуть в полоску: плеер не выгружается, музыка идёт дальше; щёлкнуть по полоске — развернуть
function setMin(on) {
  card.classList.toggle('min', on);
  box.querySelector('.rdo-min').title = on ? 'Развернуть' : 'Свернуть — музыка не остановится';
  box.querySelector('.rdo-min').setAttribute('aria-label', on ? 'Развернуть' : 'Свернуть');
  box.querySelector('.rdo-min').innerHTML = on
    ? '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 8 6 6-1.4 1.4-4.6-4.6-4.6 4.6L6 14z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 11h14v2H5z"/></svg>';
}
function close() {
  box.querySelector('.rdo-frame').innerHTML = '';
  setMin(false);
  card.hidden = true;
  pill.hidden = false;
  poll();
}
pill.addEventListener('click', open);
box.querySelector('.rdo-x').addEventListener('click', close);
box.querySelector('.rdo-min').addEventListener('click', () => setMin(!card.classList.contains('min')));
box.querySelector('.rdo-head').addEventListener('click', (e) => { if (card.classList.contains('min') && !e.target.closest('a, button')) setMin(false); });

// плеер радио рассказывает, что играет; попросил касание (телефон, строгий браузер) — разворачиваемся, чтобы нажать
window.addEventListener('message', (e) => {
  if (e.origin !== new URL(RADIO).origin || !e.data || !e.data.radio) return;
  const d = e.data;
  box.querySelector('.rdo-track').textContent = d.title ? d.title + (d.artist ? ' — ' + d.artist : '') : '';
  card.classList.toggle('playing', !!d.playing);
  if (d.blocked && card.classList.contains('min')) setMin(false);
});

// что играет — подпись на свёрнутой кнопке (раз в полминуты, пока вкладка на виду)
async function poll() {
  if (document.hidden || !card.hidden) return;
  try {
    const r = await fetch(API + '/state', { cache: 'no-store' });
    const s = await r.json();
    const n = s.now;
    now.innerHTML = n ? esc(n.title) + (n.artist ? ' — ' + esc(n.artist) : '') : 'Эфир молчит — закажи трек';
    pill.classList.toggle('on-air', !!n);
    pill.title = n ? 'Сейчас в эфире: ' + n.title + (n.artist ? ' — ' + n.artist : '') : 'Радио Encore FM';
  } catch (e) { /* радио не ответило — оставим подпись как есть */ }
}
poll();
setInterval(poll, 30000);
document.addEventListener('visibilitychange', poll);
