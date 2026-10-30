// Офлайн-кэш. При обновлении сайта поднять версию в CACHE.
const CACHE = "monetki-v124";
const FILES = ["./", "index.html", "manifest.json", "icon-180.png", "icon-192.png", "icon-512.png", "badge-96.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Шрифты Google: из кэша, если есть
  if (url.host.endsWith("fonts.googleapis.com") || url.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { c.put(req, r.clone()); return r; }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Свои файлы: пробуем сеть, но ждём не дольше 1,5 с — дальше открываем из кэша,
  // а свежая версия докачивается в фоне и будет при следующем запуске
  const net = fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  });
  e.waitUntil(net.catch(() => {}));
  e.respondWith(caches.match(req).then(hit => {
    if (!hit) return net.catch(() => caches.match("index.html"));
    const late = new Promise(res => setTimeout(() => res(hit), 1500));
    return Promise.race([net.catch(() => hit), late]);
  }));
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
