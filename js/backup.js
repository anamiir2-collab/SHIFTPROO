/* ShiftPro - Auto Backup (IndexedDB) + CSV/XLSX export
   - نسخة تلقائية كل أسبوع في IndexedDB
   - الاحتفاظ بآخر 5 نسخ مع إمكانية الرجوع لأي منها
   - تصدير/استيراد JSON يدوي (موجود، تأكد إنه شغال)
   - تصدير CSV و XLSX للورديات (SheetJS)

   exposes: window.SPBackup
*/
(function (global) {
  'use strict';

  const DB_NAME = 'shifpro-backup';
  const DB_VERSION = 1;
  const STORE_NAME = 'snapshots';
  const MAX_SNAPSHOTS = 5;
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const LAST_BACKUP_KEY = 'shifpro_last_backup_v2';

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // ---------- فتح قاعدة البيانات ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ---------- إنشاء snapshot ----------
  function snapshot() {
    if (!global.SPStorage) return null;
    return {
      id: 'snap-' + Date.now().toString(36),
      ts: Date.now(),
      appVersion: '2.0.0',
      data: SPStorage.exportAll()
    };
  }

  // ---------- حفظ snapshot في IndexedDB ----------
  async function saveSnapshot(snap) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(snap);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('[Backup] save error', e);
      return false;
    }
  }

  // ---------- إزالة snapshots قديمة ----------
  async function pruneOldSnapshots() {
    try {
      const all = await listSnapshots();
      if (all.length <= MAX_SNAPSHOTS) return 0;
      // امسح الأقدم
      const sorted = all.sort((a, b) => a.ts - b.ts);
      const toDelete = sorted.slice(0, sorted.length - MAX_SNAPSHOTS);
      const db = await openDB();
      for (const snap of toDelete) {
        await new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(snap.id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
      }
      return toDelete.length;
    } catch (e) { return 0; }
  }

  // ---------- قائمة كل الـ snapshots ----------
  async function listSnapshots() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const arr = req.result || [];
          // رتّب من الأحدث للأقدم
          arr.sort((a, b) => b.ts - a.ts);
          resolve(arr);
        };
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('[Backup] list error', e);
      return [];
    }
  }

  // ---------- استعادة snapshot ----------
  async function restoreSnapshot(id) {
    try {
      const db = await openDB();
      const snap = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!snap || !snap.data) return false;
      // سجّل لـ undo قبل الاستعادة
      if (window.SPUndoRedo) SPUndoRedo.pushUndo('restore backup ' + id);
      SPStorage.importAll(snap.data);
      return true;
    } catch (e) {
      console.error('[Backup] restore error', e);
      return false;
    }
  }

  // ---------- حذف snapshot ----------
  async function deleteSnapshot(id) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  }

  // ---------- نسخة تلقائية أسبوعية ----------
  async function autoBackupIfNeeded() {
    if (!global.SPStorage) return false;
    let last = 0;
    try { last = Number(localStorage.getItem(LAST_BACKUP_KEY)) || 0; } catch (e) {}
    const now = Date.now();
    if (now - last < WEEK_MS) return false;
    const snap = snapshot();
    if (!snap) return false;
    snap.id = 'auto-' + now.toString(36);
    snap.label = 'auto';
    const ok = await saveSnapshot(snap);
    if (ok) {
      await pruneOldSnapshots();
      try { localStorage.setItem(LAST_BACKUP_KEY, String(now)); } catch (e) {}
      return true;
    }
    return false;
  }

  // ---------- نسخة يدوية ----------
  async function createManualBackup(label) {
    if (!global.SPStorage) return null;
    const snap = snapshot();
    if (!snap) return null;
    snap.label = label || 'manual';
    const ok = await saveSnapshot(snap);
    if (ok) {
      await pruneOldSnapshots();
      return snap;
    }
    return null;
  }

  // ---------- تصدير JSON يدوي ----------
  function exportJSON() {
    if (!global.SPStorage) return null;
    const data = SPStorage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const filename = 'shiftpro-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    if (global.SPUtils && SPUtils.downloadBlob) SPUtils.downloadBlob(filename, blob);
    return { filename, blob };
  }

  // ---------- استيراد JSON يدوي ----------
  function importJSON(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file'));
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);
          if (!json.data) throw new Error('Invalid format');
          if (window.SPUndoRedo) SPUndoRedo.pushUndo('import JSON');
          SPStorage.importAll(json);
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  // ---------- تصدير CSV ----------
  function exportCSV() {
    if (!global.SPStorage) return null;
    const att = SPStorage.getAttendance() || {};
    const sched = SPStorage.getSchedule() || {};
    const allDates = Array.from(new Set([...Object.keys(att), ...Object.keys(sched)])).sort();
    const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');

    const headers = isAr
      ? ['التاريخ', 'الوردية', 'الحالة', 'الحضور', 'الانصراف', 'الساعات', 'ملاحظة']
      : ['Date', 'Shift', 'Status', 'Check-in', 'Check-out', 'Hours', 'Note'];
    const rows = [headers];

    allDates.forEach((dstr) => {
      const entry = att[dstr] || {};
      const code = sched[dstr] || '';
      const shift = code ? SPStorage.getShiftByCode(code) : null;
      const shiftName = shift ? shift.name : code;
      let status = '';
      if (entry.status === 'A') status = isAr ? 'حضور' : 'Present';
      else if (entry.status === 'X') status = isAr ? 'مطبق' : 'Double';
      else if (entry.status === 'L') status = isAr ? 'إجازة' : 'Leave';
      else if (entry.status === 'B') status = isAr ? 'غياب' : 'Absent';
      let hours = '';
      if (entry.from && entry.to) {
        try { hours = String(SPUtils.computeRangeHours(entry.from, entry.to)); } catch (e) {}
      }
      rows.push([
        dstr, shiftName, status,
        entry.from || '', entry.to || '',
        hours, (entry.note || '').replace(/,/g, ' ')
      ]);
    });

    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const filename = 'shiftpro-' + new Date().toISOString().slice(0, 10) + '.csv';
    if (global.SPUtils && SPUtils.downloadBlob) SPUtils.downloadBlob(filename, blob);
    return { filename, blob };
  }

  // ---------- تصدير XLSX عبر SheetJS ----------
  let _xlsxPromise = null;
  function loadXLSX() {
    if (_xlsxPromise) return _xlsxPromise;
    if (global.XLSX) return Promise.resolve(global.XLSX);
    _xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = './vendor/xlsx.full.min.js';
      s.onload = () => global.XLSX ? resolve(global.XLSX) : reject(new Error('XLSX not loaded'));
      s.onerror = () => {
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s2.onload = () => global.XLSX ? resolve(global.XLSX) : reject(new Error('XLSX not loaded'));
        s2.onerror = () => reject(new Error('Failed to load XLSX'));
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    return _xlsxPromise;
  }

  async function exportXLSX() {
    if (!global.SPStorage) return null;
    try {
      const XLSX = await loadXLSX();
      const att = SPStorage.getAttendance() || {};
      const sched = SPStorage.getSchedule() || {};
      const allDates = Array.from(new Set([...Object.keys(att), ...Object.keys(sched)])).sort();
      const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');

      const headers = isAr
        ? ['التاريخ', 'الوردية', 'الحالة', 'الحضور', 'الانصراف', 'الساعات', 'ملاحظة']
        : ['Date', 'Shift', 'Status', 'Check-in', 'Check-out', 'Hours', 'Note'];
      const data = [headers];
      allDates.forEach((dstr) => {
        const entry = att[dstr] || {};
        const code = sched[dstr] || '';
        const shift = code ? SPStorage.getShiftByCode(code) : null;
        const shiftName = shift ? shift.name : code;
        let status = '';
        if (entry.status === 'A') status = isAr ? 'حضور' : 'Present';
        else if (entry.status === 'X') status = isAr ? 'مطبق' : 'Double';
        else if (entry.status === 'L') status = isAr ? 'إجازة' : 'Leave';
        else if (entry.status === 'B') status = isAr ? 'غياب' : 'Absent';
        let hours = '';
        if (entry.from && entry.to) {
          try { hours = SPUtils.computeRangeHours(entry.from, entry.to); } catch (e) {}
        }
        data.push([dstr, shiftName, status, entry.from || '', entry.to || '', hours, entry.note || '']);
      });

      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ShiftPro');
      const filename = 'shiftpro-' + new Date().toISOString().slice(0, 10) + '.xlsx';
      XLSX.writeFile(wb, filename);
      return { filename };
    } catch (e) {
      console.error('[Backup] XLSX export error', e);
      // fallback لـ CSV
      return exportCSV();
    }
  }

  global.SPBackup = {
    openDB,
    snapshot,
    saveSnapshot,
    listSnapshots,
    restoreSnapshot,
    deleteSnapshot,
    pruneOldSnapshots,
    autoBackupIfNeeded,
    createManualBackup,
    exportJSON,
    importJSON,
    exportCSV,
    exportXLSX,
    MAX_SNAPSHOTS
  };
})(window);
