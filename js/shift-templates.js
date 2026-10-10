/* ShiftPro - Shift Templates & Smart Repeat
   قوالب محفوظة + تكرار ذكي + إدخال جماعي.

   exposes: window.SPTemplates
*/
(function (global) {
  'use strict';

  // قوالب افتراضية (بتستخدم shifts اللي محفوظة بالفعل)
  const DEFAULT_TEMPLATES = [
    { id: 'tpl-morning',   name: 'صباحي',    nameKey: 'tpl.morning', shiftCode: 'D', color: '#60a5fa' },
    { id: 'tpl-evening',   name: 'مسائي',    nameKey: 'tpl.evening', shiftCode: 'D', color: '#fbbf24' },
    { id: 'tpl-night',     name: 'ليلي',     nameKey: 'tpl.night', shiftCode: 'N', color: '#2563eb' },
    { id: 'tpl-overtime',  name: 'أوفرتايم', nameKey: 'tpl.overtime', shiftCode: 'X', color: '#a855f7' }
  ];

  const TPL_KEY = 'shifpro_templates_v2';

  // قواعد التكرار المدعومة
  const REPEAT_TYPES = {
    DAILY: 'daily',          // كل يوم
    WEEKLY: 'weekly',        // كل أسبوع في أيام معينة
    WEEKDAYS: 'weekdays',    // أيام العمل (السبت-الأربعاء في مصر، أو Mon-Fri عالميًا)
    WEEKEND: 'weekend',      // الجمعة والسبت
    CUSTOM_DAYS: 'custom',   // أيام محددة من الأسبوع
    MONTHLY: 'monthly'       // كل شهر
  };

  // أيام الأسبوع (0=الأحد ... 6=السبت)
  const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // ---------- قراءة/كتابة آمنة ----------
  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function safeWrite(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) {
      if (global.SPUtils && SPUtils.toast) SPUtils.toast(t('msg.storage_full'), 'error');
      return false;
    }
  }

  // ---------- القوالب ----------
  function getTemplates() {
    const arr = safeRead(TPL_KEY, null);
    if (!Array.isArray(arr) || arr.length === 0) {
      safeWrite(TPL_KEY, DEFAULT_TEMPLATES.slice());
      return DEFAULT_TEMPLATES.slice();
    }
    return arr;
  }

  function getTemplateById(id) {
    return getTemplates().find((x) => x.id === id) || null;
  }

  function saveTemplate(tpl) {
    const arr = getTemplates();
    if (!tpl.id) tpl.id = 'tpl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const i = arr.findIndex((x) => x.id === tpl.id);
    if (i >= 0) arr[i] = tpl;
    else arr.push(tpl);
    safeWrite(TPL_KEY, arr);
    notifyChange();
    return tpl;
  }

  function deleteTemplate(id) {
    const arr = getTemplates().filter((x) => x.id !== id);
    safeWrite(TPL_KEY, arr);
    notifyChange();
  }

  // اسم القالب حسب اللغة الحالية
  function getTemplateName(tpl) {
    if (!tpl) return '';
    if (tpl.nameKey && global.SPi18n) return SPi18n.t(tpl.nameKey);
    return tpl.name || '';
  }

  // ---------- تطبيق قالب ----------
  // يطبّق shiftCode من startDate لمدة count يوم
  function applyTemplate(templateId, startDate, count) {
    const tpl = getTemplateById(templateId);
    if (!tpl || !tpl.shiftCode) return 0;
    return applyRepeatRule({
      shiftCode: tpl.shiftCode,
      startDate: startDate,
      endDate: addDaysISO(startDate, count - 1),
      type: REPEAT_TYPES.DAILY,
      customDays: null
    });
  }

  // ---------- إضافة أيام لتاريخ ISO ----------
  function addDaysISO(dstr, n) {
    const d = new Date(dstr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  // ---------- تطبيق قاعدة تكرار ----------
  // rule: { shiftCode, startDate, endDate, type, customDays }
  // customDays: مصفوفة أرقام من 0-6 تمثل أيام الأسبوع المختارة
  // رجّع عدد الأيام اللي اتطبّق عليها
  function applyRepeatRule(rule) {
    if (!rule || !rule.shiftCode || !rule.startDate || !rule.endDate) return 0;
    if (!global.SPStorage) return 0;
    if (rule.endDate < rule.startDate) return 0;

    const entries = {};
    let count = 0;
    let cur = rule.startDate;
    const maxIter = 400; // حد أقصى لمنع اللا نهائي
    let iter = 0;

    while (cur <= rule.endDate && iter < maxIter) {
      iter++;
      const d = new Date(cur + 'T00:00:00');
      const dayOfWeek = d.getDay();
      let shouldApply = false;
      switch (rule.type) {
        case REPEAT_TYPES.DAILY:
          shouldApply = true;
          break;
        case REPEAT_TYPES.WEEKDAYS:
          // أيام العمل: السبت (6) - الأربعاء (3) في مصر
          shouldApply = (dayOfWeek >= 6 || dayOfWeek <= 3);
          if (dayOfWeek === 6) shouldApply = true; // السبت
          if (dayOfWeek === 5) shouldApply = false; // الجمعة
          // بسيطة: Mon-Sat عدا الجمعة
          shouldApply = dayOfWeek !== 5;
          break;
        case REPEAT_TYPES.WEEKEND:
          shouldApply = (dayOfWeek === 5 || dayOfWeek === 6);
          break;
        case REPEAT_TYPES.WEEKLY:
        case REPEAT_TYPES.CUSTOM_DAYS:
          shouldApply = (rule.customDays && rule.customDays.indexOf(dayOfWeek) >= 0);
          break;
        case REPEAT_TYPES.MONTHLY:
          // نفس يوم الشهر
          const startDay = new Date(rule.startDate + 'T00:00:00').getDate();
          shouldApply = (d.getDate() === startDay);
          break;
        default:
          shouldApply = true;
      }
      if (shouldApply) {
        entries[cur] = rule.shiftCode;
        count++;
      }
      cur = addDaysISO(cur, 1);
    }

    if (count > 0) {
      SPStorage.setScheduleMany(entries);
      notifyChange();
    }
    return count;
  }

  // ---------- إدخال جماعي ----------
  // يطبّق نفس shiftCode على عدة أيام محددة
  function applyToDates(shiftCode, dateStrings) {
    if (!global.SPStorage || !shiftCode || !dateStrings) return 0;
    const entries = {};
    let count = 0;
    dateStrings.forEach((dstr) => {
      if (dstr) {
        entries[dstr] = shiftCode;
        count++;
      }
    });
    if (count > 0) {
      SPStorage.setScheduleMany(entries);
      notifyChange();
    }
    return count;
  }

  // ---------- نسخ وردية ليوم تاني ----------
  function copyShift(fromDate, toDate) {
    if (!global.SPStorage) return false;
    const code = SPStorage.getScheduledCode(fromDate);
    if (!code) return false;
    SPStorage.setSchedule(toDate, code);
    notifyChange();
    return true;
  }

  // ---------- Pub/Sub ----------
  const subscribers = [];
  function subscribe(cb) {
    subscribers.push(cb);
    return () => {
      const i = subscribers.indexOf(cb);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }
  function notifyChange() {
    subscribers.forEach((cb) => { try { cb(); } catch (e) { console.error('[Templates] sub error', e); } });
    if (global.SPApp && SPApp.onDataChange) {
      try { SPApp.onDataChange(); } catch (e) {}
    }
  }

  // ---------- Public API ----------
  global.SPTemplates = {
    DEFAULT_TEMPLATES,
    REPEAT_TYPES,
    WEEKDAYS,
    getTemplates,
    getTemplateById,
    saveTemplate,
    deleteTemplate,
    getTemplateName,
    applyTemplate,
    applyRepeatRule,
    applyToDates,
    copyShift,
    subscribe,
    addDaysISO
  };
})(window);
