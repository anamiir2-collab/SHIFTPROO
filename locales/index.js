/* ShiftPro - i18n Engine
   يوفّر:
   - t(key, vars) لترجمة المفاتيح مع دعم المتغيرات
   - getLocale() / setLocale(locale)
   - subscribe(cb) للتنبيه بتغيير اللغة
   - formatDate(date, options), formatCurrency(amount), formatNumber(n)
   - getMonthName(i), getWeekdayName(i)
   - apply(root) لتطبيق ترجمات [data-i18n] على عناصر DOM

   المتجر الحالي: localStorage["locale"] = "ar" | "en"
   التبديل التلقائي: dir/lang على <html>
*/
(function (global) {
  'use strict';

  const STORAGE_KEY = 'locale';
  const SUPPORTED = ['ar', 'en'];
  const DEFAULT_LOCALE = 'ar';

  // خرائط BCP47 لكل لغة (للاستخدام مع Intl.*)
  const BCP47 = {
    ar: 'ar-EG',
    en: 'en-US'
  };

  let currentLocale = DEFAULT_LOCALE;
  let currentDict = null;
  const subscribers = [];

  // ---------- قراءة اللغة المحفوظة ----------
  function readStored() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v && SUPPORTED.indexOf(v) >= 0) return v;
    } catch (e) {}
    // افحص لغة المتصفح كمقياس أخير
    try {
      const nav = (navigator.language || 'ar').toLowerCase();
      if (nav.indexOf('en') === 0) return 'en';
    } catch (e) {}
    return DEFAULT_LOCALE;
  }

  // ---------- تطبيق القاموس ----------
  function loadDict(locale) {
    if (locale === 'ar') return global.SPi18n_ar || {};
    if (locale === 'en') return global.SPi18n_en || {};
    return {};
  }

  // ---------- تطبيق dir/lang على <html> ----------
  function applyHtmlAttrs(locale) {
    const isRtl = locale === 'ar';
    const html = document.documentElement;
    html.lang = locale;
    html.dir = isRtl ? 'rtl' : 'ltr';
    // عكّس أيقونات اتجاهية تلقائيًا في RTL
    if (isRtl) html.setAttribute('data-rtl', 'true');
    else html.removeAttribute('data-rtl');
  }

  // ---------- محوّل المتغيرات ----------
  // يبدل {name} بالقيمة من vars
  function interpolate(str, vars) {
    if (!vars) return str;
    if (typeof str !== 'string') return str;
    return str.replace(/\{(\w+)\}/g, (m, key) => {
      return (vars[key] !== undefined) ? String(vars[key]) : m;
    });
  }

  // ---------- الدالة الأساسية t ----------
  // قاعدة الـ fallback:
  // 1) القاموس الحالي أولًا.
  // 2) في الوضع العربي فقط: fallback للإنجليزية لو المفتاح ناقص.
  // 3) في الوضع الإنجليزي: يُمنع منعًا باتًا عرض العربية —
  //    نرجّع المفتاح نفسه (تشخيص) بدل أي نص عربي.
  // وحدة القاموسين مضمونة عبر scripts/check-i18n.js (تطابق 1:1).
  function t(key, vars) {
    if (!currentDict) currentDict = loadDict(currentLocale);
    let val = currentDict[key];
    if (val == null && currentLocale !== 'en' && global.SPi18n_en) {
      val = global.SPi18n_en[key];
    }
    if (val == null) {
      // لا تعرض مفاتيح الترجمة الخام للمستخدم؛ أظهر نصًا فارغًا بدلًا منها.
      return '';
    }
    return interpolate(val, vars);
  }

  // ---------- القراءة/الكتابة ----------
  function getLocale() {
    return currentLocale;
  }

  function isRtl() {
    return currentLocale === 'ar';
  }

  function setLocale(locale, options) {
    options = options || {};
    if (SUPPORTED.indexOf(locale) < 0) locale = DEFAULT_LOCALE;
    if (locale === currentLocale && !options.force) return;
    currentLocale = locale;
    currentDict = loadDict(locale);
    try { localStorage.setItem(STORAGE_KEY, locale); } catch (e) {}
    applyHtmlAttrs(locale);
    // تنبيه المشتركين
    subscribers.forEach((cb) => {
      try { cb(locale); } catch (e) { console.error('[i18n] subscriber error', e); }
    });
    // إعادة تطبيق ترجمات الـ DOM تلقائيًا
    try { apply(document); } catch (e) { console.error('[i18n] apply error', e); }
  }

  function toggleLocale() {
    setLocale(currentLocale === 'ar' ? 'en' : 'ar');
  }

  // ---------- Pub/Sub ----------
  function subscribe(cb) {
    subscribers.push(cb);
    return () => {
      const i = subscribers.indexOf(cb);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  // ---------- Intl-based formatting ----------
  // إصدار مختصر من BCP47 للوكل الحالي
  function bcp47() {
    return BCP47[currentLocale] || BCP47[DEFAULT_LOCALE];
  }

  function formatDate(date, opts) {
    opts = opts || { day: 'numeric', month: 'long', year: 'numeric' };
    try {
      return new Intl.DateTimeFormat(bcp47(), opts).format(date);
    } catch (e) {
      // fallback بسيط
      const d = new Date(date);
      return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
    }
  }

  function formatWeekday(date, opts) {
    opts = opts || { weekday: 'long' };
    try {
      return new Intl.DateTimeFormat(bcp47(), opts).format(date);
    } catch (e) {
      return '';
    }
  }

  function formatTime(date, opts) {
    opts = opts || { hour: '2-digit', minute: '2-digit', hour12: false };
    try {
      return new Intl.DateTimeFormat(bcp47(), opts).format(date);
    } catch (e) {
      const d = new Date(date);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
  }

  function formatCurrency(amount, currency) {
    if (isNaN(amount)) amount = 0;
    currency = currency || 'EGP';
    try {
      return new Intl.NumberFormat(bcp47(), {
        style: 'currency',
        currency: currency,
        maximumFractionDigits: 0
      }).format(amount);
    } catch (e) {
      // fallback: رقم + رمز العملة المحلي
      return Number(amount).toLocaleString('en-US') + ' ' + (currentLocale === 'ar' ? 'ج' : 'EGP');
    }
  }

  function formatNumber(n, decimals) {
    if (isNaN(n)) n = 0;
    if (decimals == null) decimals = 0;
    try {
      return new Intl.NumberFormat(bcp47(), {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(n);
    } catch (e) {
      return String(n);
    }
  }

  // ---------- أسماء الشهور والأيام حسب اللغة الحالية ----------
  // بتُرجع مصفوفات مفهرسة 0-11 (شهور) و0-6 (أيام تبدأ من الأحد)
  function getMonthName(i) {
    if (currentLocale === 'ar') {
      const ar = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
      return ar[i] || '';
    }
    const en = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return en[i] || '';
  }

  function getMonthShort(i) {
    if (currentLocale === 'ar') {
      const ar = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
      return ar[i] || '';
    }
    const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return en[i] || '';
  }

  function getWeekdayName(i) {
    if (currentLocale === 'ar') {
      const ar = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      return ar[i] || '';
    }
    const en = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return en[i] || '';
  }

  function getWeekdayShort(i) {
    if (currentLocale === 'ar') {
      const ar = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
      return ar[i] || '';
    }
    const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return en[i] || '';
  }

  // ---------- Hijri formatting حسب اللغة ----------
  let _hijriFmt = null;
  let _hijriLocale = null;
  // Intl بيرجّع اللاحقة أصلًا ("هـ" في العربية و "AH" في الإنجليزية)
  // فنتأكد من عدم تكرارها
  function dedupeHijriSuffix(formatted, suffix) {
    if (!suffix) return formatted;
    if (formatted.indexOf(suffix.trim()) >= 0) return formatted;
    return formatted + suffix;
  }
  const hijriMonths = {
    ar: [
      'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
      'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
      'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
    ],
    en: [
      'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
      'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
      'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah'
    ]
  };
  const hijriMonthNumberFmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura-nu-latn', {
    month: 'numeric'
  });
  function formatHijri(date) {
    try {
      const loc = currentLocale === 'en'
        ? 'en-US-u-ca-islamic-umalqura'
        : 'ar-SA-u-ca-islamic-umalqura';
      if (_hijriFmt == null || _hijriLocale !== loc) {
        try {
          _hijriFmt = new Intl.DateTimeFormat(loc, {
            day: 'numeric', month: 'numeric', year: 'numeric'
          });
        } catch (e) {
          _hijriFmt = new Intl.DateTimeFormat(loc.replace('-umalqura', ''), {
            day: 'numeric', month: 'numeric', year: 'numeric'
          });
        }
        _hijriLocale = loc;
      }

      const monthNumber = Number(hijriMonthNumberFmt.format(date));
      const monthName = hijriMonths[currentLocale === 'en' ? 'en' : 'ar'][monthNumber - 1];
      const parts = _hijriFmt.formatToParts(date).map(part => {
        if (part.type === 'month' && monthName) return monthName;
        return part.value;
      });
      const formatted = parts.join('');
      const suffix = currentLocale === 'ar' ? ' هـ' : ' AH';
      return dedupeHijriSuffix(formatted, suffix);
    } catch (e) {
      return '';
    }
  }

  // ---------- تنسيق الوقت بصيغة 12 ساعة مع AM/PM أو ص/م ----------
  let _time12Fmt = null;
  function fmtTime12(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return '';
    const parts = hhmm.split(':');
    if (parts.length < 2) return '';
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return '';
    const period = h < 12 ? (currentLocale === 'ar' ? 'ص' : 'AM') : (currentLocale === 'ar' ? 'م' : 'PM');
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + String(m).padStart(2, '0') + ' ' + period;
  }

  // ---------- تطبيق [data-i18n] على DOM ----------
  function apply(root) {
    root = root || document;
    // ترجمة النص الداخلي
    const nodes = root.querySelectorAll('[data-i18n]');
    nodes.forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (!key) return;
      const varsAttr = node.getAttribute('data-i18n-vars');
      let vars = null;
      if (varsAttr) {
        try { vars = JSON.parse(varsAttr); } catch (e) {}
      }
      node.textContent = t(key, vars);
    });
    // ترجمة placeholder
    const phNodes = root.querySelectorAll('[data-i18n-placeholder]');
    phNodes.forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      if (!key) return;
      node.setAttribute('placeholder', t(key));
    });
    // ترجمة aria-label
    const ariaNodes = root.querySelectorAll('[data-i18n-aria]');
    ariaNodes.forEach((node) => {
      const key = node.getAttribute('data-i18n-aria');
      if (!key) return;
      node.setAttribute('aria-label', t(key));
    });
    // ترجمة title
    const titleNodes = root.querySelectorAll('[data-i18n-title]');
    titleNodes.forEach((node) => {
      const key = node.getAttribute('data-i18n-title');
      if (!key) return;
      node.setAttribute('title', t(key));
    });
    // ترجمة value (للأزرار inputs)
    const valNodes = root.querySelectorAll('[data-i18n-value]');
    valNodes.forEach((node) => {
      const key = node.getAttribute('data-i18n-value');
      if (!key) return;
      node.setAttribute('value', t(key));
    });
  }

  // ---------- التهيئة ----------
  function init() {
    currentLocale = readStored();
    currentDict = loadDict(currentLocale);
    applyHtmlAttrs(currentLocale);
    // تطبيق الترجمات بعد تحميل DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => apply(document));
    } else {
      apply(document);
    }
  }

  // ---------- Public API ----------
  global.SPi18n = {
    SUPPORTED,
    DEFAULT_LOCALE,
    STORAGE_KEY,
    init,
    t,
    getLocale,
    setLocale,
    toggleLocale,
    isRtl,
    subscribe,
    apply,
    formatDate,
    formatWeekday,
    formatTime,
    formatCurrency,
    formatNumber,
    getMonthName,
    getMonthShort,
    getWeekdayName,
    getWeekdayShort,
    formatHijri,
    fmtTime12
  };

  // شغّل التهيئة فور تحميل السكربت
  init();
})(window);
