// Self-destructing service worker — для главного сайта SW не нужен
// При активации: отписывается, без трогания кешей других scope (например /app/)
self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    // Отписываемся
    try {
      await self.registration.unregister();
    } catch(_) {}
    // Перезагружаем открытые клиенты ТОЛЬКО на корне (не трогаем /app/)
    try {
      var clients = await self.clients.matchAll({type: 'window'});
      clients.forEach(function(c){
        var u = new URL(c.url);
        if (u.pathname === '/' || u.pathname === '/index.html') {
          c.navigate(c.url);
        }
      });
    } catch(_) {}
  })());
});
