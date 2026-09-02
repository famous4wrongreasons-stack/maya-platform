/**
 * native-enhancements.js
 * Модуль превращает PWA в максимально нативное ощущение.
 * Подключение: <script src="/app/native-enhancements.js" defer></script>
 */

(function() {
  'use strict';

  // ============= ОПРЕДЕЛЕНИЕ ОКРУЖЕНИЯ =============
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://');

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isAndroid = /Android/.test(navigator.userAgent);

  document.documentElement.dataset.standalone = isStandalone ? 'yes' : 'no';
  document.documentElement.dataset.platform = isIOS ? 'ios' : isAndroid ? 'android' : 'web';

  console.log('[Native] standalone:', isStandalone, '| platform:', document.documentElement.dataset.platform);


  // ============= ЗАПРЕТ МАСШТАБИРОВАНИЯ =============
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });

  let lastTap = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTap <= 350) e.preventDefault();
    lastTap = now;
  }, { passive: false });

  if (isStandalone) {
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
  }


  // ============= ТАКТИЛЬНЫЙ ОТКЛИК =============
  const haptic = {
    light:    () => navigator.vibrate?.(8),
    medium:   () => navigator.vibrate?.(15),
    heavy:    () => navigator.vibrate?.(25),
    success:  () => navigator.vibrate?.([10, 30, 10]),
    error:    () => navigator.vibrate?.([50, 20, 50, 20, 50]),
    selection:() => navigator.vibrate?.(5)
  };
  window.haptic = haptic;

  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, a, [role="button"], .btn-book, .btn-book-large, .app-tab, .app-phone-menu-item, .nav-item, .service-row');
    if (!el || el.dataset.noHaptic) return;
    haptic.light();
  }, { passive: true });


  // ============= PULL-TO-REFRESH =============
  if (isStandalone) initPullToRefresh();

  function initPullToRefresh() {
    let startY = 0, currentY = 0, pulling = false;
    const threshold = 80;

    const indicator = document.createElement('div');
    indicator.id = 'pwa-ptr-indicator';
    indicator.innerHTML = `
      <div class="pwa-ptr-spinner">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M21 12a9 9 0 11-9-9" stroke="#f4f0eb" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
    `;
    indicator.style.cssText = `
      position: fixed; top: 0; left: 50%;
      transform: translate(-50%, -60px);
      width: 44px; height: 44px;
      background: rgba(0,0,0,0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(244,240,235,0.15);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      z-index: 99999; opacity: 0; pointer-events: none;
      transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
    `;
    document.body.appendChild(indicator);

    const style = document.createElement('style');
    style.textContent = `
      #pwa-ptr-indicator .pwa-ptr-spinner svg { transition: transform 0.2s ease; }
      #pwa-ptr-indicator.ready .pwa-ptr-spinner svg { transform: rotate(180deg); }
      #pwa-ptr-indicator.refreshing .pwa-ptr-spinner svg { animation: pwaPtrSpin 0.8s linear infinite; }
      @keyframes pwaPtrSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);

    document.addEventListener('touchstart', (e) => {
      if (window.scrollY > 0) return;
      startY = e.touches[0].clientY;
      pulling = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!pulling || window.scrollY > 0) return;
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0 && diff < 200) {
        const progress = Math.min(diff / threshold, 1.5);
        indicator.style.transform = `translate(-50%, ${diff * 0.5 - 30}px)`;
        indicator.style.opacity = Math.min(progress, 1);
        if (diff > threshold && !indicator.classList.contains('ready')) {
          indicator.classList.add('ready');
          haptic.medium();
        } else if (diff <= threshold) {
          indicator.classList.remove('ready');
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (!pulling) return;
      pulling = false;
      const diff = currentY - startY;
      if (diff > threshold) {
        indicator.classList.remove('ready');
        indicator.classList.add('refreshing');
        indicator.style.transform = 'translate(-50%, 20px)';
        haptic.success();
        setTimeout(() => location.reload(), 400);
      } else {
        indicator.style.transform = 'translate(-50%, -60px)';
        indicator.style.opacity = '0';
        indicator.classList.remove('ready');
      }
      startY = 0;
      currentY = 0;
    }, { passive: true });
  }


  // ============= СВАЙП-НАВИГАЦИЯ =============
  initSwipeNavigation();

  function initSwipeNavigation() {
    const screens = document.querySelectorAll('.screen, [data-screen]');
    if (screens.length < 2) return;

    let touchStartX = 0, touchStartY = 0;
    const minSwipeDistance = 80, maxVerticalDeviation = 60;

    document.addEventListener('touchstart', (e) => {
      if (e.target.closest('input, textarea, select, button, a, [data-no-swipe]')) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!touchStartX) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dy) > maxVerticalDeviation) return;

      if (Math.abs(dx) > minSwipeDistance) {
        const activeScreen = document.querySelector('.screen.active, [data-screen].active');
        if (!activeScreen) return;
        const allScreens = Array.from(screens);
        const idx = allScreens.indexOf(activeScreen);
        if (dx < 0 && idx < allScreens.length - 1) {
          allScreens[idx].classList.remove('active');
          allScreens[idx + 1].classList.add('active');
          haptic.selection();
        } else if (dx > 0 && idx > 0) {
          allScreens[idx].classList.remove('active');
          allScreens[idx - 1].classList.add('active');
          haptic.selection();
        }
      }
      touchStartX = 0;
      touchStartY = 0;
    }, { passive: true });
  }


  // ============= ПЕРЕХВАТ ВНЕШНИХ ССЫЛОК =============
  if (isStandalone) {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;
      const isExternal = /^https?:\/\//.test(href) && !href.includes(location.host);
      const isProtocol = /^(tel:|mailto:|sms:|geo:)/.test(href);
      if (isExternal || isProtocol) {
        if (!link.target) link.target = '_blank';
        link.rel = 'noopener external';
      }
    });
  }


  // ============= PUSH-УВЕДОМЛЕНИЯ =============
  window.requestPushPermission = async function(options = {}) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[Push] Не поддерживается');
      return null;
    }
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        haptic.success();
        const reg = await navigator.serviceWorker.ready;
        const vapidPublicKey = options.vapidKey || null;
        if (vapidPublicKey) {
          const subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
          });
          if (options.onSubscribe) options.onSubscribe(subscription);
        }
      } else {
        haptic.error();
      }
      return permission;
    } catch (err) {
      console.error('[Push] Ошибка:', err);
      return null;
    }
  };

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  }


  // ============= ИНДИКАТОР ОФЛАЙН-РЕЖИМА =============
  const offlineBar = document.createElement('div');
  offlineBar.id = 'pwa-offline-bar';
  offlineBar.textContent = 'Нет соединения с интернетом';
  offlineBar.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(244,240,235,0.95);
    color: #000;
    padding: 12px 24px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
    font-family: 'Montserrat', sans-serif;
    font-size: 11px; font-weight: 400;
    letter-spacing: 0.2em; text-transform: uppercase;
    text-align: center; z-index: 99998;
    transform: translateY(100%);
    transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
  `;
  document.body.appendChild(offlineBar);

  function updateOnlineStatus() {
    if (navigator.onLine) {
      offlineBar.style.transform = 'translateY(100%)';
    } else {
      offlineBar.style.transform = 'translateY(0)';
      haptic.error();
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);


  // ============= УСТАНОВКА =============
  let deferredInstallPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.documentElement.classList.add('pwa-installable');
    window.dispatchEvent(new CustomEvent('pwa-installable'));
  });

  window.addEventListener('appinstalled', () => {
    haptic.success();
    deferredInstallPrompt = null;
    document.documentElement.classList.remove('pwa-installable');
    console.log('[PWA] Установлено');
  });

  window.showInstallPrompt = async function() {
    if (!deferredInstallPrompt) return false;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return outcome === 'accepted';
  };


  // ============= БЕЗОПАСНЫЕ ЗОНЫ iOS =============
  if (isIOS && isStandalone) {
    document.documentElement.classList.add('has-safe-area');
  }

})();
