/* ShiftPro - Leaves Module
   نظام إجازات كامل — كل البيانات محلية في localStorage.

   المميزات:
   - 8 أنواع إجازة (سنوية، عارضة، مرضية، بدون راتب، أمومة، خاصة، تعويضية، دورية)
   - طلب إجازة: نوع + من تاريخ + لتاريخ + سبب + ملاحظة + حالة
   - حالة الطلب: معلّق / مقبول / مرفوض
   - إجازة نص يوم (صباحي/مسائي) وإجازة بالساعات
   - خصم تلقائي من الرصيد عند الموافقة
   - عرض المتبقي لكل نوع
   - خيار ترحيل الرصيد للسنة الجاية (carryover)
   - لو في وردية مجدولة في يوم إجازة → تُتجاهل تلقائيًا
   - تقرير سنوي مستقل + أرشيف

   exposes: window.SPLeaves
*/
(function (global) {
  'use strict';

  // أنواع الإجازات المدعومة (المعرف المختصر + الأسماء عبر i18n)
  const LEAVE_TYPES = [
    { id: 'annual',       color: '#3b82f6', paid: true,  defaultBalance: 21,  key: 'leave.annual' },
    { id: 'casual',       color: '#06b6d4', paid: true,  defaultBalance: 7,   key: 'leave.casual' },
    { id: 'sick',         color: '#ef4444', paid: true,  defaultBalance: 30,  key: 'leave.sick' },
    { id: 'unpaid',       color: '#6b7280', paid: false, defaultBalance: 0,   key: 'leave.unpaid' },
    { id: 'maternity',    color: '#ec4899', paid: true,  defaultBalance: 90,  key: 'leave.maternity' },
    { id: 'special',      color: '#f59e0b', paid: true,  defaultBalance: 3,   key: 'leave.special' },
    { id: 'compensatory', color: '#8b5cf6', paid: true,  defaultBalance: 0,   key: 'leave.compensatory' },
    { id: 'periodic',     color: '#0ea5e9', paid: true,  defaultBalance: 0,   key: 'leave.periodic' }
  ];

  // حالات الطلب
  const STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
  };

  // دالة i18n مساعدة
  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // اسم نوع الإجازة حسب اللغة الحالية
  function getTypeName(typeId) {
    const type = LEAVE_TYPES.find((x) => x.id === typeId);
    if (!type) return typeId;
    return t(type.key);
  }

  function getTypeColor(typeId) {
    const type = LEAVE_TYPES.find((x) => x.id === typeId);
    return type ? type.color : '#3b82f6';
  }

  function isPaid(typeId) {
    const type = LEAVE_TYPES.find((x) => x.id === typeId);
    return type ? type.paid : false;
  }

  // =====================================================
  // دوال التخزين (تتكلم مع SPStorage)
  // =====================================================

  // مفتاح طلبات الإجازات
  const REQ_KEY = 'shifpro_leave_requests_v2';
  // مفتاح أرشيف السنوات السابقة
  const ARCHIVE_KEY = 'shifpro_leave_archive_v2';

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Leaves] read error', key, e);
      return fallback;
    }
  }

  function safeWrite(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.error('[Leaves] write error', key, e);
      if (global.SPUtils && SPUtils.toast) {
        SPUtils.toast(t('msg.storage_full'), 'error');
      }
      return false;
    }
  }

  // =====================================================
  // طلبات الإجازات
  // =====================================================

  function getRequests() {
    const arr = safeRead(REQ_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function getRequestById(id) {
    return getRequests().find((r) => r.id === id) || null;
  }

  function getRequestsForDate(dstr) {
    // رجّع كل الطلبات اللي بتمر في تاريخ معين
    return getRequests().filter((r) => {
      if (r.status !== STATUS.APPROVED) return false;
      const from = r.fromDate;
      const to = r.toDate || r.fromDate;
      return dstr >= from && dstr <= to;
    });
  }

  function getRequestsForRange(fromStr, toStr) {
    return getRequests().filter((r) => {
      const from = r.fromDate;
      const to = r.toDate || r.fromDate;
      // تداخل الفترات
      return from <= toStr && to >= fromStr;
    });
  }

  // حساب عدد أيام الإجازة (يدعم نص يوم)
  function countLeaveDays(req) {
    if (!req || !req.fromDate) return 0;
    const from = new Date(req.fromDate);
    const to = req.toDate ? new Date(req.toDate) : from;
    if (isNaN(from) || isNaN(to)) return 0;
    const ms = to - from;
    const days = Math.floor(ms / 86400000) + 1;
    if (days < 1) return 1;
    // نص يوم
    if (req.halfDay) return days - 0.5;
    // بالساعات
    if (req.hours && req.hours > 0) {
      return Math.min(days, req.hours / 8);
    }
    return days;
  }

  // إضافة طلب جديد
  function addRequest(payload) {
    const reqs = getRequests();
    const req = {
      id: 'lv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      type: payload.type || 'annual',
      fromDate: payload.fromDate,
      toDate: payload.toDate || payload.fromDate,
      halfDay: !!payload.halfDay,
      halfPeriod: payload.halfPeriod || 'morning', // morning | evening
      hours: Number(payload.hours) || 0,
      reason: payload.reason || '',
      note: payload.note || '',
      status: payload.status || STATUS.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    reqs.push(req);
    if (window.SPUndoRedo) SPUndoRedo.pushUndo("leave change");

    safeWrite(REQ_KEY, reqs);
    notifyChange();
    return req;
  }

  function updateRequest(id, patch) {
    const reqs = getRequests();
    const i = reqs.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const oldStatus = reqs[i].status;
    const updated = Object.assign({}, reqs[i], patch, {
      updatedAt: new Date().toISOString()
    });
    reqs[i] = updated;
    if (window.SPUndoRedo) SPUndoRedo.pushUndo("leave change");

    safeWrite(REQ_KEY, reqs);

    // لو الطلب اتوافق عليه، طبّقه على attendance (status = L)
    if (oldStatus !== STATUS.APPROVED && updated.status === STATUS.APPROVED) {
      applyApprovedToAttendance(updated);
    }
    // لو اتسحب من الموافقة، امسحه من attendance
    if (oldStatus === STATUS.APPROVED && updated.status !== STATUS.APPROVED) {
      removeFromAttendance(updated);
    }
    notifyChange();
    return updated;
  }

  function deleteRequest(id) {
    const req = getRequestById(id);
    if (req && req.status === STATUS.APPROVED) {
      removeFromAttendance(req);
    }
    const reqs = getRequests().filter((r) => r.id !== id);
    if (window.SPUndoRedo) SPUndoRedo.pushUndo("leave change");

    safeWrite(REQ_KEY, reqs);
    notifyChange();
  }

  // =====================================================
  // تطبيق الإجازة على attendance (status = L)
  // =====================================================

  function applyApprovedToAttendance(req) {
    if (!global.SPStorage) return;
    const from = new Date(req.fromDate);
    const to = req.toDate ? new Date(req.toDate) : from;
    if (isNaN(from) || isNaN(to)) return;

    // امسح أي ورديات مجدولة في فترة الإجازة (بتُتجاهل تلقائيًا)
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dstr = SPUtils.fmtDate(d);
      // امسح أي schedule override
      SPStorage.setSchedule(dstr, null);
      // اكتب سجل attendance بـ status = L
      const existing = SPStorage.getEntry(dstr);
      SPStorage.setEntry(dstr, {
        status: 'L',
        leaveType: req.type,
        leaveHours: req.halfDay ? 4 : (req.hours > 0 ? req.hours : 8),
        note: req.reason || req.note || '',
        leaveRequestId: req.id
      });
    }
  }

  function removeFromAttendance(req) {
    if (!global.SPStorage) return;
    const from = new Date(req.fromDate);
    const to = req.toDate ? new Date(req.toDate) : from;
    if (isNaN(from) || isNaN(to)) return;
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dstr = SPUtils.fmtDate(d);
      const entry = SPStorage.getEntry(dstr);
      if (entry && entry.leaveRequestId === req.id) {
        SPStorage.deleteEntry(dstr);
      }
    }
  }

  // =====================================================
  // حساب الأرصدة
  // =====================================================

  // رصيد افتراضي لكل نوع (يجيب من storage كمان)
  function getDefaultBalances() {
    const result = {};
    LEAVE_TYPES.forEach((type) => {
      result[type.id] = {
        total: type.defaultBalance,
        used: 0,
        carryover: 0,
        carryoverEnabled: false,
        carryoverUseEnabled: true
      };
    });
    return result;
  }

  // رصيد محفوظ في storage
  function getStoredBalances() {
    if (!global.SPStorage) return getDefaultBalances();
    const stored = SPStorage.getLeaveBalance();
    // ادمج مع الافتراضيات (للأنواع الجديدة زي maternity/special)
    const defaults = getDefaultBalances();
    const merged = Object.assign({}, defaults, stored);
    // ادمج كل نوع على حدة
    Object.keys(defaults).forEach((typeId) => {
      merged[typeId] = Object.assign({}, defaults[typeId], merged[typeId] || {});
    });
    return merged;
  }

  // حساب المستهلك لكل نوع في السنة الحالية
  function calculateUsedByType(year) {
    const used = {};
    LEAVE_TYPES.forEach((t) => { used[t.id] = 0; });

    const reqs = getRequests();
    reqs.forEach((req) => {
      if (req.status !== STATUS.APPROVED) return;
      const reqYear = new Date(req.fromDate).getFullYear();
      if (year && reqYear !== year) return;
      const days = countLeaveDays(req);
      if (used[req.type] != null) used[req.type] += days;
    });
    return used;
  }

  // المتبقي لكل نوع في السنة الحالية
  function calculateBalances(year) {
    if (!year) year = new Date().getFullYear();
    const stored = getStoredBalances();
    const used = calculateUsedByType(year);
    const result = {};
    LEAVE_TYPES.forEach((type) => {
      const s = stored[type.id] || { total: type.defaultBalance, carryover: 0, carryoverEnabled: false, carryoverUseEnabled: true };
      const carryover = s.carryoverUseEnabled !== false ? (Number(s.carryover) || 0) : 0;
      const total = (Number(s.total) || 0) + carryover;
      result[type.id] = {
        total: total,
        used: used[type.id] || 0,
        remaining: total - (used[type.id] || 0),
        carryover: Number(s.carryover) || 0,
        carryoverEnabled: !!s.carryoverEnabled,
        carryoverUseEnabled: s.carryoverUseEnabled !== false
      };
    });
    return result;
  }

  // ترحيل الرصيد للسنة الجديدة (يستدعى يدويًا من المستخدم)
  function carryOverToNewYear() {
    const stored = getStoredBalances();
    const year = new Date().getFullYear();
    const prevYear = year - 1;
    const prevBalances = calculateBalances(prevYear);
    // أرشيف السنة السابقة
    const archive = safeRead(ARCHIVE_KEY, {});
    archive[prevYear] = prevBalances;
    safeWrite(ARCHIVE_KEY, archive);
    // ترحيل المتبقي للسنة الجديدة (لو مفعّل carryover)
    LEAVE_TYPES.forEach((type) => {
      const s = stored[type.id] || {};
      if (s.carryoverEnabled && prevBalances[type.id]) {
        const remain = prevBalances[type.id].remaining;
        // رحّل بحد أقصى 50% من الرصيد الأصلي
        s.carryover = Math.max(0, Math.min(remain, (Number(s.total) || 0) * 0.5));
      } else {
        s.carryover = 0;
      }
    });
    if (global.SPStorage) SPStorage.saveLeaveBalance(stored);
    notifyChange();
    return { archived: prevYear, carried: stored };
  }

  // =====================================================
  // أرشيف سنوي
  // =====================================================

  function getArchive() {
    return safeRead(ARCHIVE_KEY, {});
  }

  function getYearSummary(year) {
    const reqs = getRequests().filter((r) => {
      const y = new Date(r.fromDate).getFullYear();
      return y === year;
    });
    const summary = {
      total: reqs.length,
      approved: 0,
      pending: 0,
      rejected: 0,
      byType: {},
      totalDays: 0
    };
    LEAVE_TYPES.forEach((t) => { summary.byType[t.id] = { count: 0, days: 0 }; });
    reqs.forEach((r) => {
      summary[r.status] = (summary[r.status] || 0) + 1;
      if (r.status === STATUS.APPROVED) {
        const days = countLeaveDays(r);
        summary.totalDays += days;
        if (summary.byType[r.type]) {
          summary.byType[r.type].count += 1;
          summary.byType[r.type].days += days;
        }
      }
    });
    return summary;
  }

  // =====================================================
  // تداخل مع التقويم: لو في إجازة → تجاهل الورديات المجدولة
  // =====================================================

  function isOnLeave(dstr) {
    const reqs = getRequestsForDate(dstr);
    return reqs.length > 0 ? reqs[0] : null;
  }

  // =====================================================
  // Pub/Sub
  // =====================================================

  const subscribers = [];
  function subscribe(cb) {
    subscribers.push(cb);
    return () => {
      const i = subscribers.indexOf(cb);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  function notifyChange() {
    subscribers.forEach((cb) => {
      try { cb(); } catch (e) { console.error('[Leaves] subscriber error', e); }
    });
    // تنبيه SPStorage كمان (عشان الـ onDataChange يشتغل)
    if (global.SPStorage && SPStorage.subscribe) {
      // SPStorage بيشتر لـ notify بتاعه
      // هنا بنعمل re-notify عن طريق حفظ أي شيء
      try { SPStorage.setMeta('lastLeaveChange', new Date().toISOString()); } catch (e) {}
    }
  }

  // =====================================================
  // تصدير طلبات الإجازات (للتقارير)
  // =====================================================

  function getApprovedInRange(fromStr, toStr) {
    return getRequests().filter((r) => {
      if (r.status !== STATUS.APPROVED) return false;
      return r.fromDate <= toStr && (r.toDate || r.fromDate) >= fromStr;
    });
  }

  // =====================================================
  // Public API
  // =====================================================

  global.SPLeaves = {
    LEAVE_TYPES,
    STATUS,
    getTypeName,
    getTypeColor,
    isPaid,
    getRequests,
    getRequestById,
    getRequestsForDate,
    getRequestsForRange,
    countLeaveDays,
    addRequest,
    updateRequest,
    deleteRequest,
    applyApprovedToAttendance,
    removeFromAttendance,
    getDefaultBalances,
    getStoredBalances,
    calculateUsedByType,
    calculateBalances,
    carryOverToNewYear,
    getArchive,
    getYearSummary,
    isOnLeave,
    getApprovedInRange,
    subscribe
  };
})(window);
