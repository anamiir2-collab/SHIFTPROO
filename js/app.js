/* ShiftPro - Main App Entry
   Coordinates navigation, dashboard rendering, splash, PWA install,
   notifications, search, and global event wiring.
   Exposes: window.SPApp
*/
(function (global) {
  'use strict';

  const { $, el, fmtDate, parseDate, todayStr, formatHijri, fmtTime12,
    fmtNum, fmtCurrency, fmtHours, monthNamesAr, weekdayNamesAr,
    toast, confirmDialog, haptic, onClickOnce, debounce, t,
    shiftDisplayName } = SPUtils;
  const storage = SPStorage;

  let unsubStore = null;
  let installPromptEvent = null;
  let liveAttendanceTimerId = null;

  // ---------- Splash ----------
  function hideSplash() {
    const splash = $('#splash');
    if (!splash) return;
    splash.classList.add('is-hidden');
    setTimeout(() => splash.remove(), 800);
  }

  // ---------- Navigation ----------
  function goToTab(tab) {
    // If leaving the law tab, deactivate its reader (unbind listeners,
    // clear body[data-law-active], close drawer).
    const wasLawActive = document.body.dataset.lawActive === '1';
    if (wasLawActive && tab !== 'law' && window.SPLaw) {
      try { window.SPLaw.deactivate(); } catch (e) { console.warn('[SPLaw] deactivate error', e); }
    }

    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.page').forEach((p) => {
      p.classList.toggle('active', p.dataset.tab === tab);
    });
    // Re-render the visible page (in case data changed)
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'calendar') SPCalendar.renderCalendar();
    if (tab === 'salary') SPSalary.render();
    if (tab === 'reports') SPReports.render();
    // Activate the scoped law reader when entering its tab.
    if (tab === 'law' && window.SPLaw) {
      try { window.SPLaw.activate(); } catch (e) { console.warn('[SPLaw] activate error', e); }
    }
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- Dashboard rendering ----------
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.greeting_morning');
    if (h < 17) return t('dashboard.greeting_noon');
    if (h < 21) return t('dashboard.greeting_evening');
    return t('dashboard.greeting_night');
  }

  function subGreeting() {
    const h = new Date().getHours();
    if (h < 12) return t('dashboard.sub_welcome_morning');
    if (h < 17) return t('dashboard.sub_welcome_noon');
    if (h < 21) return t('dashboard.sub_welcome_evening');
    return t('dashboard.sub_welcome_night');
  }


  // ---------- Live check-in elapsed time and remaining shift countdown ----------
  function formatDurationClock(totalSeconds) {
    const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const seconds = value % 60;
    return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
  }

  function updateLiveAttendanceTimer() {
    const card = $('#shiftCountdownCard');
    if (!card) return;
    const now = new Date();
    const today = fmtDate(now);
    const entry = storage.getEntry(today);
    const active = entry && (entry.status === 'A' || entry.status === 'X') && entry.from && !entry.to;
    card.hidden = !active;
    if (!active) return;

    const startDate = entry.fromDate || today;
    const startedAt = new Date(startDate + 'T' + entry.from + ':00');
    const elapsedSeconds = Number.isNaN(startedAt.getTime())
      ? 0
      : Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
    const scheduledCode = storage.getScheduledCode(today);
    const shift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;
    const settings = storage.getSettings();
    const requiredHours = Math.max(0, Number(shift ? shift.hours : settings.shiftHours) || 12);
    const requiredSeconds = Math.round(requiredHours * 3600);
    const remainingSeconds = Math.max(0, requiredSeconds - elapsedSeconds);
    const elapsedHours = elapsedSeconds / 3600;
    const progress = requiredSeconds > 0
      ? Math.min(100, (elapsedSeconds / requiredSeconds) * 100)
      : 100;

    $('#workedElapsed').textContent = formatDurationClock(elapsedSeconds);
    $('#workedRemaining').textContent = formatDurationClock(remainingSeconds);
    $('#shiftProgressBar').style.width = progress + '%';
    $('#shiftCountdownStatus').textContent = remainingSeconds > 0
      ? t('dashboard.countdown_remaining', { time: formatDurationClock(remainingSeconds) })
      : t('dashboard.countdown_complete');

    // Keep today's total, overtime, and estimated value live while checked in.
    $('#todayHours').textContent = fmtHours(elapsedHours);
    $('#todayOvertime').textContent = '+' + fmtHours(SPAttendance.computeOvertimeHours(now, entry));
    $('#todayValue').textContent = fmtCurrency(SPAttendance.dayValue(now, entry));
  }

  function renderDashboard() {
    const s = storage.getSettings();
    const today = new Date();
    const dstr = fmtDate(today);
    const entry = storage.getEntry(dstr);
    const code = storage.getScheduledCode(dstr);
    const shift = code ? storage.getShiftByCode(code) : null;

    // ----- Welcome card -----
    // The greeting word (morning/noon/evening/night) in the current language
    $('#greetingText').textContent = greeting();
    // الاسم الافتراضي القديم "موظف" يُعامل كغير مُدخل حتى تظهر ترجمة اللغة الحالية
    const rawName = (s.name || '').trim();
    const isDefaultName = !rawName || rawName === 'موظف' || rawName === 'Employee';
    const displayName = isDefaultName ? t('dashboard.default_name') : rawName;

    // Render the personalized welcome line: "مرحباً يا [Name]" (ar) / "Welcome, [Name]" (en)
    // We pick the template based on the *current* locale, not the original text language.
    const isAr = !window.SPi18n || SPi18n.getLocale() === 'ar';
    const welcomeKey = isAr ? 'dashboard.welcome_ar' : 'dashboard.welcome_en';
    // heroName is now the welcome line itself (not just the bare name)
    $('#heroName').textContent = SPi18n
      ? SPi18n.t(welcomeKey, { name: displayName })
      : (isAr ? 'مرحباً يا ' + displayName : 'Welcome, ' + displayName);

    // Show one personalized motivational message per app load.
    if (window.SPWelcomeMessages) {
      SPWelcomeMessages.render(displayName, isAr ? 'ar' : 'en');
    }

    // Sub-greeting (contextual)
    const subEl = $('#welcomeSubText');
    if (subEl) subEl.textContent = subGreeting();

    // Topbar worker name (compact) and avatar initial
    const workerEl = $('#workerName');
    if (workerEl) workerEl.textContent = displayName;
    const avatarEl = $('#welcomeAvatarInitial');
    if (avatarEl) {
      const firstChar = (rawName && !isDefaultName)
        ? rawName.trim().charAt(0)
        : (isAr ? 'م' : 'S');
      avatarEl.textContent = firstChar;
    }

    // التاريخ الميلادي حسب اللغة الحالية
    if (window.SPi18n) {
      $('#todayGregorian').textContent = SPi18n.formatWeekday(today, { weekday: 'long' }) +
        ', ' + SPi18n.formatDate(today, { day: 'numeric', month: 'long', year: 'numeric' });
    } else {
      $('#todayGregorian').textContent =
        `${weekdayNamesAr[today.getDay()]}, ${today.getDate()} ${monthNamesAr[today.getMonth()]} ${today.getFullYear()}`;
    }
    // التاريخ الهجري — قابل للإخفاء من الإعدادات (التاريخ والوقت)
    const hijriEl = $('#todayHijri');
    if (hijriEl) {
      const showHijri = s.showHijri !== false;
      hijriEl.hidden = !showHijri;
      if (showHijri) hijriEl.textContent = formatHijri(today);
    }

    // Status pills
    const pillsContainer = $('#todayStatusPills');
    pillsContainer.innerHTML = '';
    // Day type pill
    if (shift) {
      const p = el('span', { class: 'status-pill ' + shiftClass(shift) }, [
        el('i', { class: 'dot' }), shiftDisplayName(shift)
      ]);
      pillsContainer.appendChild(p);
    } else {
      pillsContainer.appendChild(el('span', { class: 'status-pill' }, [
        el('i', { class: 'dot' }), t('dashboard.no_shift')
      ]));
    }
    // Attendance pill
    if (entry) {
      const map = {
        A: ['present', t('dashboard.status_present')],
        X: ['double', t('dashboard.status_double')],
        L: ['leave', t('dashboard.status_leave')],
        B: ['absent', t('dashboard.status_absent')]
      };
      const m = map[entry.status];
      if (m) {
        pillsContainer.appendChild(el('span', { class: 'status-pill ' + m[0] }, [
          el('i', { class: 'dot' }), m[1]
        ]));
      }
    } else {
      pillsContainer.appendChild(el('span', { class: 'status-pill' }, [
        el('i', { class: 'dot' }), t('dashboard.no_attendance')
      ]));
    }

    // Check-in / Check-out buttons
    const hasCheckIn = entry && (entry.status === 'A' || entry.status === 'X') && entry.from;
    const hasCheckOut = entry && (entry.status === 'A' || entry.status === 'X') && entry.to;
    $('#checkinActions').hidden = !!hasCheckIn;
    $('#checkoutActions').hidden = !hasCheckIn || !!hasCheckOut;
    if (hasCheckIn) {
      $('#checkinTime').textContent = t('dashboard.checkin_done', { time: fmtTime12(entry.from) });
    } else {
      $('#checkinTime').textContent = t('dashboard.checkin_hint');
    }
    if (hasCheckOut) {
      $('#checkoutTime').textContent = t('dashboard.checkout_done', { time: fmtTime12(entry.to) });
    } else if (hasCheckIn) {
      $('#checkoutTime').textContent = t('dashboard.checkout_hint');
    }

    // Today's hours / overtime / value
    const hours = SPAttendance.computeActualHours(entry);
    const overtime = SPAttendance.computeOvertimeHours(today, entry);
    const required = shift ? shift.hours : (Number(s.shiftHours) || 12);
    const value = SPAttendance.dayValue(today, entry);

    $('#todayHours').textContent = fmtHours(hours);
    $('#todayRequired').textContent = fmtHours(required);
    $('#todayOvertime').textContent = '+' + fmtHours(overtime);
    $('#todayValue').textContent = fmtCurrency(value);

    // Period stats (for stats cards + compliance)
    const { start, end } = SPCalendar.getPayPeriod(today);
    const result = SPSalary.computeSalary(start, end);
    $('#statPresent').textContent = result.counts.A;
    $('#statDouble').textContent = result.counts.X;
    $('#statLeave').textContent = result.counts.L;
    $('#statAbsent').textContent = result.counts.B;

    const workedDays = result.counts.A + result.counts.X + result.counts.B;
    const compliancePct = workedDays > 0
      ? Math.round(((result.counts.A + result.counts.X) / workedDays) * 100)
      : 0;
    $('#compliancePct').textContent = compliancePct + '%';
    $('#complianceBar').style.width = compliancePct + '%';
    $('#dueSalary').textContent = fmtCurrency(result.netSalary);
  }

  function shiftClass(shift) {
    // Map shift.color to a known pill class
    if (!shift) return '';
    if (shift.code === 'D') return 'day';
    if (shift.code === 'N') return 'night';
    if (shift.code === 'O') return 'off';
    if (shift.code === 'X') return 'double';
    return 'day';
  }

  // ---------- Data change handler ----------
  let changeTimer = null;
  function onDataChange() {
    // Re-render only the visible page. Rendering hidden pages here caused
    // unnecessary work and could make the first UI feel frozen on mobile.
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      const activeTab = document.querySelector('.tab-btn.active');
      const tab = activeTab ? activeTab.dataset.tab : 'dashboard';

      if (tab === 'dashboard') {
        renderDashboard();
      } else if (tab === 'calendar') {
        SPCalendar.renderCalendar();
        SPCalendar.renderLegend();
      } else if (tab === 'salary') {
        SPSalary.render();
      } else if (tab === 'reports') {
        SPReports.render();
      }

      const nm = (storage.getSettings().name || '').trim();
      $('#workerName').textContent = (nm && nm !== 'موظف') ? nm : '—';
    }, 80);
  }

  // ---------- Search ----------
  function openSearch() {
    $('#searchOverlay').classList.add('show');
    $('#searchSheet').classList.add('show');
    setTimeout(() => $('#searchInput').focus(), 200);
  }
  function closeSearch() {
    $('#searchOverlay').classList.remove('show');
    $('#searchSheet').classList.remove('show');
    $('#searchInput').value = '';
    $('#searchResults').innerHTML = '';
  }

  function performSearch(query, statusFilter) {
    const results = $('#searchResults');
    results.innerHTML = '';
    const att = storage.getAttendance();
    const sched = storage.getSchedule();
    const all = new Set([...Object.keys(att), ...Object.keys(sched)]);
    const q = (query || '').trim().toLowerCase();
    const items = Array.from(all).sort().reverse();

    const filtered = items.filter((dstr) => {
      const entry = att[dstr];
      const code = sched[dstr];
      // Status filter
      if (statusFilter && (!entry || entry.status !== statusFilter)) return false;
      // Text query
      if (q) {
        const date = parseDate(dstr);
        const dateStr = `${date.getDate()} ${monthNamesAr[date.getMonth()]} ${date.getFullYear()}`;
        const dayName = weekdayNamesAr[date.getDay()];
        const shift = code ? storage.getShiftByCode(code) : null;
        const statusLabel = entry ? SPAttendance.statusLabel(entry.status) : '';
        const note = (entry && entry.note) || '';
        const location = (entry && entry.location) || '';
        const haystack = `${dstr} ${dateStr} ${dayName} ${shift ? shift.name : ''} ${statusLabel} ${note} ${location}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    }).slice(0, 60);

    if (filtered.length === 0) {
      results.appendChild(el('div', { class: 'empty-state' }, [
        el('div', { class: 't2' }, [t('search.no_results')])
      ]));
      return;
    }
    filtered.forEach((dstr) => {
      const date = parseDate(dstr);
      const entry = att[dstr];
      const code = sched[dstr];
      const shift = code ? storage.getShiftByCode(code) : null;
      const statusLabel = entry ? SPAttendance.statusLabel(entry.status) : t('status.unrecorded');
      const row = el('button', {
        class: 'item',
        style: 'display:flex;width:100%;padding:12px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r-md);margin-bottom:6px;text-align:start;cursor:pointer;font-family:inherit;color:var(--text);'
      });
      const left = el('div', { style: 'flex:1;' }, []);
      left.appendChild(el('div', { class: 'fs-md fw-bold' }, [
        SPi18n ? SPi18n.formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })
          : `${date.getDate()} ${monthNamesAr[date.getMonth()]} ${date.getFullYear()}`
      ]));
      left.appendChild(el('div', { class: 'fs-sm muted' }, [
        `${SPi18n ? SPi18n.formatWeekday(date, { weekday: 'long' }) : weekdayNamesAr[date.getDay()]} • ${shift ? shiftDisplayName(shift) : '—'} • ${statusLabel}`
      ]));
      if (entry && entry.note) {
        left.appendChild(el('div', { class: 'fs-sm text-2', style: 'margin-top:4px;' }, ['📝 ' + entry.note]));
      }
      row.appendChild(left);
      if (entry) {
        const cls = entry.status === 'A' ? 'present' : entry.status === 'X' ? 'double' :
          entry.status === 'L' ? 'leave' : 'absent';
        row.appendChild(el('span', { class: 'status-pill ' + cls }, [statusLabel]));
      }
      row.addEventListener('click', () => {
        closeSearch();
        goToTab('calendar');
        setTimeout(() => SPAttendance.openDaySheet(date), 250);
      });
      results.appendChild(row);
    });
  }

  // ---------- Notifications (local, scheduled via setTimeout) ----------
  let notifTimers = [];
  function setupNotifications() {
    // Clear previous
    notifTimers.forEach((t) => clearTimeout(t));
    notifTimers = [];
    const s = storage.getSettings();
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const today = new Date(now);

    function scheduleAt(timeStr, title, body) {
      if (!timeStr) return;
      const [h, m] = timeStr.split(':').map(Number);
      const target = new Date(today);
      target.setHours(h, m, 0, 0);
      if (target <= now) return; // already past
      const ms = target - now;
      const t = setTimeout(() => {
        try {
          new Notification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png' });
        } catch (e) {}
      }, ms);
      notifTimers.push(t);
    }

    if (s.notifyCheckIn) {
      scheduleAt(s.notifyCheckInTime, t('notif.checkin_title'), t('notif.checkin_body'));
    }
    if (s.notifyCheckOut) {
      scheduleAt(s.notifyCheckOutTime, t('notif.checkout_title'), t('notif.checkout_body'));
    }
    if (s.notifyShiftEnd) {
      const today = new Date();
      const dstr = fmtDate(today);
      const code = storage.getScheduledCode(dstr);
      const shift = code ? storage.getShiftByCode(code) : null;
      if (shift && shift.endTime) {
        scheduleAt(shift.endTime, t('notif.shift_end_title'), t('notif.shift_end_body'));
      }
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      toast(t('notif.unsupported'), 'warning');
      return false;
    }
    if (Notification.permission === 'granted') return true;
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      toast(t('notif.enabled_toast'), 'success');
      setupNotifications();
      return true;
    } else {
      toast(t('notif.denied_toast'), 'warning');
      return false;
    }
  }

  // ---------- PWA install prompt ----------
   // ---------- PWA install prompt ----------
let installBannerTimer = null;

function hideInstallBanner(dismiss = false) {
  const banner = $('#installBanner');
  if (!banner) return;

  if (installBannerTimer) {
    clearTimeout(installBannerTimer);
    installBannerTimer = null;
  }

  banner.classList.remove('show');
  banner.hidden = true;
  banner.setAttribute('aria-hidden', 'true');
  banner.style.pointerEvents = 'none';

  if (dismiss) {
    storage.setMeta(
      'installDismissedAt',
      new Date().toISOString()
    );
  }
}

function showInstallBanner() {
  const banner = $('#installBanner');
  if (!banner) return;

  banner.hidden = false;
  banner.removeAttribute('aria-hidden');
  banner.style.pointerEvents = 'auto';

  requestAnimationFrame(() => {
    banner.classList.add('show');
  });
}

function setupInstallPrompt() {
  const banner = $('#installBanner');
  const acceptBtn = $('#installAcceptBtn');
  const dismissBtn = $('#installDismissBtn');
  if (!banner || !acceptBtn || !dismissBtn) return;

  banner.hidden = true;
  banner.setAttribute('aria-hidden', 'true');
  banner.style.pointerEvents = 'none';

  // لا تعرض خيار التثبيت إذا كان التطبيق يعمل بالفعل كتطبيق مثبت.
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;
  if (isStandalone) return;

  const wasDismissedRecently = () => {
    const dismissed = storage.getMeta('installDismissedAt');
    if (!dismissed) return false;
    const dismissedTime = new Date(dismissed).getTime();
    if (!Number.isFinite(dismissedTime)) return false;
    return (Date.now() - dismissedTime) / 86400000 < 7;
  };

  const scheduleBanner = (delay = 2500) => {
    if (wasDismissedRecently() || installBannerTimer) return;
    installBannerTimer = setTimeout(() => {
      installBannerTimer = null;
      showInstallBanner();
    }, delay);
  };

  // Android/Chrome: احتفظ بحدث التثبيت الحقيقي إن كان المتصفح يدعمه.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
    scheduleBanner(800);
  });

  // iOS وبعض المتصفحات لا تطلق beforeinstallprompt؛ اعرض إرشاد التثبيت اليدوي.
  // هذا يجعل خيار التثبيت متاحًا بدل اختفاء الشريط تمامًا.
  scheduleBanner(3500);

  acceptBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!installPromptEvent) {
      toast(t('pwa.manual_hint'), 'info');
      return;
    }

    hideInstallBanner(false);
    const promptEvent = installPromptEvent;
    installPromptEvent = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') toast(t('pwa.installing'), 'success');
    } catch (err) {
      console.warn('[PWA] install prompt failed', err);
      toast(t('pwa.manual_hint'), 'info');
    }
  });

  dismissBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (installBannerTimer) {
      clearTimeout(installBannerTimer);
      installBannerTimer = null;
    }
    hideInstallBanner(true);
  });

  banner.addEventListener('click', (e) => {
    if (e.target && e.target.closest && e.target.closest('#installDismissBtn')) {
      e.preventDefault();
      e.stopPropagation();
      if (installBannerTimer) {
        clearTimeout(installBannerTimer);
        installBannerTimer = null;
      }
      hideInstallBanner(true);
    }
  }, true);

  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    hideInstallBanner(false);
    storage.setMeta('installedAt', new Date().toISOString());
    toast(t('pwa.installed_toast'), 'success');
  });
}

  // ---------- Service worker ----------
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch((err) => {
        console.warn('[SW] registration failed', err);
      });
      // Listen for updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Refresh to apply update
        if (navigator.serviceWorker.controller) {
          // Don't auto-reload; just notify
          // User can refresh manually
        }
      });
    }
  }

  // ---------- Update worker name in topbar ----------
  function updateTopbar() {
    const nm = (storage.getSettings().name || '').trim();
    $('#workerName').textContent = (nm && nm !== 'موظف') ? nm : '—';
  }

  // ---------- Handle URL params (PWA shortcuts) ----------
  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const action = params.get('action');
    if (tab) {
      setTimeout(() => goToTab(tab), 300);
    }
    if (action === 'checkin') {
      setTimeout(() => {
        SPAttendance.checkInToday ? null : null;
        // Trigger via the dashboard button to ensure proper flow
        const btn = $('#checkinBtn');
        if (btn && !btn.hidden) btn.click();
      }, 500);
    }
  }

  // ---------- Init ----------
  function init() {
    // Always release the splash independently of optional modules.
    // This prevents one initialization error from making the first screen appear frozen.
    const bootStart = Date.now();
    const releaseSplash = () => {
      try { hideSplash(); } catch (e) {}
    };
    requestAnimationFrame(() => requestAnimationFrame(releaseSplash));
    setTimeout(releaseSplash, 750);

    // Initialize storage (runs migration if needed)
    try {
      storage.init();
      storage.subscribe(onDataChange);
    } catch (e) {
      console.error('[Init] storage error', e);
    }

    // Apply theme
    try {
      SPSettings.applyTheme();
      updateTopbar();
    } catch (e) {
      console.error('[Init] theme error', e);
    }

    // Initialize modules independently so one optional feature cannot stop the app.
    const safeInit = (name, fn) => {
      try { fn(); }
      catch (e) { console.error('[Init] ' + name + ' error', e); }
    };
    safeInit('calendar', () => SPCalendar.init());
    safeInit('attendance', () => SPAttendance.init());
    safeInit('salary', () => SPSalary.init());
    safeInit('reports', () => SPReports.init());
    safeInit('settings', () => SPSettings.init());

    // First paint: render only the dashboard.
    // Other pages are rendered when the user opens them, preventing a heavy
    // first-load freeze on mobile/PWA.
    safeInit('dashboard', renderDashboard);
    updateLiveAttendanceTimer();
    if (!liveAttendanceTimerId) liveAttendanceTimerId = setInterval(updateLiveAttendanceTimer, 1000);

    // Live clock (Africa/Cairo) — يعمل بعد أول رسم حتى لا يؤخر الإقلاع
    if (window.SPClock) {
      safeInit('clock', () => SPClock.init());
    }

    // Prepare secondary views after the first frame, without blocking the UI.
    const warmSecondaryViews = () => {
      try {
        SPCalendar.renderCalendar();
        SPCalendar.renderLegend();
        SPSalary.render();
      } catch (e) {
        console.error('[Init] secondary render error', e);
      }
    };
    if (window.requestIdleCallback) {
      requestIdleCallback(warmSecondaryViews, { timeout: 1200 });
    } else {
      setTimeout(warmSecondaryViews, 350);
    }

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', onClickOnce(() => goToTab(btn.dataset.tab)));
    });

    // More-page card: opens the scoped Egyptian Labor Law reader.
    // This button intentionally does NOT use data-sheet (which would
    // route through openSheetByName); instead it switches to the law
    // tab so the reader gets a full-screen experience.
    const laborLawBtn = document.getElementById('moreLaborLawBtn');
    if (laborLawBtn) {
      laborLawBtn.addEventListener('click', onClickOnce(() => goToTab('law')));
    }

    // Search
    $('#searchBtn').addEventListener('click', onClickOnce(openSearch));
    $('#closeSearchBtn').addEventListener('click', closeSearch);
    $('#searchOverlay').addEventListener('click', closeSearch);
    const debouncedSearch = debounce(() => {
      const q = $('#searchInput').value;
      performSearch(q, null);
    }, 200);
    $('#searchInput').addEventListener('input', debouncedSearch);
    document.querySelectorAll('[data-search-status]').forEach((chip) => {
      chip.addEventListener('click', () => {
        performSearch('', chip.dataset.searchStatus);
      });
    });

    // Hide splash after the first usable paint; 2.2s made the app feel stuck.
    requestAnimationFrame(() => {
      requestAnimationFrame(hideSplash);
    });
    setTimeout(hideSplash, 900);
    // Also hide on first tap
    const hideOnTap = () => {
      hideSplash();
      document.removeEventListener('click', hideOnTap);
      document.removeEventListener('keydown', hideOnTap);
    };
    document.addEventListener('click', hideOnTap);
    document.addEventListener('keydown', hideOnTap);

    // PWA + SW
    registerSW();
    setupInstallPrompt();

    // Notifications — request on first action only, not on load
    // But setup if already granted
    if ('Notification' in window && Notification.permission === 'granted') {
      setupNotifications();
    }

    // Non-critical background services start after the first screen is usable.
    const startBackgroundServices = () => {
      if (window.SPNotifications) {
        try {
          SPNotifications.init();
          SPNotifications.checkMissedOnOpen();
        } catch (e) {
          console.error('[Notif] init error', e);
        }
      }

      if (window.SPBackup) {
        SPBackup.autoBackupIfNeeded().then((done) => {
          if (done) console.log('[Backup] Weekly auto-snapshot created');
        }).catch(() => {});
      }
    };
    if (window.requestIdleCallback) {
      requestIdleCallback(startBackgroundServices, { timeout: 1800 });
    } else {
      setTimeout(startBackgroundServices, 900);
    }

    // ====== App Lock (PIN + WebAuthn) ======
    if (window.SPAppLock) {
      // افحص القفل قبل عرض المحتوى
      SPAppLock.checkAndLock();
      // استمع لـ visibility change - لو التطبيق اترخّن ورجع، افحص القفل
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          if (SPAppLock.isLockEnabled() && !SPAppLock.isUnlocked()) {
            SPAppLock.showLockScreen();
          }
        }
      });
    }

    // Watch for system time zone / date changes (e.g., when app stays open across midnight)
    let lastDay = new Date().getDate();
    setInterval(() => {
      const today = new Date().getDate();
      if (today !== lastDay) {
        lastDay = today;
        onDataChange();
        setupNotifications();
      }
    }, 60000);

    // Handle URL params
    handleUrlParams();

    // Handle keyboard: ESC closes any open sheet
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.sheet.show').forEach((s) => s.classList.remove('show'));
        document.querySelectorAll('.sheet-overlay.show').forEach((o) => o.classList.remove('show'));
      }
    });

    // ====== i18n: إعادة الرسم عند تبديل اللغة (مستقل عن وجود زر langBtn) ======
    const langBtn = $('#langBtn');
    const langLabel = $('#langLabel');
    const updateLangLabel = () => {
      if (langLabel) {
        langLabel.textContent = (window.SPi18n ? SPi18n.getLocale() : 'ar').toUpperCase();
      }
    };
    updateLangLabel();
    if (langBtn) {
      langBtn.addEventListener('click', onClickOnce(() => {
        if (window.SPi18n) SPi18n.toggleLocale();
        updateLangLabel();
        toast(t('msg.updated'), 'info');
      }));
    }
    if (window.SPi18n) {
      SPi18n.subscribe((locale) => {
        updateLangLabel();
        try {
          renderDashboard();
          SPCalendar.renderCalendar();
          if (typeof SPCalendar.renderLegend === 'function') SPCalendar.renderLegend();
          SPSalary.render();
          SPReports.render();
          if (window.SPClock && typeof SPClock.render === 'function') SPClock.render();
        } catch (e) { console.error('[i18n] re-render error', e); }
      });
    }

    // ====== Privacy Mode ======
    const privacyBtn = $('#privacyBtn');
    if (privacyBtn && window.SPUX) {
      const updatePrivacyUI = () => {
        if (SPUX.isPrivacyOn()) {
          privacyBtn.classList.add('privacy-on');
        } else {
          privacyBtn.classList.remove('privacy-on');
        }
      };
      updatePrivacyUI();
      privacyBtn.addEventListener('click', onClickOnce(() => {
        SPUX.togglePrivacy();
        updatePrivacyUI();
      }));
    }

    // ====== Undo / Redo ======
    const undoBtn = $('#undoBtn');
    const redoBtn = $('#redoBtn');
    function updateUndoRedoUI() {
      if (!window.SPUndoRedo) return;
      if (undoBtn) undoBtn.hidden = !SPUndoRedo.canUndo();
      if (redoBtn) redoBtn.hidden = !SPUndoRedo.canRedo();
    }
    if (undoBtn) undoBtn.addEventListener('click', onClickOnce(() => SPUndoRedo.undo()));
    if (redoBtn) redoBtn.addEventListener('click', onClickOnce(() => SPUndoRedo.redo()));
    if (window.SPUndoRedo) SPUndoRedo.subscribe(updateUndoRedoUI);
    updateUndoRedoUI();

    // اختصارات لوحة المفاتيح: Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
    document.addEventListener('keydown', (e) => {
      if (!window.SPUndoRedo) return;
      // تجاهل لو المستخدم بيكتب في input
      const tag = (e.target.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (isInput) return;
        e.preventDefault();
        SPUndoRedo.undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        if (isInput) return;
        e.preventDefault();
        SPUndoRedo.redo();
      }
    });

    // Console signature
    console.log('%cShiftPro v2.0', 'color:#3b82f6;font-size:18px;font-weight:bold;');
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.SPApp = {
    onDataChange,
    goToTab,
    requestNotificationPermission
  };
})(window);
