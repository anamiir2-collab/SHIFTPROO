/* ShiftPro - Utilities
   Pure helpers — depends only on SPi18n (loaded earlier).
   Exposes: window.SPUtils
*/
(function (global) {
  'use strict';

  // اختصار لدالة الترجمة (لو الـ i18n محمّل)
  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // ---------- DOM ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'dataset') {
          for (const d in attrs.dataset) node.dataset[d] = attrs.dataset[d];
        } else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else if (k === 'html') {
          node.innerHTML = attrs[k];
        } else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      });
    }
    return node;
  }

  // ---------- Date helpers ----------
  // All internal dates use 'YYYY-MM-DD' strings (Gregorian)
  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function todayStr() {
    return fmtDate(new Date());
  }
  function sameDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }
  function dayDiff(a, b) {
    const MS = 86400000;
    const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((da - db) / MS);
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // أسماء الشهور والأيام — بتُرجع حسب اللغة الحالية
  // (محفوظة للأسماء الثابتة للوصول السريع)
  const monthNamesAr = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];
  const monthShortAr = [
    'ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون',
    'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'
  ];
  const weekdayNamesAr = [
    'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'
  ];
  const weekdayShortAr = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  // وكلاء حسب اللغة الحالية (للتوافق مع الاستخدام القديم monthNamesAr[i])
  // بتحوّل الوصول من monthNamesAr[i] إلى استدعاء دالة
  function monthNames(i) {
    return global.SPi18n ? SPi18n.getMonthName(i) : monthNamesAr[i];
  }
  function monthShort(i) {
    return global.SPi18n ? SPi18n.getMonthShort(i) : monthShortAr[i];
  }
  function weekdayNames(i) {
    return global.SPi18n ? SPi18n.getWeekdayName(i) : weekdayNamesAr[i];
  }
  function weekdayShort(i) {
    return global.SPi18n ? SPi18n.getWeekdayShort(i) : weekdayShortAr[i];
  }

  // ---------- Hijri date (بيدعم اللغة الحالية) ----------
  function formatHijri(date) {
    if (global.SPi18n) return SPi18n.formatHijri(date);
    // fallback لو i18n مش محمّل
    let _hijriFmt = null;
    try {
      if (!_hijriFmt) {
        try {
          _hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
            day: 'numeric', month: 'long', year: 'numeric'
          });
        } catch (e) {
          _hijriFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
            day: 'numeric', month: 'long', year: 'numeric'
          });
        }
      }
      const out = _hijriFmt.format(date);
      // Intl بيرجّع "هـ" أصلًا — نتجنب تكرار اللاحقة
      return out.indexOf('هـ') >= 0 ? out : out + ' هـ';
    } catch (e) {
      return '';
    }
  }

  // ---------- Time helpers ----------
  // 'HH:MM' -> minutes since midnight
  function timeToMin(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const parts = hhmm.split(':');
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  // minutes since midnight -> 'HH:MM'
  function minToTime(min) {
    if (min == null || isNaN(min)) return '';
    while (min < 0) min += 24 * 60;
    min = min % (24 * 60);
    const h = Math.floor(min / 60);
    const m = Math.floor(min % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  // Difference in minutes between two 'HH:MM' values.
  // Handles crossing midnight: end <= start means end is next day.
  function timeDiffMin(start, end) {
    const s = timeToMin(start);
    const e = timeToMin(end);
    if (s == null || e == null) return 0;
    let diff = e - s;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  }
  // hours between two 'HH:MM' values, rounded to 2 decimals
  function computeRangeHours(from, to) {
    const min = timeDiffMin(from, to);
    return Math.round((min / 60) * 100) / 100;
  }
  function fmtTime12(hhmm) {
    if (global.SPi18n) return SPi18n.fmtTime12(hhmm);
    if (!hhmm) return '';
    const m = timeToMin(hhmm);
    if (m == null) return '';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const period = h < 12 ? 'ص' : 'م';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + String(mm).padStart(2, '0') + ' ' + period;
  }
  function nowHHMM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return fmtDate(d) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (e) { return ''; }
  }

  // ---------- Number / currency formatting (حسب اللغة) ----------
  function fmtNum(n, decimals) {
    if (global.SPi18n) return SPi18n.formatNumber(n, decimals);
    if (decimals == null) decimals = 0;
    if (isNaN(n)) n = 0;
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }
  function fmtCurrency(n) {
    if (global.SPi18n) return SPi18n.formatCurrency(n);
    return fmtNum(Math.round(n)) + ' ج';
  }
  function fmtHours(n) {
    // وحدة الساعات حسب اللغة
    const unit = (global.SPi18n && SPi18n.getLocale() === 'ar') ? ' س' : ' h';
    return fmtNum(n, n % 1 === 0 ? 0 : 2) + unit;
  }

  // ---------- اسم الوردية المعروض (يترجم أسماء الورديات المدمجة) ----------
  // الورديات المدمجة (نهار/ليل/إجازة دورية/مطبق) تُعرض بالإنجليزية
  // في الوضع الإنجليزي عبر nameEn — الورديات المخصصة تبقى كما كتبها المستخدم.
  function shiftDisplayName(shift) {
    if (!shift) return '';
    if (
      global.SPi18n &&
      SPi18n.getLocale() === 'en' &&
      shift.isBuiltIn &&
      shift.nameEn
    ) {
      return shift.nameEn;
    }
    return shift.name || '';
  }

  // ---------- Misc ----------
  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms || 200);
    };
  }
  function uuid() {
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function deepClone(obj) {
    if (obj == null) return obj;
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (e) { return obj; }
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(message, type) {
    let host = document.getElementById('sp-toast-host');
    if (!host) {
      host = el('div', { id: 'sp-toast-host', class: 'sp-toast-host', 'aria-live': 'polite' });
      document.body.appendChild(host);
    }
    host.innerHTML = '';
    const t = el('div', { class: 'sp-toast toast-' + (type || 'info') }, [message]);
    host.appendChild(t);
    // Animate in
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { if (host.firstChild === t) t.remove(); }, 300);
    }, 2400);
  }

  // ---------- Confirm dialog (promise-based, بيدعم اللغة) ----------
  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const overlay = el('div', { class: 'sp-confirm-overlay show' });
      const box = el('div', { class: 'sp-confirm-box' });
      const title = el('div', { class: 'sp-confirm-title' }, [opts.title || t('msg.confirm_delete')]);
      const msg = el('div', { class: 'sp-confirm-msg' }, [message]);
      const btns = el('div', { class: 'sp-confirm-btns' });
      const cancelBtn = el('button', { class: 'sp-btn sp-btn-ghost' }, [opts.cancelText || t('common.cancel')]);
      const okBtn = el('button', { class: 'sp-btn ' + (opts.danger ? 'sp-btn-danger' : 'sp-btn-primary') }, [opts.okText || t('common.confirm')]);
      btns.appendChild(cancelBtn);
      btns.appendChild(okBtn);
      box.appendChild(title);
      box.appendChild(msg);
      box.appendChild(btns);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      requestAnimationFrame(() => box.classList.add('show'));

      function close(value) {
        box.classList.remove('show');
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 220);
        resolve(value);
      }
      cancelBtn.addEventListener('click', () => close(false));
      okBtn.addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
    });
  }

  // ---------- Haptic feedback (Android) ----------
  function haptic(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern || 12);
    } catch (e) {}
  }

  // ---------- Prevent double-click ----------
  function onClickOnce(handler, minIntervalMs) {
    let last = 0;
    const ms = minIntervalMs || 250;
    return function (e) {
      const now = Date.now();
      if (now - last < ms) return;
      last = now;
      handler.call(this, e);
    };
  }

  // ---------- Download helper ----------
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ---------- Public API ----------
  global.SPUtils = {
    $, $$, el,
    fmtDate, parseDate, todayStr, sameDay, dayDiff, addDays, startOfDay,
    // الأسماء الثابتة (للتوافق للخلف) + وكلاء حسب اللغة
    monthNamesAr, monthShortAr, weekdayNamesAr, weekdayShortAr,
    monthNames, monthShort, weekdayNames, weekdayShort,
    formatHijri,
    timeToMin, minToTime, timeDiffMin, computeRangeHours, fmtTime12, nowHHMM, fmtDateTime,
    fmtNum, fmtCurrency, fmtHours, shiftDisplayName,
    debounce, uuid, deepClone,
    toast, confirmDialog,
    haptic, onClickOnce,
    downloadBlob,
    // وصول مباشر لدالة الترجمة
    t
  };
})(window);
