// Офлайн-кэш. При обновлении сайта поднять версию в CACHE.
const CACHE = "monetki-v131";
const FILES = ["./", "index.html", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png", "badge-96.png"];

// Ставим кэш по файлу: если какой-то не скачался (плохая сеть), установка не срывается целиком.
// Но без index.html новую версию не ставим — останется старая, рабочая.
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(f)))
    .then(() => c.match("index.html")).then(hit => { if (!hit) throw new Error("index.html не скачался"); }))
    .then(() => self.skipWaiting()));
});
// Все PWA лежат на одном сайте 7ivanshulgin7.github.io и делят хранилище кэшей:
// чистим только свои старые версии (monetki-v…), чужие (kk-, terapiya-…) и шрифты не трогаем.
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("monetki-v") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
// Если копии приложения нет совсем (например, браузер очистил кэш) — понятная заглушка вместо ERR_FAILED
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Монетки</title>' +
  '<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0C0C0E;color:#eee;font:16px system-ui;text-align:center;padding:24px">' +
  '<div><div style="font-size:48px">🪙</div><h2>Нет связи</h2><p style="opacity:.7">Монетки ещё не сохранились на телефоне для работы без сети.<br>Откройте их один раз с интернетом.</p>' +
  '<button onclick="location.reload()" style="margin-top:12px;padding:12px 20px;border:0;border-radius:12px;background:#0F6E64;color:#fff;font:inherit">Попробовать ещё раз</button></div>';
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Шрифты Google: из кэша; если их нет и сети нет (или она «висит») — через 1 с отдаём пустышку,
  // иначе страница ждёт стиль шрифтов и не открывается. Шрифты кэшируем навсегда, между версиями тоже.
  if (url.host.endsWith("fonts.googleapis.com") || url.host.endsWith("fonts.gstatic.com")) {
    const css = url.host.endsWith("fonts.googleapis.com");
    const empty = () => css ? new Response("", { headers: { "Content-Type": "text/css" } }) : Response.error();
    e.respondWith(caches.open("monetki-fonts").then(c => c.match(req).then(hit => {
      if (hit) return hit;
      const net = fetch(req).then(r => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; });
      return Promise.race([net, new Promise(res => setTimeout(res, 1000))]).then(r => r || empty()).catch(empty);
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Свои файлы: сразу из кэша — мгновенный запуск и без сети. Новая версия приходит с новым sw.js:
  // браузер проверяет его сам, ставит новый кэш целиком, и со следующего запуска открывается новая версия.
  // Ищем во всех кэшах (на случай, если новый кэш ещё не доставился), сеть — только если копии нет совсем,
  // и не дольше 6 с: при «глючной» сети браузер иначе висит ~20 с и показывает ERR_FAILED.
  if (req.mode === "navigate") {
    e.respondWith(caches.match("index.html").then(hit => hit || caches.match("./")).then(hit => {
      if (hit) {
        // копию заодно освежаем в фоне, если сеть есть
        e.waitUntil(fetch("index.html", { cache: "no-store" }).then(r => r.ok && caches.open(CACHE).then(c => c.put("index.html", r))).catch(() => {}));
        return hit;
      }
      return timeout(fetch(req), 6000).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
    }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || timeout(fetch(req), 6000).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});

// Напоминание: сервер присылает {t: first|again|missed, s: kind|evil}, текст выбираем здесь
// Тексты по нарастающей: n — сколько дней подряд пропущено. Повтор через час всегда злой.
const pick = a => a[Math.floor(Math.random() * a.length)];
const dn = n => n % 10 === 1 && n % 100 !== 11 ? "день" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "дня" : "дней";
function nagText(t, s, n) {
  const evil = s === "evil";
  if (t === "again") {
    if (n >= 3) return pick([`${n} ${dn(n)} без записей, и сегодня опять ноль. Ты вообще собираешься вести деньги или как?`, `Это уже не лень, это диагноз. ${n} ${dn(n)} пусто. Открывай Монетки, живо!`]);
    if (n >= 1) return pick(["Вчера проигнорил, сегодня опять? Хватит. Записывай траты!", "Второй день подряд забиваешь. Деньги сами себя не посчитают. Шевелись!"]);
    return pick(["Час прошёл, а ты так ничего и не записал. Лентяй. Открывай Монетки.", "Ты серьёзно меня игнорируешь? Деньги утекают, а ты сидишь. Записывай. Сейчас же.", "Хватит прокрастинировать. Пять секунд — и траты записаны. Шевелись!", "Опять «потом»? Никакого потом. Открыл, записал, закрыл."]);
  }
  if (t === "missed") {
    if (evil) {
      if (n >= 3) return pick([`${n} ${dn(n)} ни одной записи. Ты вообще помнишь, что у тебя есть Монетки?`, `Ну всё, ${n} ${dn(n)} тишины. Либо записываешь сегодня, либо признай, что сдался.`]);
      if (n >= 2) return pick(["Два дня без записей. Это уже привычка, и плохая. Сегодня без отговорок.", "Позавчера забыл, вчера забыл. Сегодня — тоже? Не смей."]);
      return pick(["Вчера ты всё пропустил. Сегодня — даже не думай.", "День без записей — деньги в никуда. Не повторяй вчерашнее.", "Вчера слился. Сегодня записываешь без отговорок."]);
    }
    if (n >= 3) return pick([`Мы не виделись уже ${n} ${dn(n)} 🥺 Загляни — можно записать всё задним числом.`, `${n} ${dn(n)} без записей — ничего страшного, начни сегодня 🙂`]);
    if (n >= 2) return pick(["Пару дней пропустил — бывает. Давай сегодня вернёмся 🙂"]);
    return pick(["Вчера день пропал — давай сегодня не упустим 🙂", "Вчерашние траты можно дописать задним числом. И сегодняшние тоже 😉"]);
  }
  return evil ? pick(["Траты сами себя не запишут. Открывай.", "Опять вечер, а в Монетках пусто. Ну?", "Пять секунд. Записывай траты. Сейчас."])
              : pick(["Записал сегодняшние траты? Пара секунд — и день закрыт 🙂", "Как прошёл день? Загляни, отметь траты 🪙", "Вечерняя минутка для Монеток — запишешь?"]);
}
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  const evil = d.s === "evil" || d.t === "again";
  e.waitUntil(self.registration.showNotification(evil ? "Монетки 😈" : "Монетки", {
    body: nagText(d.t, d.s, +d.n || 0),
    icon: "icon-192.png", badge: "badge-96.png", tag: "daily", renotify: true, data: { url: "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow(e.notification.data && e.notification.data.url || "./");
  }));
});
