// Мужская Эстетика / MAYA — Service Worker: PUSH-ONLY.
// СОЗНАТЕЛЬНО без обработчика 'fetch' и без кэширования оболочки: этот SW НЕ
// перехватывает загрузку страницы, поэтому index.html всегда берётся из сети —
// никакого «залил файл, а дизайн старый». Назначение — только приём Web Push и
// открытие приложения по клику на уведомление.

self.addEventListener('install', function (e) {
  // Не дожидаемся закрытия вкладок — сразу заменяем прежний (кэширующий) SW.
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    // Сносим ВСЕ кэши (в т.ч. оставшиеся от старого кэширующего SW v28),
    // чтобы гарантированно не было залипшей оболочки.
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (err) {}
    try { await self.clients.claim(); } catch (err) {}
  })());
});

// НЕТ обработчика 'fetch' — это принципиально: SW не вмешивается в загрузку страницы.

self.addEventListener('push', function (e) {
  // Бэкенд шлёт плоский JSON: {title, body, url, tag, ...доп.поля}.
  var d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (err) {
    try { d = { title: 'Мужская Эстетика', body: e.data ? e.data.text() : '' }; }
    catch (e2) { d = {}; }
  }
  var title = d.title || 'Мужская Эстетика';
  var url = d.url || (d.master ? '/app/?tips=' + encodeURIComponent(d.master) : '/app/');
  var opts = {
    body: d.body || '',
    icon: d.icon || '/app/apple-touch-icon.png',
    badge: d.badge || '/app/apple-touch-icon.png',
    tag: d.tag || ('me-' + (d.record_id || Date.now())),
    renotify: true,
    data: { url: url }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var raw = (e.notification.data && e.notification.data.url) || '/app/';
  var targetUrl;
  try { targetUrl = new URL(raw, self.location.origin).href; } catch (err) { targetUrl = self.location.origin + '/app/'; }
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.url && c.url.indexOf('/app') !== -1) {
          if ('navigate' in c) {
            return c.navigate(targetUrl).then(function (nc) { return (nc || c).focus(); }).catch(function () { return c.focus(); });
          }
          return c.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
