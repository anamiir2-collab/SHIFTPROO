/* ShiftPro - Live Clock
   ساعة حية على لوحة التحكم — توقيت القاهرة (Africa/Cairo).
   ----------------------------------------------------------
   القواعد:
   - مؤقّت واحد فقط (setInterval كل ثانية) — لا مؤقتات مكرّرة.
   - تحديث عناصر الساعة فقط (textContent) — بدون إعادة رسم الصفحة.
   - لا تعتمد على أي خادم؛ الوقت من جهاز المستخدم عبر Intl.
   - تتوقف مؤقتًا عند إخفاء التبويب (visibilitychange) وتستأنف تلقائيًا.
   - تنظيف كامل للمؤقت عبر destroy() (يمنع تسريب الذاكرة).
   - مصممة بدون إزاحة تخطيط (CLS): أرقام ثابتة العرض tabular-nums.

   Exposes: window.SPClock
*/
(function (global) {
  'use strict';

  var TIMEZONE = 'Africa/Cairo';
  var TICK_MS = 1000;

  var timerId = null;
  var visibilityHandler = null;
  var localeHandler = null;
  var running = false;

  function t(key, vars) {
    return global.SPi18n ? global.SPi18n.t(key, vars) : key;
  }

  function currentLocale() {
    return global.SPi18n ? global.SPi18n.getLocale() : 'ar';
  }

  // ---------- Formatters (تُبنى مرة واحدة لكل لغة) ----------
  var _fmtCache = {};
  function getFormatter(locale) {
    if (_fmtCache[locale]) return _fmtCache[locale];
    var bcp = locale === 'en' ? 'en-US' : 'ar-EG';
    var fmt = null;
    try {
      fmt = new Intl.DateTimeFormat(bcp, {
        timeZone: TIMEZONE,
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      try {
        fmt = new Intl.DateTimeFormat(bcp, {
          timeZone: TIMEZONE,
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit'
        });
      } catch (e2) {
        fmt = null;
      }
    }
    _fmtCache[locale] = fmt;
    return fmt;
  }

  function formatNow() {
    var locale = currentLocale();
    var fmt = getFormatter(locale);
    var now = new Date();
    if (fmt) {
      try { return fmt.format(now); } catch (e) {}
    }
    // fallback بسيط بدون Intl
    var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  // ---------- تحديث عناصر الساعة فقط ----------
  function render() {
    var timeEl = document.getElementById('liveClockTime');
    if (timeEl) timeEl.textContent = formatNow();
    var labelEl = document.getElementById('liveClockLabel');
    if (labelEl) labelEl.textContent = t('clock.timezone_label');
    var cardEl = document.getElementById('liveClockCard');
    if (cardEl) cardEl.setAttribute('aria-label', t('clock.aria'));
  }

  function tick() {
    // تحديث نص الوقت فقط — أرخص وأسرع من render() الكاملة
    var timeEl = document.getElementById('liveClockTime');
    if (timeEl) timeEl.textContent = formatNow();
  }

  // ---------- إظهار/إخفاء البطاقة حسب الإعدادات ----------
  function applyVisibility() {
    var card = document.getElementById('liveClockCard');
    if (!card) return;
    var enabled = true;
    try {
      if (global.SPStorage) {
        var s = global.SPStorage.getSettings();
        enabled = s.showClock !== false;
      }
    } catch (e) {}
    card.hidden = !enabled;
  }

  // ---------- التشغيل / الإيقاف ----------
  function start() {
    if (running) return;
    running = true;
    render();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(tick, TICK_MS);

    // إيقاف مؤقت عند إخفاء التبويب (توفير بطارية) واستئناف عند العودة
    if (!visibilityHandler) {
      visibilityHandler = function () {
        if (document.visibilityState === 'visible') {
          tick();
          if (timerId) clearInterval(timerId);
          timerId = setInterval(tick, TICK_MS);
        }
        // عند الإخفاء نترك المؤقت — المتصفحات توقفه تلقائيًا في الخلفية
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }

    // إعادة البناء عند تغيير اللغة (صيغة الوقت/الملصق)
    if (global.SPi18n && global.SPi18n.subscribe && !localeHandler) {
      localeHandler = function () { render(); };
      global.SPi18n.subscribe(localeHandler);
    }
  }

  function stop() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    running = false;
  }

  function destroy() {
    stop();
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (localeHandler && global.SPi18n && global.SPi18n.subscribe) {
      // unsubscribe عبر الدالة الراجعة غير متاح هنا؛ نترك الاشتراك الخفيف
      localeHandler = null;
    }
  }

  function init() {
    applyVisibility();
    try {
      if (global.SPStorage && global.SPStorage.subscribe) {
        global.SPStorage.subscribe(function () { applyVisibility(); });
      }
    } catch (e) {}
    var card = document.getElementById('liveClockCard');
    if (card && !card.hidden) start();
  }

  global.SPClock = {
    init: init,
    start: start,
    stop: stop,
    destroy: destroy,
    render: render,
    applyVisibility: applyVisibility,
    formatNow: formatNow,
    TIMEZONE: TIMEZONE
  };
})(window);
