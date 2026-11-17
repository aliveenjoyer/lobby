/* Счётчик посещений Лобби: один короткий запрос на наш VPS за загрузку страницы, без cookie и чужих трекеров.
   Это копия https://aliveenjoyer.art/stat.js: странице разрешены только свои скрипты (Content-Security-Policy
   в index.html), поэтому файл лежит здесь. Сервер хранит не IP, а хэш на один день (/api/hit в /opt/wlapp/app.py
   на VPS, страница «lobby»), сводка — `wl-stats --all` там же.
   ?nostat=1 — не считать этот браузер, ?nostat=0 — снова считать, ?stat=test — тестовый просмотр (в сводку не идёт).
   Считается загрузка страницы, а не переходы внутри сайта: они идут за решёткой и страницу не перезагружают. */
(function () {
  "use strict";
  var API = "https://173-249-26-11.sslip.io:8444/api/hit";
  var PAGE = "lobby";
  var host = location.hostname;
  // 404.html переносит хвост адреса за решётку: /qissme_?from=tg -> /#/qissme_?from=tg, поэтому метки ищем и там
  var q = location.search + "&" + (location.hash.split("?")[1] || "");

  function box(kind) { try { var s = window[kind]; s.getItem("ae-nostat"); return s; } catch (e) { return null; } }
  var store = box("localStorage"), tab = box("sessionStorage");
  function get(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(s, k, v) { try { if (s) { if (v === null) s.removeItem(k); else s.setItem(k, v); } } catch (e) {} }

  if (/[?&]nostat=1/.test(q)) set(store, "ae-nostat", "1");
  if (/[?&]nostat=0/.test(q)) set(store, "ae-nostat", null);
  var test = /[?&]stat=test/.test(q);

  // откуда пришли: 404.html кладёт сюда настоящий источник, иначе после его переадресации источником был бы сам сайт
  var from = document.referrer || "";
  var kept = get(tab, "ae-ref");
  if (kept !== null) { set(tab, "ae-ref", null); from = kept; }

  if (get(store, "ae-nostat") && !test) return;
  if (!/(^|\.)aliveenjoyer\.art$/.test(host) && !test) return;      // свой запуск (localhost) не считаем

  var isNew = 9;
  if (store) { isNew = get(store, "ae-seen-" + PAGE) ? 0 : 1; set(store, "ae-seen-" + PAGE, "1"); }
  var ref = from.replace(/^[a-z]+:\/\/([^\/:?#]+).*$/i, "$1");
  if (ref === from) ref = "";
  if (ref === host) ref = "self";
  var src = /[?&](?:from|utm_source)=([\w.\-]{1,32})/.exec(q);

  var body = "p=" + PAGE + "&n=" + isNew + "&r=" + encodeURIComponent(ref) +
             "&s=" + (src ? encodeURIComponent(src[1]) : "") + (test ? "&x=1" : "");
  try { if (navigator.sendBeacon && navigator.sendBeacon(API, body)) return; } catch (e) {}
  new Image().src = API + "?" + body + "&t=" + new Date().getTime();
})();
