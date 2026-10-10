/* ShiftPro - App Lock (PIN + WebAuthn)
   - PIN مشفّر بـ SHA-256 (Web Crypto API)
   - خيار بصمة / Face ID عبر WebAuthn (يشتغل بدون سيرفر)
   - تفعيل/تعطيل من الإعدادات

   exposes: window.SPAppLock
*/
(function (global) {
  'use strict';

  const PIN_HASH_KEY = 'shifpro_pin_hash_v2';
  const LOCK_ENABLED_KEY = 'shifpro_lock_enabled_v2';
  const CRED_KEY = 'shifpro_webauthn_cred_v2';
  const SESSION_KEY = 'shifpro_lock_session_v2'; // جلسة مفتوحة مؤقتًا

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // ---------- Web Crypto: SHA-256 ----------
  async function sha256(text) {
    try {
      const enc = new TextEncoder().encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
      const arr = Array.from(new Uint8Array(hashBuffer));
      return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.error('[AppLock] sha256 error', e);
      // fallback بسيط (مش آمنة بس مفيش بديل)
      let h = 0;
      for (let i = 0; i < text.length; i++) {
        h = ((h << 5) - h) + text.charCodeAt(i);
        h |= 0;
      }
      return 'fallback_' + h;
    }
  }

  // ---------- PIN Management ----------
  function isPinSet() {
    try { return !!localStorage.getItem(PIN_HASH_KEY); } catch (e) { return false; }
  }
  function isLockEnabled() {
    try { return localStorage.getItem(LOCK_ENABLED_KEY) === '1'; } catch (e) { return false; }
  }
  function setLockEnabled(on) {
    try { localStorage.setItem(LOCK_ENABLED_KEY, on ? '1' : '0'); } catch (e) {}
  }

  async function setPin(pin) {
    if (!pin || pin.length < 4) throw new Error('PIN must be at least 4 digits');
    const hash = await sha256(pin);
    try { localStorage.setItem(PIN_HASH_KEY, hash); } catch (e) {}
    setLockEnabled(true);
    return true;
  }

  function clearPin() {
    try { localStorage.removeItem(PIN_HASH_KEY); } catch (e) {}
    setLockEnabled(false);
    clearWebAuthn();
  }

  async function verifyPin(pin) {
    if (!isPinSet()) return false;
    const hash = await sha256(pin);
    const stored = localStorage.getItem(PIN_HASH_KEY);
    return hash === stored;
  }

  // ---------- Session Management ----------
  function unlockSession() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
  }
  function lockSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }
  function isUnlocked() {
    if (!isLockEnabled()) return true;
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  // ---------- WebAuthn (biometric) ----------
  function isWebAuthnSupported() {
    return typeof PublicKeyCredential !== 'undefined' &&
      typeof navigator.credentials !== 'undefined';
  }

  async function registerBiometric() {
    if (!isWebAuthnSupported()) throw new Error('WebAuthn not supported');
    // local-only: challenge ثابت، user.id ثابت، authenticator محلي
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);
    const publicKey = {
      challenge: challenge,
      rp: { name: 'ShiftPro' },
      user: {
        id: userId,
        name: 'ShiftPro User',
        displayName: 'ShiftPro User'
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    };
    try {
      const cred = await navigator.credentials.create({ publicKey });
      // خزّن بيانات الـ credential (مش الـ secret، بس الـ ID)
      const credId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
      try { localStorage.setItem(CRED_KEY, credId); } catch (e) {}
      setLockEnabled(true);
      return true;
    } catch (e) {
      if (e.name === 'NotAllowedError') throw new Error('Biometric verification cancelled');
      throw e;
    }
  }

  function hasBiometric() {
    try { return !!localStorage.getItem(CRED_KEY); } catch (e) { return false; }
  }

  function clearWebAuthn() {
    try { localStorage.removeItem(CRED_KEY); } catch (e) {}
  }

  async function verifyBiometric() {
    if (!isWebAuthnSupported() || !hasBiometric()) return false;
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const credId = localStorage.getItem(CRED_KEY);
    if (!credId) return false;
    const id = Uint8Array.from(atob(credId), (c) => c.charCodeAt(0));
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          timeout: 60000,
          userVerification: 'required',
          allowCredentials: [{
            id: id,
            type: 'public-key',
            transports: ['internal']
          }]
        }
      });
      return !!assertion;
    } catch (e) {
      return false;
    }
  }

  // ---------- Lock UI (overlay) ----------
  let lockOverlay = null;

  function showLockScreen() {
    if (lockOverlay) return;
    const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');
    lockOverlay = document.createElement('div');
    lockOverlay.className = 'app-lock-overlay';
    lockOverlay.style.cssText =
      'position:fixed;inset:0;background:rgba(7,20,38,.95);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
    lockOverlay.innerHTML =
      '<div style="background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;max-width:340px;width:100%;text-align:center;">' +
        '<div style="width:60px;height:60px;margin:0 auto 16px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;">' +
          '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 1a5 5 0 0 1 5 5v3h1a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3h1V6a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V6a3 3 0 0 0-3-3z"/></svg>' +
        '</div>' +
        '<h2 style="margin:0 0 8px;color:var(--text);">' + (isAr ? 'تطبيق مقفل' : 'App locked') + '</h2>' +
        '<p style="margin:0 0 16px;color:var(--muted);font-size:13px;">' + (isAr ? 'أدخل الرمز للمتابعة' : 'Enter PIN to continue') + '</p>' +
        '<input type="password" inputmode="numeric" id="lockPinInput" maxlength="8" style="width:100%;text-align:center;font-size:24px;letter-spacing:8px;padding:12px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;color:var(--text);">' +
        '<p id="lockError" style="color:var(--danger);margin:8px 0;font-size:12px;min-height:18px;"></p>' +
        '<button id="lockSubmitBtn" style="width:100%;padding:12px;background:var(--accent);color:var(--accent-text);border:none;border-radius:8px;font-weight:700;cursor:pointer;">' + (isAr ? 'فتح' : 'Unlock') + '</button>' +
        (hasBiometric() ? '<button id="lockBioBtn" style="width:100%;padding:10px;margin-top:8px;background:transparent;color:var(--accent);border:1px solid var(--accent);border-radius:8px;cursor:pointer;">' + (isAr ? 'بصمة / وجه' : 'Biometric') + '</button>' : '') +
      '</div>';
    document.body.appendChild(lockOverlay);

    const input = lockOverlay.querySelector('#lockPinInput');
    const submitBtn = lockOverlay.querySelector('#lockSubmitBtn');
    const errEl = lockOverlay.querySelector('#lockError');
    input.focus();

    async function tryUnlock() {
      const pin = input.value;
      const ok = await verifyPin(pin);
      if (ok) {
        unlockSession();
        hideLockScreen();
        if (global.SPUtils && SPUtils.toast) SPUtils.toast(isAr ? 'أهلاً' : 'Welcome', 'success');
      } else {
        errEl.textContent = isAr ? 'رمز خاطئ' : 'Wrong PIN';
        input.value = '';
        input.focus();
      }
    }
    submitBtn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });

    const bioBtn = lockOverlay.querySelector('#lockBioBtn');
    if (bioBtn) {
      bioBtn.addEventListener('click', async () => {
        const ok = await verifyBiometric();
        if (ok) {
          unlockSession();
          hideLockScreen();
        } else {
          errEl.textContent = isAr ? 'فشلت المصادقة' : 'Biometric failed';
        }
      });
    }
  }

  function hideLockScreen() {
    if (lockOverlay) {
      try { document.body.removeChild(lockOverlay); } catch (e) {}
      lockOverlay = null;
    }
  }

  function checkAndLock() {
    if (isLockEnabled() && !isUnlocked()) {
      showLockScreen();
      return true; // locked
    }
    return false; // unlocked
  }

  // ---------- Public API ----------
  global.SPAppLock = {
    isPinSet,
    isLockEnabled,
    setLockEnabled,
    setPin,
    clearPin,
    verifyPin,
    unlockSession,
    lockSession,
    isUnlocked,
    isWebAuthnSupported,
    hasBiometric,
    registerBiometric,
    clearWebAuthn,
    verifyBiometric,
    showLockScreen,
    hideLockScreen,
    checkAndLock
  };
})(window);
