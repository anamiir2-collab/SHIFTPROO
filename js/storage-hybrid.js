/* ShiftPro - Storage Hybrid Layer (IndexedDB + localStorage fallback)
   طبقة تخزين هجينة: بتستخدم IndexedDB كـ primary، localStorage كـ fallback.
   مع migration تلقائي للبيانات القديمة من localStorage لـ IndexedDB.

   exposes: window.SPStorage Hybrid
   Note: ده طبقة إضافية فوق SPStorage الحالي (ما يلغيوش)
*/
(function (global) {
  'use strict';

  if (!global.SPStorage) return; // محتاج SPStorage الأصلي

  const DB_NAME = 'shifpro-hybrid';
  const DB_VERSION = 1;
  const STORE = 'kv';
  const MIGRATION_FLAG_KEY = 'shifpro_hybrid_migrated';

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
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return undefined;
    }
  }

  async function idbSet(key, value) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      return false;
    }
  }

  // ---------- API ----------
  // async getItem: لو موجود في IndexedDB رجّعه، وإلا localStorage
  async function getItem(key) {
    const v = await idbGet(key);
    if (v !== undefined) return v;
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  // async setItem: اكتب في الاتنين (IndexedDB primary، localStorage fallback)
  async function setItem(key, value) {
    await idbSet(key, value);
    try { localStorage.setItem(key, value); } catch (e) {}
    return true;
  }

  // ---------- Migration من localStorage لـ IndexedDB ----------
  async function migrateLegacy() {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;
    // list of legacy v2 keys to migrate
    const keys = [
      'shifpro_settings_v2',
      'shifpro_attendance_v2',
      'shifpro_schedule_v2',
      'shifpro_shifts_v2',
      'shifpro_adjustments_v2',
      'shifpro_leave_balance_v2',
      'shifpro_meta_v2'
    ];
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v) await idbSet(k, v);
    }
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    console.log('[HybridStorage] migrated', keys.length, 'keys to IndexedDB');
  }

  // ---------- Initialize ----------
  function init() {
    migrateLegacy().catch((e) => {
      console.warn('[HybridStorage] migration failed', e);
    });
  }

  global.SPStorageHybrid = {
    openDB,
    getItem,
    setItem,
    idbGet,
    idbSet,
    migrateLegacy,
    init
  };

  // Start migration immediately
  init();
})(window);
