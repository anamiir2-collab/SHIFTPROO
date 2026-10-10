/* ShiftPro - UX Enhancements
   - ثيمات ألوان مخصصة (مش بس داكن/فاتح)
   - Privacy Mode: إخفاء كل الأرقام المالية بضغطة
   - إحصائيات streak ("X يوم متواصل بدون تأخير")
   - Onboarding أول مرة (overlay ترحيبي)

   exposes: window.SPUX
*/
(function (global) {
  'use strict';

  const PRIVACY_KEY = 'shifpro_privacy_mode';
  const ONBOARDED_KEY = 'shifpro_onboarded_v2';
  const THEMES_KEY = 'shifpro_custom_themes';
  const STREAK_KEY = 'shifpro_streak';

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // ---------- ثيمات ألوان مخصصة ----------
  // كل ثيم بيوفر مجموعة متغيرات CSS
  const PRESET_THEMES = [
    { id: 'blue', name: 'أزرق', nameEn: 'Blue', accent: '#2563eb', accentText: '#fff' },
    { id: 'green', name: 'أخضر', nameEn: 'Green', accent: '#16a34a', accentText: '#fff' },
    { id: 'purple', name: 'بنفسجي', nameEn: 'Purple', accent: '#9333ea', accentText: '#fff' },
    { id: 'orange', name: 'برتقالي', nameEn: 'Orange', accent: '#ea580c', accentText: '#fff' },
    { id: 'rose', name: 'وردي', nameEn: 'Rose', accent: '#e11d48', accentText: '#fff' },
    { id: 'teal', name: 'تركواز', nameEn: 'Teal', accent: '#0d9488', accentText: '#fff' }
  ];

  function getCustomThemes() {
    try {
      const v = localStorage.getItem(THEMES_KEY);
      return v ? JSON.parse(v) : [];
    } catch (e) { return []; }
  }

  function applyTheme(themeId) {
    const preset = PRESET_THEMES.find((x) => x.id === themeId);
    if (!preset) return false;
    document.documentElement.style.setProperty('--accent', preset.accent);
    document.documentElement.style.setProperty('--accent-2', preset.accent);
    document.documentElement.style.setProperty('--accent-text', preset.accentText);
    // حدّث meta theme-color
    const meta = document.getElementById('metaTheme');
    if (meta) meta.content = preset.accent;
    try { localStorage.setItem('shifpro_active_theme', themeId); } catch (e) {}
    return true;
  }

  function restoreTheme() {
    try {
      const saved = localStorage.getItem('shifpro_active_theme');
      if (saved) applyTheme(saved);
    } catch (e) {}
  }

  // ---------- Privacy Mode ----------
  let privacyOn = false;

  function isPrivacyOn() {
    return privacyOn;
  }

  function togglePrivacy() {
    privacyOn = !privacyOn;
    document.documentElement.dataset.privacy = privacyOn ? 'on' : 'off';
    try { localStorage.setItem(PRIVACY_KEY, privacyOn ? '1' : '0'); } catch (e) {}
    // أعيد رسم الصفحات
    if (global.SPApp && SPApp.onDataChange) {
      try { SPApp.onDataChange(); } catch (e) {}
    }
    if (global.SPUtils && SPUtils.toast) {
      SPUtils.toast(privacyOn ? t('privacy.hidden_label') : t('privacy.visible_label'), 'info');
    }
    return privacyOn;
  }

  function restorePrivacy() {
    try {
      privacyOn = localStorage.getItem(PRIVACY_KEY) === '1';
      document.documentElement.dataset.privacy = privacyOn ? 'on' : 'off';
    } catch (e) {}
  }

  // mask لأي رقم مالي
  function maskCurrency(n) {
    if (privacyOn) return '•••';
    return n;
  }

  // ---------- Streak: أيام متواصلة بدون تأخير ----------
  function calculateStreak() {
    if (!global.SPStorage || !global.SPAttendance) return 0;
    const att = SPStorage.getAttendance() || {};
    let streak = 0;
    const today = new Date();
    // ابدأ من اليوم وارجع للخلف
    for (let d = new Date(today); ; d.setDate(d.getDate() - 1)) {
      const dstr = SPUtils.fmtDate(d);
      const entry = att[dstr];
      if (!entry) {
        // كسر الـ streak لو مفيش سجل
        if (streak > 0) break;
        continue;
      }
      if (entry.status === 'A' || entry.status === 'X') {
        // لو في تأخير، اكسر
        if (entry.lateMinutes && entry.lateMinutes > 0) break;
        streak++;
      } else {
        // إجازة أو غياب: ما تكسرش بس ما تزيدش
        continue;
      }
      // حد أقصى للـ loop
      if (streak > 365) break;
    }
    return streak;
  }

  // ---------- Onboarding ----------
  function hasOnboarded() {
    try { return localStorage.getItem(ONBOARDED_KEY) === '1'; } catch (e) { return false; }
  }
  function setOnboarded() {
    try { localStorage.setItem(ONBOARDED_KEY, '1'); } catch (e) {}
  }

  function showOnboarding() {
    if (hasOnboarded()) return;
    if (!global.SPUtils) return;
    const { el } = SPUtils;
    const steps = [
      { title: t('onboard.welcome_title'), body: t('onboard.welcome_body') },
      { title: t('onboard.step1_title'), body: t('onboard.step1_body') },
      { title: t('onboard.step2_title'), body: t('onboard.step2_body') },
      { title: t('onboard.step3_title'), body: t('onboard.step3_body') }
    ];

    let currentStep = 0;

    const overlay = el('div', {
      class: 'onboarding-overlay',
      style: 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;'
    });
    const card = el('div', {
      class: 'onboarding-card',
      style: 'background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px;max-width:380px;width:100%;text-align:center;'
    });
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function renderStep() {
      const step = steps[currentStep];
      card.innerHTML = '';
      card.appendChild(el('div', {
        style: 'width:60px;height:60px;margin:0 auto 16px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:800;'
      }, [String(currentStep + 1)]));
      card.appendChild(el('h2', { style: 'margin:0 0 12px;color:var(--text);' }, [step.title]));
      card.appendChild(el('p', { style: 'margin:0 0 20px;color:var(--muted);font-size:13px;line-height:1.6;' }, [step.body]));
      // dots
      const dotsRow = el('div', { style: 'display:flex;gap:6px;justify-content:center;margin-bottom:16px;' });
      steps.forEach((_, i) => {
        dotsRow.appendChild(el('span', {
          style: 'width:8px;height:8px;border-radius:50%;background:' + (i === currentStep ? 'var(--accent)' : 'var(--line)') + ';'
        }));
      });
      card.appendChild(dotsRow);
      // buttons
      const btnsRow = el('div', { style: 'display:flex;gap:8px;' });
      const skipBtn = el('button', {
        style: 'flex:1;padding:10px;background:transparent;color:var(--muted);border:1px solid var(--line);border-radius:8px;cursor:pointer;'
      }, [t('onboard.skip')]);
      const nextBtn = el('button', {
        style: 'flex:2;padding:10px;background:var(--accent);color:var(--accent-text);border:none;border-radius:8px;cursor:pointer;font-weight:700;'
      }, [(currentStep === steps.length - 1) ? t('onboard.start') : t('onboard.next')]);
      skipBtn.addEventListener('click', () => {
        setOnboarded();
        try { document.body.removeChild(overlay); } catch (e) {}
      });
      nextBtn.addEventListener('click', () => {
        if (currentStep < steps.length - 1) {
          currentStep++;
          renderStep();
        } else {
          setOnboarded();
          try { document.body.removeChild(overlay); } catch (e) {}
        }
      });
      btnsRow.appendChild(skipBtn);
      btnsRow.appendChild(nextBtn);
      card.appendChild(btnsRow);
    }
    renderStep();
  }

  // ---------- Init ----------
  function init() {
    restoreTheme();
    restorePrivacy();
    // Onboarding (بعد قليل عشان DOM يكون جاهز)
    setTimeout(showOnboarding, 2500);
  }

  global.SPUX = {
    PRESET_THEMES,
    getCustomThemes,
    applyTheme,
    restoreTheme,
    isPrivacyOn,
    togglePrivacy,
    maskCurrency,
    calculateStreak,
    hasOnboarded,
    setOnboarded,
    showOnboarding,
    init
  };

  // Start init on script load (DOM may not be ready yet)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
