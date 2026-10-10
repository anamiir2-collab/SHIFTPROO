/* ShiftPro - Undo / Redo System
   يخزّن آخر 10 عمليات في stack، مع دعم Ctrl+Z / Ctrl+Y.
   يشتغل على: إضافة/تعديل/حذف وردية، إجازة، إعدادات.

   Pattern:
   - قبل أي تعديل، استدع pushUndo(action) - يحفظ snapshot
   - undo() يرجّع آخر snapshot + يحفظه في redo stack
   - redo() يطبّق آخر snapshot من redo + يرجّعه في undo stack

   exposes: window.SPUndoRedo
*/
(function (global) {
  'use strict';

  const MAX_HISTORY = 10;
  const UNDO_KEY = 'shifpro_undo_stack_v2';
  const REDO_KEY = 'shifpro_redo_stack_v2';

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // قراءة/كتابة آمنة
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

  // snapshot لكل بيانات التطبيق
  function snapshot() {
    if (!global.SPStorage) return null;
    return {
      ts: Date.now(),
      label: '',
      data: SPStorage.exportAll().data
    };
  }

  // يطبّق snapshot على التخزين
  function restore(snap) {
    if (!snap || !snap.data || !global.SPStorage) return false;
    SPStorage.importAll({ app: 'ShiftPro', version: '2.0.0', exportedAt: new Date().toISOString(), data: snap.data });
    return true;
  }

  // Push snapshot للـ undo stack
  function pushUndo(label) {
    const snap = snapshot();
    if (!snap) return;
    snap.label = label || '';
    const undoStack = safeRead(UNDO_KEY, []);
    undoStack.push(snap);
    // اقتصار على آخر MAX_HISTORY
    while (undoStack.length > MAX_HISTORY) undoStack.shift();
    safeWrite(UNDO_KEY, undoStack);
    // امسح redo stack (أي عملية جديدة بتمسح الـ redo)
    safeWrite(REDO_KEY, []);
    notifyChange();
  }

  function canUndo() {
    const s = safeRead(UNDO_KEY, []);
    return s.length > 0;
  }

  function canRedo() {
    const s = safeRead(REDO_KEY, []);
    return s.length > 0;
  }

  function undo() {
    const undoStack = safeRead(UNDO_KEY, []);
    if (undoStack.length === 0) {
      if (global.SPUtils && SPUtils.toast) SPUtils.toast(t('msg.cannot_undo'), 'info');
      return false;
    }
    // snapshot الحالة الحالية (للـ redo)
    const current = snapshot();
    if (current) {
      const redoStack = safeRead(REDO_KEY, []);
      redoStack.push(current);
      safeWrite(REDO_KEY, redoStack);
    }
    // رجّع آخر snapshot
    const snap = undoStack.pop();
    safeWrite(UNDO_KEY, undoStack);
    restore(snap);
    notifyChange();
    if (global.SPApp && SPApp.onDataChange) {
      try { SPApp.onDataChange(); } catch (e) {}
    }
    if (global.SPUtils && SPUtils.toast) {
      SPUtils.toast('↩️ ' + t('msg.undo') + (snap.label ? ': ' + snap.label : ''), 'info');
    }
    return true;
  }

  function redo() {
    const redoStack = safeRead(REDO_KEY, []);
    if (redoStack.length === 0) {
      if (global.SPUtils && SPUtils.toast) SPUtils.toast(t('msg.cannot_redo'), 'info');
      return false;
    }
    // snapshot الحالة الحالية (للـ undo)
    const current = snapshot();
    if (current) {
      const undoStack = safeRead(UNDO_KEY, []);
      undoStack.push(current);
      while (undoStack.length > MAX_HISTORY) undoStack.shift();
      safeWrite(UNDO_KEY, undoStack);
    }
    // طبّق آخر redo
    const snap = redoStack.pop();
    safeWrite(REDO_KEY, redoStack);
    restore(snap);
    notifyChange();
    if (global.SPApp && SPApp.onDataChange) {
      try { SPApp.onDataChange(); } catch (e) {}
    }
    if (global.SPUtils && SPUtils.toast) {
      SPUtils.toast('↪️ ' + t('msg.redo') + (snap.label ? ': ' + snap.label : ''), 'info');
    }
    return true;
  }

  function clearHistory() {
    safeWrite(UNDO_KEY, []);
    safeWrite(REDO_KEY, []);
    notifyChange();
  }

  // قائمة العمليات للعرض
  function getHistory() {
    const undoStack = safeRead(UNDO_KEY, []);
    return undoStack.map((s) => ({
      ts: s.ts,
      label: s.label || '',
      date: new Date(s.ts).toLocaleTimeString()
    }));
  }

  // Pub/Sub
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
      try { cb(); } catch (e) { console.error('[UndoRedo] sub error', e); }
    });
  }

  // Public API
  global.SPUndoRedo = {
    MAX_HISTORY,
    pushUndo,
    undo,
    redo,
    canUndo,
    canRedo,
    clearHistory,
    getHistory,
    subscribe
  };
})(window);
