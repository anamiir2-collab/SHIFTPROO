/* ShiftPro - Smart Notifications (بدون سيرفر)
   تنبيهات محلية بالكامل عبر Notification API + Service Worker + setTimeout.

   المميزات:
   - تنبيه نسيان تسجيل الانصراف (بعد 12 ساعة من الحضور)
   - تذكير قبل الوردية بـ 15/30/60 دقيقة (قابل للتخصيص)
   - ملخص يومي آخر اليوم: "سجلت 8 ساعات، إضافي 1.5، متوقع X ج"
   - fallback: لو الإشعارات مش مدعومة → تذكير داخل التطبيق

   exposes: window.SPNotifications
*/
(function (global) {
  'use strict';

  const SETTING_KEY = 'shifpro_notif_settings_v2';
  const LAST_NOTIFIED_KEY = 'shifpro_notif_last_v2';

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // الإعدادات الافتراضية
  const DEFAULTS = {
    enabled: true,
    forgetCheckoutHours: 12,    // تنبيه نسيان الانصراف بعد 12 ساعة
    shiftReminder: true,
    shiftReminderMinutes: 30,    // 15/30/60
    shiftEndReminder: true,
    upcomingLeaveReminder: true,
    dailySummary: true,
    dailySummaryTime: '20:00',  // 8 مساءً
    lastShown: {}                // {key: timestamp} لمنع التكرار
  };

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function safeWrite(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function getSettings() {
    const stored = safeRead(SETTING_KEY, {});
    return Object.assign({}, DEFAULTS, stored, {
      lastShown: Object.assign({}, (stored.lastShown || {}))
    });
  }
  function saveSettings(patch) {
    const cur = getSettings();
    const next = Object.assign({}, cur, patch);
    if (patch.lastShown) next.lastShown = Object.assign({}, cur.lastShown, patch.lastShown);
    safeWrite(SETTING_KEY, next);
    return next;
  }

  // ---------- صلاحيات الإشعارات ----------
  async function requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const r = await Notification.requestPermission();
      return r === 'granted';
    } catch (e) { return false; }
  }
  function isSupported() {
    return ('Notification' in window);
  }
  function isGranted() {
    return isSupported() && Notification.permission === 'granted';
  }

  // ---------- إظهار إشعار ----------
  async function show(title, body, options) {
    options = options || {};
    const s = getSettings();
    if (!s.enabled) return false;

    // fallback: لو الإشعارات مش مدعومة، اعرض toast داخل التطبيق
    if (!isSupported() || Notification.permission !== 'granted') {
      if (global.SPUtils && SPUtils.toast) {
        SPUtils.toast(title + ' — ' + body, 'info');
      }
      return false;
    }

    try {
      // جرّب service worker notification
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, {
            body: body,
            icon: './icon-192.png',
            badge: './favicon-32.png',
            tag: options.tag || 'shiftpro',
            requireInteraction: options.requireInteraction || false,
            data: options.data || {}
          });
          return true;
        }
      }
      // fallback: Notification constructor
      if (isSupported()) {
        const n = new Notification(title, {
          body: body,
          icon: './icon-192.png',
          tag: options.tag || 'shiftpro',
          data: options.data || {}
        });
        setTimeout(() => n.close(), options.duration || 8000);
        return true;
      }
    } catch (e) {
      console.error('[Notif] show error', e);
      if (global.SPUtils && SPUtils.toast) {
        SPUtils.toast(title + ' — ' + body, 'info');
      }
    }
    return false;
  }

  // ---------- تنبيه: نسيان تسجيل الانصراف ----------
  // يتفحص: لو فيه حضور من 12+ ساعة بدون انصراف
  function checkForgotCheckout() {
    const s = getSettings();
    if (!s.enabled) return;
    if (!global.SPStorage || !global.SPUtils) return;
    const today = new Date();
    const dstr = SPUtils.fmtDate(today);
    const entry = SPStorage.getEntry(dstr);
    if (!entry) return;
    // لو الحضور موجود والانصراف لأ
    if ((entry.status === 'A' || entry.status === 'X') && entry.from && !entry.to) {
      // احسب الوقت المنقضي
      const fromTime = new Date(dstr + 'T' + entry.from + ':00');
      const elapsed = (today - fromTime) / 3600000; // ساعات
      if (elapsed >= s.forgetCheckoutHours) {
        // تجنّب التكرار: نفس اليوم ما نعرضش أكتر من مرة كل ساعة
        const key = 'forgot_checkout_' + dstr;
        const last = s.lastShown[key] || 0;
        if (Date.now() - last > 3600000) { // 1 ساعة
          saveSettings({ lastShown: { [key]: Date.now() } });
          const title = t('attendance.checkout_now');
          const body = t('notif.forgot_body', { time: SPUtils.fmtTime12(entry.from) });
          show(title, body, { tag: 'forgot_checkout', requireInteraction: true });
        }
      }
    }
  }

  // ---------- تنبيه: اقتراب بداية الوردية ----------
  function checkShiftReminder() {
    const s = getSettings();
    if (!s.enabled || !s.shiftReminder || !global.SPStorage || !global.SPUtils) return;
    const now = new Date();
    const dstr = SPUtils.fmtDate(now);
    const code = SPStorage.getScheduledCode(dstr);
    if (!code) return;
    const shift = SPStorage.getShiftByCode(code);
    if (!shift || !shift.startTime || shift.isWorkDay === false) return;

    const startsAt = new Date(dstr + 'T' + shift.startTime + ':00');
    const remainingMs = startsAt.getTime() - now.getTime();
    const leadMs = Math.max(1, Number(s.shiftReminderMinutes) || 30) * 60000;
    if (remainingMs <= 0 || remainingMs > leadMs) return;

    const key = 'shift_reminder_' + dstr;
    if (s.lastShown[key]) return;
    saveSettings({ lastShown: { [key]: Date.now() } });
    show(t('attendance.checkin_now') + ' — ' + shift.name, t('notif.shift_soon_body', {
      shift: shift.name,
      min: s.shiftReminderMinutes || 30,
      time: SPUtils.fmtTime12(shift.startTime)
    }), { tag: key });
  }

  // ---------- تنبيه: نهاية الوردية ----------
  function checkShiftEndReminder() {
    const s = getSettings();
    if (!s.enabled || s.shiftEndReminder === false || !global.SPStorage || !global.SPUtils) return;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // افحص وردية اليوم ووردية أمس أيضًا لدعم الورديات الليلية التي تنتهي بعد منتصف الليل.
    [new Date(today.getTime() - 86400000), today].forEach((shiftDate) => {
      const shiftDateStr = SPUtils.fmtDate(shiftDate);
      const code = SPStorage.getScheduledCode(shiftDateStr);
      if (!code) return;
      const shift = SPStorage.getShiftByCode(code);
      if (!shift || !shift.endTime) return;

      const end = new Date(shiftDateStr + 'T' + shift.endTime + ':00');
      if (shift.startTime && shift.endTime <= shift.startTime) end.setDate(end.getDate() + 1);
      const elapsedMs = now.getTime() - end.getTime();
      if (elapsedMs < 0 || elapsedMs > 5 * 60000) return;

      const entry = SPStorage.getEntry(shiftDateStr);
      if (entry && entry.to) return;
      const key = 'shift_end_' + shiftDateStr;
      if (s.lastShown[key]) return;
      saveSettings({ lastShown: { [key]: Date.now() } });
      show(t('notif.shift_end_title'), t('notif.shift_end_body', {
        time: SPUtils.fmtTime12(shift.endTime),
        shift: shift.name || ''
      }), { tag: key, requireInteraction: true });
    });
  }

  // ---------- تنبيه: إجازة معتمدة غدًا ----------
  function checkUpcomingLeaveReminder() {
    const s = getSettings();
    if (!s.enabled || s.upcomingLeaveReminder === false || !global.SPLeaves || !global.SPUtils) return;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dstr = SPUtils.fmtDate(tomorrow);
    const requests = typeof SPLeaves.getRequestsForDate === 'function' ? (SPLeaves.getRequestsForDate(dstr) || []) : [];
    const approved = requests.find((request) => request && request.status === 'approved');
    if (!approved) return;

    const key = 'upcoming_leave_' + dstr;
    if (s.lastShown[key]) return;
    saveSettings({ lastShown: { [key]: Date.now() } });
    const typeName = typeof SPLeaves.getTypeName === 'function' ? SPLeaves.getTypeName(approved.type) : (approved.type || '');
    show(t('notif.leave_tomorrow_title'), t('notif.leave_tomorrow_body', {
      type: typeName,
      date: dstr
    }), { tag: key });
  }

  // ---------- تنبيه: ملخص يومي ----------
  function checkDailySummary() {
    const s = getSettings();
    if (!s.enabled || !s.dailySummary) return;
    if (!global.SPStorage || !global.SPUtils) return;

    const now = new Date();
    const nowHHMM = SPUtils.nowHHMM();
    // لو الوقت الحالي بعد ملخص وقت اليوم (مثلاً 8 مساءً)
    if (nowHHMM < s.dailySummaryTime) return;

    const dstr = SPUtils.fmtDate(now);
    const key = 'daily_summary_' + dstr;
    const last = s.lastShown[key] || 0;
    if (Date.now() - last > 86400000) {
      saveSettings({ lastShown: { [key]: Date.now() } });
      const entry = SPStorage.getEntry(dstr);
      if (!entry) return;
      const hours = (global.SPAttendance && SPAttendance.computeActualHours)
        ? SPAttendance.computeActualHours(entry) : 0;
      const overtime = (global.SPAttendance && SPAttendance.computeOvertimeHours)
        ? SPAttendance.computeOvertimeHours(now, entry) : 0;
      const value = (global.SPAttendance && SPAttendance.dayValue)
        ? SPAttendance.dayValue(now, entry) : 0;

      const title = t('notif.daily_title');
      const body = t('notif.daily_body', {
        hours: SPUtils.fmtHours(hours),
        overtime: SPUtils.fmtHours(overtime),
        value: SPUtils.fmtCurrency(value)
      });
      show(title, body, { tag: 'daily_summary_' + dstr });
    }
  }

  // ---------- تنبيه: إجازة رسمية اليوم (opt-in) ----------
  // يعمل مرة واحدة يوميًا فقط، وبتوقيت الصباح، وبعد تفعيل
  // "تذكير بالإجازات الرسمية" من الإعدادات (التاريخ والوقت).
  function checkHolidayReminder() {
    const s = getSettings();
    if (!s.enabled) return;
    if (!global.SPStorage || !global.SPUtils) return;

    // الإعداد الأساسي في SPStorage — opt-in افتراضيًا
    let holidayReminder = false;
    try {
      holidayReminder = !!SPStorage.getSettings().holidayReminder;
    } catch (e) {}
    if (!holidayReminder) return;

    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.getOfficialHoliday !== 'function'
    ) {
      return;
    }

    const today = new Date();
    const dstr = SPUtils.fmtDate(today);

    let holiday = null;
    try {
      // احترم خيار الإظهار أيضًا
      const main = SPStorage.getSettings();
      if (main.showHolidays === false) return;
      holiday = SPOfficialHolidays.getOfficialHoliday(dstr);
    } catch (e) {}
    if (!holiday) return;

    const key = 'holiday_reminder_' + dstr;
    const last = s.lastShown[key] || 0;
    if (Date.now() - last > 86400000) {
      saveSettings({ lastShown: { [key]: Date.now() } });

      let name = holiday.name || '';
      if (typeof SPOfficialHolidays.getHolidayLocalizedName === 'function') {
        name = SPOfficialHolidays.getHolidayLocalizedName(holiday);
      }

      const title = t('holiday.reminder_title');
      const body = t('holiday.reminder_body', { name: name });
      show(title, body, { tag: 'holiday_reminder_' + dstr });
    }
  }

  // ---------- جدولة الفحص الدوري ----------
  let intervalId = null;
  function start() {
    if (intervalId) clearInterval(intervalId);
    // كل دقيقتين (120000ms) افحص التنبيهات الذكية
    intervalId = setInterval(() => {
      try {
        checkForgotCheckout();
        checkShiftReminder();
        checkShiftEndReminder();
        checkUpcomingLeaveReminder();
        checkDailySummary();
        checkHolidayReminder();
      } catch (e) {
        console.error('[Notif] tick error', e);
      }
    }, 120000);
    // فحص فوري بعد التشغيل
    setTimeout(() => {
      try {
        checkForgotCheckout();
        checkShiftReminder();
        checkShiftEndReminder();
        checkUpcomingLeaveReminder();
        checkDailySummary();
        checkHolidayReminder();
      } catch (e) {}
    }, 3000);
  }
  function stop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  // ---------- Initialize ----------
  function init() {
    const s = getSettings();
    if (!s.enabled) return;
    if (!isSupported()) {
      console.warn('[Notif] Notifications API not supported');
      return;
    }
    // لو الإذن مُعطى بالفعل، ابدأ الفحص
    if (Notification.permission === 'granted') {
      start();
    }
    // استمع لتغيّر الإذن
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' }).then((perm) => {
        perm.onchange = () => {
          if (perm.state === 'granted') start();
          else stop();
        };
      }).catch(() => {});
    }
  }

  // ---------- في app open: تنبيهات مَفواتها ----------
  function checkMissedOnOpen() {
    // لما المستخدم يفتح التطبيق، افحص إذا كان فاتته تنبيهات أثناء غيابه
    try {
      checkForgotCheckout();
      checkDailySummary();
      checkHolidayReminder();
    } catch (e) {}
  }

  global.SPNotifications = {
    DEFAULTS,
    getSettings,
    saveSettings,
    isSupported,
    isGranted,
    requestPermission,
    show,
    checkForgotCheckout,
    checkShiftReminder,
    checkShiftEndReminder,
    checkUpcomingLeaveReminder,
    checkDailySummary,
    checkHolidayReminder,
    checkMissedOnOpen,
    start,
    stop,
    init
  };
})(window);
