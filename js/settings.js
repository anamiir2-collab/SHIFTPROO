/* ShiftPro - Settings Module
   Handles: general settings sheet, shift manager, leave balance,
   stats, backup/restore, about, theme switching, font size.
   Exposes: window.SPSettings
*/
(function (global) {
  'use strict';

  const {
    $, el, fmtDate, parseDate, fmtNum, fmtCurrency, toast,
    confirmDialog, onClickOnce, haptic
  } = SPUtils;

  const storage = SPStorage;

  // دالة ترجمة محلية
  function t(key, vars) {
    return global.SPi18n ? global.SPi18n.t(key, vars) : key;
  }

  // =========================================================
  // Theme & font size
  // =========================================================

  function applyTheme() {
    const s = storage.getSettings();

    document.documentElement.dataset.theme = s.theme || 'auto';
    document.documentElement.dataset.fontsize = s.fontSize || 'medium';

    const meta = $('#metaTheme');

    if (meta) {
      const isDark =
        s.theme === 'dark' ||
        (
          s.theme === 'auto' &&
          window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
        );

      // Premium navy palette: deep navy in dark mode, primary navy in light
      meta.content = isDark ? '#16203A' : '#1E2A44';
    }

    const icon = $('#themeIcon');

    if (icon) {
      if (s.theme === 'light') {
        icon.innerHTML =
          '<circle cx="12" cy="12" r="4"></circle>' +
          '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4' +
          'M17.7 17.7l1.4 1.4M2 12h2M20 12h2' +
          'M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';
      } else {
        icon.innerHTML =
          '<path d="M21 12.8A9 9 0 1 1 11.2 3' +
          ' 7 7 0 0 0 21 12.8z"></path>';
      }
    }
  }

  function cycleTheme() {
    const s = storage.getSettings();

    const order = ['auto', 'dark', 'light'];
    const i = order.indexOf(s.theme || 'auto');
    const next = order[(i + 1) % order.length];

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("save settings");


    storage.saveSettings({
      theme: next
    });

    applyTheme();
    haptic(10);

    toast(
      t('settings.theme_changed', {
        theme: next === 'auto'
          ? t('settings.theme_auto')
          : next === 'dark'
            ? t('settings.theme_dark')
            : t('settings.theme_light')
      }),
      'info'
    );
  }

  // =========================================================
  // General settings sheet
  // =========================================================

  function openSettingsSheet(target = 'settings') {
    const s = storage.getSettings();

    $('#inpName').value = s.name || '';
    $('#inpJob').value = s.job || '';
    $('#inpEmployeeId').value = s.employeeId || '';
    $('#inpCompany').value = s.company || '';

    $('#inpSalaryMethod').value =
      s.salaryMethod || 'monthly';

    $('#inpSalary').value =
      s.salary || '';

    $('#inpMonthlyHours').value =
      s.monthlyHours || '';

    $('#inpShiftHours').value =
      s.shiftHours || '';

    $('#inpHourlyRate').value =
      s.hourlyRate || '';

    $('#inpOvertimeEnabled').checked =
      !!s.overtimeEnabled;

    $('#inpOvertimeRate').value =
      s.overtimeRate || 1.5;

    $('#inpOvertimeAfterHours').value =
      s.overtimeAfterHours || '';

    $('#inpDeductAbsence').checked =
      !!s.deductAbsence;

    $('#inpDeductLate').checked =
      !!s.deductLate;

    $('#inpLateGrace').value =
      s.lateGraceMinutes || 0;

    $('#inpCycleDay').value =
      s.cycleDay || 26;

    const themeInput = $('#inpTheme');
    if (themeInput) themeInput.value = s.theme || 'auto';

    // Safe-guard: #inpFontSize lives in the App-Control sheet, not here.
    // Setting .value on a null element used to crash the whole sheet open.
    const fontSizeInput = $('#inpFontSize');
    if (fontSizeInput) fontSizeInput.value = s.fontSize || 'medium';

    const isSalary = target === 'salarySettings';
    const overlayEl = $(isSalary ? '#salarySettingsOverlay' : '#settingsOverlay');
    const sheetEl = $(isSalary ? '#salarySettingsSheet' : '#settingsSheet');
    if (overlayEl) overlayEl.classList.add('show');
    if (sheetEl) sheetEl.classList.add('show');

    // Focus the selected sheet at its top for accessibility.
    try { sheetEl && sheetEl.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  }

  function closeSettingsSheet() {
    const overlayEl = $('#settingsOverlay');
    const sheetEl = $('#settingsSheet');
    if (overlayEl) overlayEl.classList.remove('show');
    if (sheetEl) sheetEl.classList.remove('show');
    const salaryOverlay = $('#salarySettingsOverlay');
    const salarySheet = $('#salarySettingsSheet');
    if (salaryOverlay) salaryOverlay.classList.remove('show');
    if (salarySheet) salarySheet.classList.remove('show');
  }

  function closeSalarySettingsSheet() {
    const overlayEl = $('#salarySettingsOverlay');
    const sheetEl = $('#salarySettingsSheet');
    if (overlayEl) overlayEl.classList.remove('show');
    if (sheetEl) sheetEl.classList.remove('show');
  }

  function saveSettings() {
    let cycleDay =
      Number($('#inpCycleDay').value) || 26;

    if (cycleDay < 1) cycleDay = 1;
    if (cycleDay > 28) cycleDay = 28;

    const s = {
      name:
        $('#inpName').value.trim(),

      job:
        $('#inpJob').value.trim(),

      employeeId:
        $('#inpEmployeeId').value.trim(),

      company:
        $('#inpCompany').value.trim(),

      salaryMethod:
        $('#inpSalaryMethod').value,

      salary:
        Number($('#inpSalary').value) || 0,

      monthlyHours:
        Number($('#inpMonthlyHours').value) || 208,

      shiftHours:
        Number($('#inpShiftHours').value) || 12,

      hourlyRate:
        Number($('#inpHourlyRate').value) || 0,

      overtimeEnabled:
        $('#inpOvertimeEnabled').checked,

      overtimeRate:
        Number($('#inpOvertimeRate').value) || 1.5,

      overtimeAfterHours:
        Number($('#inpOvertimeAfterHours').value) || 0,

      deductAbsence:
        $('#inpDeductAbsence').checked,

      deductLate:
        $('#inpDeductLate').checked,

      lateGraceMinutes:
        Number($('#inpLateGrace').value) || 0,

      cycleDay,

      theme:
        ($('#inpTheme') ? $('#inpTheme').value : (storage.getSettings().theme || 'auto')),

      // Safe-guard: #inpFontSize is in App-Control sheet, not General Settings.
      // Reading .value off null used to crash saveSettings() entirely.
      fontSize:
        ($('#inpFontSize') ? $('#inpFontSize').value : (storage.getSettings().fontSize || 'medium'))
    };

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("save settings");


    storage.saveSettings(s);

    applyTheme();
    closeSettingsSheet();
    closeSalarySettingsSheet();

    toast(t('settings.saved_toast'), 'success');

    SPApp.onDataChange();
  }

  // =========================================================
  // Shift Manager
  // =========================================================

  function openShiftsSheet() {
    renderShiftsList();
    renderTemplatesList();
    populateRepeatShiftSelect();

    $('#shiftsOverlay').classList.add('show');
    $('#shiftsSheet').classList.add('show');
  }

  // ====== قوالب الورديات السريعة ======
  function renderTemplatesList() {
    const list = $('#templatesList');
    if (!list) return;
    list.innerHTML = '';
    const tpls = (window.SPTemplates) ? SPTemplates.getTemplates() : [];
    if (tpls.length === 0) {
      list.appendChild(el('p', { class: 'muted fs-sm ta-c', style: 'padding:10px;' }, [t('shifts.no_templates')]));
      return;
    }
    tpls.forEach((tpl) => {
      const card = el('button', {
        class: 'template-card',
        style: 'background:' + (tpl.color || '#3b82f6') + '15; border:1px solid ' + (tpl.color || '#3b82f6') + ';',
        'data-tpl-id': tpl.id,
        title: SPTemplates.getTemplateName(tpl)
      }, [
        el('div', { class: 'tpl-color', style: 'background:' + (tpl.color || '#3b82f6') }, []),
        el('span', { class: 'tpl-name' }, [SPTemplates.getTemplateName(tpl)]),
        el('span', { class: 'tpl-code' }, [tpl.shiftCode || ''])
      ]);
      card.addEventListener('click', onClickOnce(() => {
        const start = $('#patternStart').value;
        if (!start) {
          toast(t('shifts.need_start_tpl'), 'warning');
          return;
        }
        const count = SPTemplates.applyTemplate(tpl.id, start, 30);
        toast(t('shifts.tpl_applied', { n: count }), 'success');
        closeShiftsSheet();
        SPApp.onDataChange();
      }));
      list.appendChild(card);
    });
  }

  function populateRepeatShiftSelect() {
    const sel = $('#repeatShift');
    if (!sel) return;
    sel.innerHTML = '';
    storage.getShifts().forEach((s) => {
      sel.appendChild(el('option', { value: s.code }, [SPUtils.shiftDisplayName(s) + ' (' + s.code + ')']));
    });
  }

  function applyRepeatRule() {
    if (!window.SPTemplates) return;
    const shiftCode = $('#repeatShift').value;
    const from = $('#repeatFrom').value;
    const to = $('#repeatTo').value;
    const type = $('#repeatType').value;
    if (!shiftCode || !from || !to) {
      toast(t('shifts.fill_all'), 'warning');
      return;
    }
    if (to < from) {
      toast(t('shifts.end_before_start'), 'warning');
      return;
    }
    let customDays = null;
    if (type === 'custom') {
      customDays = Array.from(document.querySelectorAll('#weekdayChips .chip.active'))
        .map((b) => Number(b.dataset.day));
      if (customDays.length === 0) {
        toast(t('shifts.pick_one_day'), 'warning');
        return;
      }
    }
    const count = SPTemplates.applyRepeatRule({
      shiftCode, startDate: from, endDate: to, type, customDays
    });
    toast(t('shifts.repeat_applied', { n: count }), 'success');
    closeShiftsSheet();
    SPApp.onDataChange();
  }

  function closeShiftsSheet() {
    $('#shiftsOverlay').classList.remove('show');
    $('#shiftsSheet').classList.remove('show');
  }

  function renderShiftsList() {
    const list = $('#shiftsList');

    list.innerHTML = '';

    const shifts = storage.getShifts();

    shifts.forEach((s) => {
      const row = el('div', {
        class:
          'setting-row',
        style:
          'border:1px solid var(--line);' +
          'border-radius:var(--r-md);' +
          'padding:10px 12px;' +
          'margin-bottom:8px;'
      });

      const meta = el('div', {
        class: 'meta'
      });

      meta.appendChild(
        el('div', {
          class: 'row gap-2'
        }, [
          el('span', {
            class: 'tag-dot',
            style: `background:${s.color}`
          }),

          el('div', {
            class: 't1'
          }, [
            SPUtils.shiftDisplayName(s) + ' (' + s.code + ')'
          ])
        ])
      );

      meta.appendChild(
        el('div', {
          class: 't2'
        }, [
          s.startTime
            ? `${s.startTime} - ${s.endTime} (${SPUtils.fmtHours(s.hours)})`
            : t('shifts.leave_shift'),

          ' • ',

          s.isWorkDay
            ? t('shifts.workday')
            : t('shifts.off')
        ])
      );

      row.appendChild(meta);

      // Edit
      const editBtn = el('button', {
        class: 'icon-btn',
        style: 'width:36px;height:36px;',
        'aria-label': t('common.edit')
      });

      editBtn.innerHTML =
        '<svg viewBox="0 0 24 24" style="width:16px;height:16px;">' +
        '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>' +
        '</svg>';

      editBtn.addEventListener(
        'click',
        () => openShiftEditor(s)
      );

      row.appendChild(editBtn);

      // Delete
      if (!s.isBuiltIn) {
        const delBtn = el('button', {
          class:
            'icon-btn',
          style:
            'width:36px;height:36px;color:var(--danger);',
          'aria-label':
            t('common.delete')
        }, ['×']);

        delBtn.addEventListener(
          'click',
          async () => {
            const ok = await confirmDialog(
              t('shifts.delete_confirm', { name: SPUtils.shiftDisplayName(s) }),
              {
                okText: t('common.delete'),
                danger: true
              }
            );

            if (!ok) return;

            storage.deleteShift(s.id);

            renderShiftsList();

            SPApp.onDataChange();

            toast(
              t('shifts.deleted'),
              'success'
            );
          }
        );

        row.appendChild(delBtn);
      }

      list.appendChild(row);
    });
  }

  // =========================================================
  // Shift Editor
  // =========================================================

  function openShiftEditor(shift) {
    const isNew = !shift;

    $('#shiftEditTitle').textContent =
      isNew
        ? t('shifts.new_shift')
        : t('shifts.title');

    $('#shiftName').value =
      shift ? shift.name : '';

    $('#shiftCode').value =
      shift ? shift.code : '';

    $('#shiftStart').value =
      shift ? shift.startTime : '';

    $('#shiftEnd').value =
      shift ? shift.endTime : '';

    $('#shiftHours').value =
      shift ? shift.hours : 0;

    $('#shiftColor').value =
      shift ? shift.color : '#3b82f6';

    $('#shiftIsWorkDay').checked =
      shift
        ? shift.isWorkDay
        : true;

    $('#shiftEditSheet').dataset.editId =
      shift
        ? shift.id
        : '';

    $('#shiftEditOverlay').classList.add('show');
    $('#shiftEditSheet').classList.add('show');
  }

  function closeShiftEditor() {
    $('#shiftEditOverlay').classList.remove('show');
    $('#shiftEditSheet').classList.remove('show');
  }

  function saveShift() {
    const name =
      $('#shiftName').value.trim();

    const code =
      $('#shiftCode').value.trim().toUpperCase();

    if (!name) {
      toast(
        t('shifts.enter_name'),
        'warning'
      );
      return;
    }

    if (!code) {
      toast(
        t('shifts.enter_code'),
        'warning'
      );
      return;
    }

    const start =
      $('#shiftStart').value;

    const end =
      $('#shiftEnd').value;

    let hours =
      Number($('#shiftHours').value) || 0;

    if (!hours && start && end) {
      hours =
        SPUtils.computeRangeHours(
          start,
          end
        );
    }

    const id =
      $('#shiftEditSheet').dataset.editId ||
      ('s-' + Date.now().toString(36));

    const existing =
      storage.getShiftById(id);

    const shift = {
      id,
      name,
      code,
      startTime: start,
      endTime: end,
      hours,

      color:
        $('#shiftColor').value,

      isWorkDay:
        $('#shiftIsWorkDay').checked,

      isBuiltIn:
        existing
          ? existing.isBuiltIn
          : false
    };

    storage.upsertShift(shift);

    closeShiftEditor();

    renderShiftsList();

    SPApp.onDataChange();

    toast(
      t('shifts.saved'),
      'success'
    );
  }

  // =========================================================
  // Pattern application
  // =========================================================

  function applyPattern() {
    const startDate =
      $('#patternStart').value;

    const seqStr =
      $('#patternSeq').value
        .trim()
        .toUpperCase();

    if (!startDate) {
      toast(
        t('shifts.need_start'),
        'warning'
      );
      return;
    }

    const codes =
      seqStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    if (codes.length === 0) {
      toast(
        t('shifts.need_seq'),
        'warning'
      );
      return;
    }

    const allCodes =
      storage.getShifts()
        .map((s) => s.code);

    const invalid =
      codes.find(
        (c) => !allCodes.includes(c)
      );

    if (invalid) {
      toast(
        t('shifts.unknown_code', { code: invalid }),
        'error'
      );
      return;
    }

    const start =
      parseDate(startDate);

    const entries = {};

    for (let i = 0; i < 30; i++) {
      const d =
        new Date(start);

      d.setDate(
        d.getDate() + i
      );

      entries[fmtDate(d)] =
        codes[i % codes.length];
    }

    storage.setScheduleMany(entries);

    toast(
      t('shifts.pattern_applied'),
      'success'
    );

    closeShiftsSheet();

    SPApp.onDataChange();
  }

  function clearPattern() {
    $('#patternStart').value = '';
    $('#patternSeq').value = '';

    toast(
      t('shifts.pattern_cleared'),
      'info'
    );
  }

  // =========================================================
  // Leave Balance
  // =========================================================

  // دالة i18n مساعدة
  function L(key, vars) {
    return window.SPi18n ? SPi18n.t(key, vars) : key;
  }

  function openNewLeaveSheet() {
    // املأ قائمة الأنواع
    const sel = $('#leaveTypeSelect');
    if (sel) {
      sel.innerHTML = '';
      (window.SPLeaves ? SPLeaves.LEAVE_TYPES : []).forEach((type) => {
        const opt = el('option', { value: type.id }, [SPLeaves.getTypeName(type.id)]);
        sel.appendChild(opt);
      });
    }
    // القيم الافتراضية
    const today = new Date();
    const todayISO = SPUtils.fmtDate(today);
    if ($('#leaveFromInput')) $('#leaveFromInput').value = todayISO;
    if ($('#leaveToInput')) $('#leaveToInput').value = todayISO;
    if ($('#leaveHalfDayCheck')) $('#leaveHalfDayCheck').checked = false;
    if ($('#leaveHoursCheck')) $('#leaveHoursCheck').checked = false;
    if ($('#leaveHoursInput')) $('#leaveHoursInput').value = '';
    if ($('#leaveReasonInput')) $('#leaveReasonInput').value = '';
    if ($('#leaveNoteInput')) $('#leaveNoteInput').value = '';
    if ($('#leaveStatusSelect')) $('#leaveStatusSelect').value = 'pending';

    $('#newLeaveOverlay').classList.add('show');
    $('#newLeaveSheet').classList.add('show');
    setTimeout(() => { if ($('#leaveFromInput')) $('#leaveFromInput').focus(); }, 200);
  }

  function closeNewLeaveSheet() {
    $('#newLeaveOverlay').classList.remove('show');
    $('#newLeaveSheet').classList.remove('show');
  }

  function saveNewLeaveRequest() {
    if (!window.SPLeaves) {
      toast(t('leave.module_missing'), 'error');
      return;
    }
    const type = $('#leaveTypeSelect').value;
    const from = $('#leaveFromInput').value;
    const to = $('#leaveToInput').value || from;
    const halfDay = $('#leaveHalfDayCheck').checked;
    const halfPeriod = $('#leaveHalfPeriod').value;
    const hours = $('#leaveHoursCheck').checked ? Number($('#leaveHoursInput').value) : 0;
    const reason = $('#leaveReasonInput').value.trim();
    const note = $('#leaveNoteInput').value.trim();
    const status = $('#leaveStatusSelect').value;

    if (!type || !from) {
      toast(L('common.required'), 'warning');
      return;
    }
    if (to < from) {
      toast(L('leave.to_label') + ' < ' + L('leave.from_label'), 'warning');
      return;
    }

    // تحقق من الرصيد لو الحالة مقبولة
    if (status === 'approved') {
      const bal = SPLeaves.calculateBalances(new Date(from).getFullYear());
      const current = bal[type];
      if (current && current.remaining < SPLeaves.countLeaveDays({
        fromDate: from, toDate: to, halfDay, hours
      })) {
        toast(L('msg.leave_balance_low', { remaining: current.remaining }), 'warning');
        // ما ترجعش - خلّي المستخدم يكمّل لو حابب
      }
    }

    const req = SPLeaves.addRequest({
      type, fromDate: from, toDate: to,
      halfDay, halfPeriod, hours, reason, note, status
    });
    toast(L('msg.added'), 'success');
    closeNewLeaveSheet();
    // إعادة رسم
    renderLeaveBalance();
    renderLeaveRecords();
    if (window.SPApp && SPApp.onDataChange) SPApp.onDataChange();
  }

  function openLeaveSheet() {
    renderLeaveBalance();
    renderLeaveRecords();

    $('#leaveOverlay').classList.add('show');
    $('#leaveSheet').classList.add('show');
  }

  function closeLeaveSheet() {
    $('#leaveOverlay').classList.remove('show');
    $('#leaveSheet').classList.remove('show');
  }

  // ---------------------------------------------------------
  // Normalize leave hours
  // ---------------------------------------------------------

  function getLeaveHours(entry) {
    if (!entry) return 0;

    let hours =
      Number(entry.leaveHours);

    if (!Number.isFinite(hours)) {
      hours = 8;
    }

    if (hours < 0) hours = 0;
    if (hours > 24) hours = 24;

    return hours;
  }

  // ---------------------------------------------------------
  // Convert leave hours to days
  // 8 hours = 1 day
  // ---------------------------------------------------------

  function leaveHoursToDays(hours) {
    const h =
      Number(hours) || 0;

    return h / 8;
  }

  // ---------------------------------------------------------
  // Normalize leave type
  // ---------------------------------------------------------

  function normalizeLeaveType(type) {
    const value =
      String(type || 'annual')
        .trim()
        .toLowerCase();

    const aliases = {
      annual: 'annual',
      سنوية: 'annual',

      casual: 'casual',
      عارضة: 'casual',

      sick: 'sick',
      مرضية: 'sick',

      unpaid: 'unpaid',
      بدون_راتب: 'unpaid',
      'بدون راتب': 'unpaid',

      periodic: 'periodic',
      دورية: 'periodic',

      other: 'other',
      أخرى: 'other',
      اخرى: 'other'
    };

    return aliases[value] || 'annual';
  }

  // ---------------------------------------------------------
  // Calculate used leave from attendance
  //
  // IMPORTANT:
  // Attendance records are the single source of truth.
  //
  // Example:
  // 8h  = 1 day
  // 4h  = 0.5 day
  // 6h  = 0.75 day
  // ---------------------------------------------------------

  function calculateUsedLeave() {
    const used = {
      annual: 0,
      casual: 0,
      sick: 0,
      unpaid: 0,
      periodic: 0,
      other: 0
    };

    const attendance =
      storage.getAttendance() || {};

    Object.values(attendance).forEach((entry) => {
      if (!entry || entry.status !== 'L') {
        return;
      }

      const type =
        normalizeLeaveType(
          entry.leaveType
        );

      const hours =
        getLeaveHours(entry);

      const days =
        leaveHoursToDays(hours);

      if (!Object.prototype.hasOwnProperty.call(used, type)) {
        used.other += days;
        return;
      }

      used[type] += days;
    });

    return used;
  }

  // ---------------------------------------------------------
  // Format leave days
  // ---------------------------------------------------------

  function formatLeaveDays(value) {
    const n =
      Math.round(
        (Number(value) || 0) * 100
      ) / 100;

    if (Number.isInteger(n)) {
      return String(n);
    }

    return n.toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');
  }

  // ---------------------------------------------------------
  // Render Leave Balance
  // (بتستخدم SPLeaves لو متاح - للأنواع الـ 8 وحساب المتبقي الصحيح)
  // ---------------------------------------------------------

  function renderLeaveBalance() {
    const list = $('#leaveBalanceList');
    const select = $('#leaveTypeOverviewSelect');
    if (!list || !select) return;

    const useLeavesModule = !!window.SPLeaves;
    const bal = useLeavesModule
      ? SPLeaves.calculateBalances(new Date().getFullYear())
      : (() => {
          const stored = storage.getLeaveBalance() || {};
          const used = calculateUsedLeave();
          return Object.keys(stored).reduce((acc, k) => {
            const v = stored[k] || { total: 0 };
            const u = used[k] || 0;
            acc[k] = { total: Number(v.total) || 0, used: u, remaining: (Number(v.total) || 0) - u };
            return acc;
          }, {});
        })();

    const types = useLeavesModule
      ? SPLeaves.LEAVE_TYPES.map((t) => ({ key:t.id, label:SPLeaves.getTypeName(t.id), color:t.color }))
      : [
          {key:'annual',label:t('leave.annual_long'),color:'#315f9f'},
          {key:'casual',label:t('leave.casual_long'),color:'#2e8b68'},
          {key:'sick',label:t('leave.sick_long'),color:'#c95353'},
          {key:'unpaid',label:t('leave.unpaid_long'),color:'#748095'},
          {key:'periodic',label:t('leave.periodic_long'),color:'#c88928'}
        ];

    const previous = select.value;
    select.innerHTML = '';
    types.forEach((t) => {
      select.appendChild(el('option', { value:t.key }, [t.label]));
    });
    select.value = types.some(t => t.key === previous) ? previous : (types[0] ? types[0].key : '');

    const totalRemaining = types.reduce((sum,t) => sum + Math.max(0, Number((bal[t.key]||{}).remaining) || 0), 0);
    const totalRemainingEl = $('#leaveTotalRemaining');
    if (totalRemainingEl) totalRemainingEl.textContent = formatLeaveDays(totalRemaining) + ' ' + t('leave.days_unit');

    function renderSelected() {
      const key = select.value;
      const type = types.find(t => t.key === key) || types[0];
      if (!type) { list.innerHTML=''; return; }

      const v = bal[type.key] || {total:0,used:0,remaining:0,carryover:0,carryoverEnabled:false,carryoverUseEnabled:true};
      const total = Number(v.total) || 0;
      const usedDays = Number(v.used) || 0;
      const remaining = Number(v.remaining != null ? v.remaining : total-usedDays);
      const pct = total > 0 ? Math.min(100, Math.max(0, (usedDays/total)*100)) : 0;
      const card = el('div',{class:'card leave-detail-card'},[]);
      card.innerHTML =
        '<div class="row between mb-2">' +
          '<div style="display:flex;align-items:center;gap:9px;">' +
            '<i style="width:11px;height:11px;border-radius:50%;display:inline-block;background:'+type.color+'"></i>' +
            '<strong>'+type.label+'</strong>' +
          '</div>' +
          '<span class="chip">'+formatLeaveDays(remaining)+' '+t('leave.remaining_short')+'</span>' +
        '</div>' +
        '<div class="row between fs-sm"><span class="muted">'+t('leave.used')+'</span><strong>'+formatLeaveDays(usedDays)+' '+t('leave.days_unit')+'</strong></div>' +
        '<div class="leave-progress"><span style="width:'+pct+'%"></span></div>' +
        '<div class="row between mt-2 fs-sm"><span class="muted">'+t('leave.total_balance')+'</span><strong>'+formatLeaveDays(total)+' '+t('leave.days_unit')+'</strong></div>' +
        '<div class="field-row mt-3">' +
          '<div class="field"><label>'+t('leave.total_balance')+'</label><input type="number" min="0" step="0.5" value="'+total+'" data-leave-key="'+type.key+'" data-leave-field="total"></div>' +
          '<div class="field"><label>'+t('leave.carryover')+'</label><input type="number" min="0" step="0.5" value="'+(Number(v.carryover)||0)+'" data-leave-key="'+type.key+'" data-leave-field="carryover"></div>' +
        '</div>' +
        (useLeavesModule ?
          '<label class="setting-row" style="margin-top:6px;"><span class="meta"><span class="t1">'+t('leave.carryover_enable')+'</span></span><span class="switch"><input type="checkbox" '+(v.carryoverEnabled?'checked':'')+' data-leave-key="'+type.key+'" data-leave-field="carryoverEnabled"><span class="slider"></span></span></label>' +
          '<label class="setting-row" style="margin-top:6px;"><span class="meta"><span class="t1">'+t('leave.carryover_sub')+'</span></span><span class="switch"><input type="checkbox" '+(v.carryoverUseEnabled !== false?'checked':'')+' data-leave-key="'+type.key+'" data-leave-field="carryoverUseEnabled"><span class="slider"></span></span></label>' : '') +
        '<p class="hint" style="margin-bottom:0;">'+t('leave.auto_note')+'</p>';
      list.innerHTML='';
      list.appendChild(card);

      const saveBtn = el('button',{class:'btn primary block sm mt-2'},[t('leave.save_balance')]);
      saveBtn.addEventListener('click', saveLeaveBalance);
      list.appendChild(saveBtn);
    }

    if (!select.dataset.bound) {
      select.addEventListener('change', renderSelected);
      select.dataset.bound = '1';
    }
    renderSelected();
  }

  function saveLeaveBalance() {
    const oldBalance = storage.getLeaveBalance() || {};

    // ابدأ من النمط الموسّع (الأنواع الـ 8)
    const useLeavesModule = !!window.SPLeaves;
    const defaultBal = useLeavesModule
      ? SPLeaves.getDefaultBalances()
      : {
        annual: { total: 0, used: 0 }, casual: { total: 0, used: 0 },
        sick: { total: 0, used: 0 }, unpaid: { total: 0, used: 0 },
        periodic: { total: 0, used: 0 }
      };

    // ادمج القيم القديمة
    const bal = {};
    Object.keys(defaultBal).forEach((key) => {
      const old = oldBalance[key] || {};
      bal[key] = Object.assign({}, defaultBal[key], {
        total: Number(old.total) || 0,
        carryover: Number(old.carryover) || 0,
        carryoverEnabled: !!old.carryoverEnabled,
        carryoverUseEnabled: old.carryoverUseEnabled !== false,
        used: 0
      });
    });

    // اقرأ قيم الـ inputs
    document.querySelectorAll('[data-leave-key][data-leave-field="total"]').forEach((inp) => {
      const key = inp.dataset.leaveKey;
      const val = Number(inp.value);
      if (Object.prototype.hasOwnProperty.call(bal, key)) {
        bal[key].total = Number.isFinite(val) && val >= 0 ? val : 0;
      }
    });
    document.querySelectorAll('[data-leave-key][data-leave-field="carryover"]').forEach((inp) => {
      const key = inp.dataset.leaveKey;
      const val = Number(inp.value);
      if (Object.prototype.hasOwnProperty.call(bal, key)) {
        bal[key].carryover = Number.isFinite(val) && val >= 0 ? val : 0;
      }
    });
    document.querySelectorAll('[data-leave-key][data-leave-field="carryoverEnabled"]').forEach((inp) => {
      const key = inp.dataset.leaveKey;
      if (Object.prototype.hasOwnProperty.call(bal, key)) {
        bal[key].carryoverEnabled = !!inp.checked;
      }
    });
    document.querySelectorAll('[data-leave-key][data-leave-field="carryoverUseEnabled"]').forEach((inp) => {
      const key = inp.dataset.leaveKey;
      if (Object.prototype.hasOwnProperty.call(bal, key)) {
        bal[key].carryoverUseEnabled = !!inp.checked;
      }
    });

    // احسب المستهلك
    const used = calculateUsedLeave();
    Object.keys(bal).forEach((key) => {
      bal[key].used = used[key] || 0;
    });

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("save leave balance");


    storage.saveLeaveBalance(bal);

    toast(
      t('msg.saved'),
      'success'
    );

    renderLeaveBalance();
    renderLeaveRecords();

    SPApp.onDataChange();
  }

  // ---------------------------------------------------------
  // Leave records
  // ---------------------------------------------------------

  function renderLeaveRecords() {
    const list =
      $('#leaveRecordsList');

    if (!list) return;

    list.innerHTML = '';

    const attendance =
      storage.getAttendance() || {};

    const records =
      Object.entries(attendance)
        .filter(
          ([_, e]) =>
            e &&
            e.status === 'L'
        )
        .sort(
          (a, b) =>
            b[0].localeCompare(a[0])
        );

    if (records.length === 0) {
      list.appendChild(
        el('div', {
          class:
            'muted fs-sm ta-c',
          style:
            'padding:16px;'
        }, [
          t('leave.no_records')
        ])
      );

      return;
    }

    const typeNames = {
      annual: t('leave.annual'),
      casual: t('leave.casual'),
      sick: t('leave.sick'),
      unpaid: t('leave.unpaid'),
      periodic: t('leave.periodic'),
      other: t('common.none')
    };

    records.forEach(
      ([dstr, entry]) => {
        const type =
          normalizeLeaveType(
            entry.leaveType
          );

        const typeName =
          typeNames[type] ||
          t('leave.title');

        const hours =
          getLeaveHours(entry);

        const days =
          leaveHoursToDays(hours);

        const note =
          entry.note ||
          '';

        const row =
          el('div', {
            class:
              'row between',
            style:
              'padding:10px 0;' +
              'border-bottom:1px solid var(--line-soft);' +
              'gap:10px;'
          });

        const info =
          el('div', {
            style:
              'min-width:0;flex:1;'
          });

        info.appendChild(
          el('div', {
            class: 'fw-600'
          }, [
            `${dstr} — ${typeName}`
          ])
        );

        info.appendChild(
          el('div', {
            class:
              'muted fs-xs mt-1'
          }, [
            `${formatLeaveDays(days)} ${t('leave.days_unit')} • ${fmtNum(hours, 1)} ${t('leave.hours_unit')}`
          ])
        );

        if (note) {
          info.appendChild(
            el('div', {
              class:
                'muted fs-xs mt-1'
            }, [
              note
            ])
          );
        }

        row.appendChild(info);

        row.appendChild(
          el('span', {
            class: 'chip'
          }, [
            `${fmtNum(hours, 1)} س`
          ])
        );

        list.appendChild(row);
      }
    );
  }

  // =========================================================
  // Stats
  // =========================================================

  function openStatsSheet() {
    const today =
      new Date();

    const start =
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      );

    $('#statsFrom').value =
      fmtDate(start);

    $('#statsTo').value =
      fmtDate(today);

    renderStats(
      start,
      today
    );

    $('#statsOverlay').classList.add('show');
    $('#statsSheet').classList.add('show');
  }

  function closeStatsSheet() {
    $('#statsOverlay').classList.remove('show');
    $('#statsSheet').classList.remove('show');
  }

  function renderStats(start, end) {
    const content =
      $('#statsContent');

    const result =
      SPSalary.computeSalary(
        start,
        end
      );

    const totalDays =
      Math.max(
        1,
        Math.round(
          (end - start) /
          86400000
        ) + 1
      );

    const avgHours =
      result.totalHours /
      totalDays;

    const compliancePct =
      (
        result.counts.A +
        result.counts.X
      ) > 0
        ? Math.round(
            (
              (
                result.counts.A +
                result.counts.X
              ) /
              Math.max(
                1,
                result.counts.A +
                result.counts.X +
                result.counts.B
              )
            ) * 100
          )
        : 0;

    content.innerHTML = '';

    const grid =
      el('div', {
        class: 'stat-grid',
        style:
          'grid-template-columns:repeat(2,1fr);'
      });

    grid.appendChild(
      makeStatCard(
        t('stats.total_hours'),
        fmtNum(
          result.totalHours,
          1
        ) + ' س',
        'accent'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.avg_per_day'),
        fmtNum(
          avgHours,
          1
        ) + ' س',
        'accent'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.present_days'),
        String(result.counts.A),
        'success'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.double_days'),
        String(result.counts.X),
        'accent'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.leave_days'),
        String(result.counts.L),
        'warning'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.absent_days'),
        String(result.counts.B),
        'danger'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.overtime_hours'),
        fmtNum(
          result.overtimeHours,
          1
        ) + ' س',
        'success'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.attendance_pct'),
        compliancePct + '%',
        compliancePct >= 80
          ? 'success'
          : 'warning'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.gross'),
        fmtCurrency(
          result.grossSalary
        ),
        'accent'
      )
    );

    grid.appendChild(
      makeStatCard(
        t('stats.net'),
        fmtCurrency(
          result.netSalary
        ),
        'success'
      )
    );

    content.appendChild(grid);
  }

  function makeStatCard(
    label,
    value,
    cls
  ) {
    const card =
      el('div', {
        class:
          'stat-card ' + cls
      });

    card.appendChild(
      el('p', {
        class: 'label'
      }, [
        label
      ])
    );

    card.appendChild(
      el('p', {
        class: 'value'
      }, [
        value
      ])
    );

    card.appendChild(
      el('div', {
        class: 'ico-bg'
      })
    );

    return card;
  }

  // =========================================================
  // Backup & Restore
  // =========================================================

  function openBackupSheet() {
    $('#backupOverlay').classList.add('show');
    $('#backupSheet').classList.add('show');
  }

  function closeBackupSheet() {
    $('#backupOverlay').classList.remove('show');
    $('#backupSheet').classList.remove('show');
  }

  function exportBackup() {
    const data =
      storage.exportAll();

    const blob =
      new Blob(
        [
          JSON.stringify(
            data,
            null,
            2
          )
        ],
        {
          type:
            'application/json'
        }
      );

    SPUtils.downloadBlob(
      `ShiftPro-Backup-${SPUtils.todayStr()}.json`,
      blob
    );

    toast(
      t('backup.exported'),
      'success'
    );
  }

  function importBackup(file) {
    const reader =
      new FileReader();

    reader.onload =
      async () => {
        try {
          const json =
            JSON.parse(
              reader.result
            );

          const ok =
            await confirmDialog(
              t('backup.replaced_confirm'),
              {
                okText:
                  t('backup.replace_btn'),
                danger:
                  true,
                title:
                  t('backup.import_title')
              }
            );

          if (!ok) return;

          storage.importAll(json);

          toast(
            t('backup.imported'),
            'success'
          );

          closeBackupSheet();

          applyTheme();

          SPApp.onDataChange();

        } catch (e) {
          toast(
            t('backup.invalid_file') + ': ' +
            e.message,
            'error'
          );
        }
      };

    reader.readAsText(file);
  }

  async function resetSettings() {
    const ok =
      await confirmDialog(
        t('backup.reset_confirm_msg'),
        {
          okText:
            t('backup.restore_btn'),
          danger:
            true,
          title:
            t('backup.reset_title')
        }
      );

    if (!ok) return;

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("save settings");


    storage.saveSettings(
      Object.assign(
        {},
        storage.DEFAULT_SETTINGS
      )
    );

    applyTheme();

    toast(
      t('backup.restored'),
      'success'
    );

    SPApp.onDataChange();
  }

  async function deleteAll() {
    const ok =
      await confirmDialog(
        t('backup.delete_confirm_msg'),
        {
          okText:
            t('backup.delete_all_btn2'),
          danger:
            true,
          title:
            t('backup.delete_title')
        }
      );

    if (!ok) return;

    const ok2 =
      await confirmDialog(
        t('backup.delete_final'),
        {
          okText:
            t('backup.confirm_delete_btn'),
          danger:
            true
        }
      );

    if (!ok2) return;

    storage.clearAll();

    toast(
      t('backup.deleted_all'),
      'success'
    );

    setTimeout(
      () => location.reload(),
      600
    );
  }

  // =========================================================
  // About
  // =========================================================

  function openAboutSheet() {
    $('#aboutOverlay').classList.add('show');
    $('#aboutSheet').classList.add('show');
  }

  function closeAboutSheet() {
    $('#aboutOverlay').classList.remove('show');
    $('#aboutSheet').classList.remove('show');
  }

  // =========================================================
  // App Control
  // =========================================================

  function openControlSheet() {
    const overlay = $('#controlOverlay');
    const sheet = $('#controlSheet');
    if (!overlay || !sheet) return;
    const label = $('#settingsLangLabel');
    if (label) label.textContent = (window.SPi18n ? SPi18n.getLocale() : 'ar').toUpperCase();
    overlay.classList.add('show');
    sheet.classList.add('show');
  }

  function closeControlSheet() {
    $('#controlOverlay')?.classList.remove('show');
    $('#controlSheet')?.classList.remove('show');
  }

  // =========================================================
  // Notifications & Reminders
  // =========================================================

  function openNotificationsSheet() {
    const n = window.SPNotifications ? SPNotifications.getSettings() : {};
    const enabled = $('#notifEnabled');
    const shift = $('#notifShiftReminder');
    const mins = $('#notifShiftMinutes');
    const shiftEnd = $('#notifShiftEndReminder');
    const leaveReminder = $('#notifUpcomingLeaveReminder');
    const daily = $('#notifDailySummary');
    const dailyTime = $('#notifDailySummaryTime');
    const forget = $('#notifForgetCheckoutHours');

    if (enabled) enabled.checked = !!n.enabled;
    if (shift) shift.checked = n.shiftReminder !== false;
    if (mins) mins.value = String(n.shiftReminderMinutes || 30);
    if (shiftEnd) shiftEnd.checked = n.shiftEndReminder !== false;
    if (leaveReminder) leaveReminder.checked = n.upcomingLeaveReminder !== false;
    if (daily) daily.checked = n.dailySummary !== false;
    if (dailyTime) dailyTime.value = n.dailySummaryTime || '20:00';
    if (forget) forget.value = String(n.forgetCheckoutHours || 12);

    updateNotificationPermissionUI();
    $('#notificationsOverlay')?.classList.add('show');
    $('#notificationsSheet')?.classList.add('show');
  }

  function closeNotificationsSheet() {
    $('#notificationsOverlay')?.classList.remove('show');
    $('#notificationsSheet')?.classList.remove('show');
  }

  function updateNotificationPermissionUI() {
    const state = $('#notificationPermissionState');
    const btn = $('#requestNotificationBtn');
    if (!state) return;
    if (!('Notification' in window)) {
      state.textContent = t('notifsheet.state_unsupported');
      if (btn) btn.hidden = true;
      return;
    }
    const p = Notification.permission;
    state.textContent =
      p === 'granted' ? t('notifsheet.state_on') :
      p === 'denied' ? t('notifsheet.state_denied') :
      t('notifsheet.state_need');
    if (btn) {
      btn.hidden = p === 'granted';
      btn.textContent = p === 'denied' ? t('notifsheet.open_settings') : t('notifsheet.enable_btn');
    }
  }

  async function requestNotificationsPermission() {
    if (!window.SPNotifications) return;
    const granted = await SPNotifications.requestPermission();
    updateNotificationPermissionUI();
    if (granted) {
      toast(t('notifsheet.granted_toast'), 'success');
    } else {
      toast(t('notifsheet.denied_toast'), 'warning');
    }
  }

  function saveNotificationsSettings() {
    if (!window.SPNotifications) {
      toast(t('notifsheet.module_missing'), 'error');
      return;
    }
    const enabled = !!$('#notifEnabled')?.checked;
    const shiftReminder = !!$('#notifShiftReminder')?.checked;
    const shiftReminderMinutes = Number($('#notifShiftMinutes')?.value) || 30;
    const shiftEndReminder = !!$('#notifShiftEndReminder')?.checked;
    const upcomingLeaveReminder = !!$('#notifUpcomingLeaveReminder')?.checked;
    const dailySummary = !!$('#notifDailySummary')?.checked;
    const dailySummaryTime = $('#notifDailySummaryTime')?.value || '20:00';
    const forgetCheckoutHours = Number($('#notifForgetCheckoutHours')?.value) || 12;

    SPNotifications.saveSettings({
      enabled,
      shiftReminder,
      shiftReminderMinutes,
      shiftEndReminder,
      upcomingLeaveReminder,
      dailySummary,
      dailySummaryTime,
      forgetCheckoutHours
    });

    if (enabled) {
      SPNotifications.requestPermission().then((granted) => {
        if (granted) SPNotifications.start();
        else {
          const input = $('#notifEnabled');
          if (input) input.checked = false;
          SPNotifications.saveSettings({ enabled: false });
        }
        updateNotificationPermissionUI();
      });
    } else {
      SPNotifications.stop();
    }

    toast(t('notifsheet.saved_toast'), 'success');
    updateNotificationPermissionUI();
  }

  // =========================================================
  // Date & Time (الساعة / الهجري / الإجازات الرسمية)
  // =========================================================

  function openDatetimeSheet() {
    const s = storage.getSettings();

    const showClock = $('#inpShowClock');
    const showHijri = $('#inpShowHijri');
    const showHolidays = $('#inpShowHolidays');
    const holidaysAsLeave = $('#inpHolidaysAsLeave');
    const holidaysPaid = $('#inpHolidaysPaid');
    const holidayReminder = $('#inpHolidayReminder');
    const holidayRate = $('#inpOfficialHolidayRate');

    if (showClock) showClock.checked = s.showClock !== false;
    if (showHijri) showHijri.checked = s.showHijri !== false;
    if (showHolidays) showHolidays.checked = s.showHolidays !== false;
    if (holidaysAsLeave) holidaysAsLeave.checked = !!s.holidaysAsLeave;
    if (holidaysPaid) holidaysPaid.checked = !!s.holidaysPaid;
    if (holidayReminder) holidayReminder.checked = !!s.holidayReminder;
    if (holidayRate) holidayRate.value = (s.officialHolidayRate != null ? s.officialHolidayRate : 1);

    $('#datetimeOverlay').classList.add('show');
    $('#datetimeSheet').classList.add('show');
  }

  function closeDatetimeSheet() {
    $('#datetimeOverlay')?.classList.remove('show');
    $('#datetimeSheet')?.classList.remove('show');
  }

  function saveDatetimeSettings() {
    const showClock = !!$('#inpShowClock')?.checked;
    const showHijri = !!$('#inpShowHijri')?.checked;
    const showHolidays = !!$('#inpShowHolidays')?.checked;
    let holidaysAsLeave = !!$('#inpHolidaysAsLeave')?.checked;
    let holidaysPaid = !!$('#inpHolidaysPaid')?.checked;
    const holidayReminder = !!$('#inpHolidayReminder')?.checked;

    let officialHolidayRate = Number($('#inpOfficialHolidayRate')?.value);
    if (!Number.isFinite(officialHolidayRate)) officialHolidayRate = 1;
    officialHolidayRate = Math.min(5, Math.max(0, officialHolidayRate));

    // المدفوعة تعمل فقط مع الاعتبار التلقائي
    if (holidaysPaid && !holidaysAsLeave) holidaysAsLeave = true;
    if (!holidaysAsLeave) holidaysPaid = false;

    if (window.SPUndoRedo) SPUndoRedo.pushUndo('save settings');

    storage.saveSettings({
      showClock,
      showHijri,
      showHolidays,
      holidaysAsLeave,
      holidaysPaid,
      holidayReminder,
      officialHolidayRate
    });

    // تطبيق فوري
    if (window.SPClock && SPClock.applyVisibility) SPClock.applyVisibility();
    if (showClock && window.SPClock) SPClock.start();

    toast(t('settings.saved_toast'), 'success');

    closeDatetimeSheet();
    SPApp.onDataChange();
  }

  // =========================================================
  // Generic sheet openers
  // =========================================================

  function openSheetByName(name) {
    // Close any currently-open sheet first so we don't stack overlays.
    // This is critical for the new in-Settings quick-link buttons.
    try {
      document.querySelectorAll('.sheet.show, .sheet-overlay.show').forEach((el) => {
        el.classList.remove('show');
      });
    } catch (e) {
      console.warn('[SPSettings] close-all failed', e);
    }

    switch (name) {
      case 'control':
        openControlSheet();
        break;

      case 'settings':
        openSettingsSheet('settings');
        break;

      case 'salarySettings':
        openSettingsSheet('salarySettings');
        break;

      case 'notifications':
        openNotificationsSheet();
        break;

      case 'datetime':
        openDatetimeSheet();
        break;

      case 'shifts':
        openShiftsSheet();
        break;

      case 'leave':
        openLeaveSheet();
        break;

      case 'stats':
        openStatsSheet();
        break;

      case 'backup':
        openBackupSheet();
        break;

      case 'about':
        openAboutSheet();
        break;
      default:
        console.warn('[SPSettings] unknown sheet', name);
    }
  }

  // =========================================================
  // Init
  // =========================================================

  function init() {
    applyTheme();

    // Theme / app controls are now inside Settings
    const themeBtn = $('#themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', onClickOnce(cycleTheme));

    // App control — gear icon now opens the General Settings sheet directly,
    // because that's what users expect from a gear icon in the topbar.
    // The App Control sheet remains reachable via More → App Control.
    const settingsQuickBtn = $('#settingsQuickBtn');
    if (settingsQuickBtn) settingsQuickBtn.addEventListener('click', onClickOnce(openSettingsSheet));

    // In-Settings shortcut to the Shift Manager
    const settingsOpenShiftsBtn = $('#settingsOpenShiftsBtn');
    if (settingsOpenShiftsBtn) settingsOpenShiftsBtn.addEventListener('click', onClickOnce(() => openSheetByName('shifts')));

    const closeControlBtn = $('#closeControlBtn');
    if (closeControlBtn) closeControlBtn.addEventListener('click', closeControlSheet);
    const controlOverlay = $('#controlOverlay');
    if (controlOverlay) controlOverlay.addEventListener('click', closeControlSheet);

    const settingsThemeBtn = $('#settingsThemeBtn');
    if (settingsThemeBtn) settingsThemeBtn.addEventListener('click', onClickOnce(cycleTheme));
    const settingsLangBtn = $('#settingsLangBtn');
    if (settingsLangBtn) settingsLangBtn.addEventListener('click', onClickOnce(() => {
      if (window.SPi18n) SPi18n.toggleLocale();
      const label = $('#settingsLangLabel');
      if (label) label.textContent = (window.SPi18n ? SPi18n.getLocale() : 'ar').toUpperCase();
      toast(t('settings.language_changed'), 'info');
    }));
    const settingsUndoBtn = $('#settingsUndoBtn');
    if (settingsUndoBtn) settingsUndoBtn.addEventListener('click', onClickOnce(() => window.SPUndoRedo && SPUndoRedo.undo()));
    const settingsRedoBtn = $('#settingsRedoBtn');
    if (settingsRedoBtn) settingsRedoBtn.addEventListener('click', onClickOnce(() => window.SPUndoRedo && SPUndoRedo.redo()));

    // Notifications
    const closeNotificationsBtn = $('#closeNotificationsBtn');
    if (closeNotificationsBtn) closeNotificationsBtn.addEventListener('click', closeNotificationsSheet);
    const notificationsOverlay = $('#notificationsOverlay');
    if (notificationsOverlay) notificationsOverlay.addEventListener('click', closeNotificationsSheet);
    const requestNotificationBtn = $('#requestNotificationBtn');
    if (requestNotificationBtn) requestNotificationBtn.addEventListener('click', onClickOnce(requestNotificationsPermission));
    const saveNotificationsBtn = $('#saveNotificationsBtn');
    if (saveNotificationsBtn) saveNotificationsBtn.addEventListener('click', onClickOnce(saveNotificationsSettings));

    // Date & Time
    const closeDatetimeBtn = $('#closeDatetimeBtn');
    if (closeDatetimeBtn) closeDatetimeBtn.addEventListener('click', closeDatetimeSheet);
    const datetimeOverlay = $('#datetimeOverlay');
    if (datetimeOverlay) datetimeOverlay.addEventListener('click', closeDatetimeSheet);
    const saveDatetimeBtn = $('#saveDatetimeBtn');
    if (saveDatetimeBtn) saveDatetimeBtn.addEventListener('click', onClickOnce(saveDatetimeSettings));

    // Settings — every binding null-safe to prevent one missing
    // element from halting the entire init() chain.
    const bind = (sel, ev, fn) => {
      const node = $(sel);
      if (node) node.addEventListener(ev, fn);
      else console.warn('[SPSettings] missing element', sel);
    };
    bind('#saveSettingsBtn', 'click', onClickOnce(saveSettings));
    bind('#closeSettingsBtn', 'click', closeSettingsSheet);
    bind('#settingsOverlay', 'click', closeSettingsSheet);
    bind('#saveSalarySettingsBtn', 'click', onClickOnce(saveSettings));
    bind('#closeSalarySettingsBtn', 'click', closeSalarySettingsSheet);
    bind('#salarySettingsOverlay', 'click', closeSalarySettingsSheet);

    // Shifts
    bind('#addShiftBtn', 'click', onClickOnce(() => openShiftEditor(null)));
    bind('#saveShiftBtn', 'click', onClickOnce(saveShift));
    bind('#cancelShiftBtn', 'click', closeShiftEditor);
    bind('#shiftEditOverlay', 'click', closeShiftEditor);
    bind('#closeShiftsBtn', 'click', closeShiftsSheet);
    bind('#shiftsOverlay', 'click', closeShiftsSheet);
    bind('#applyPatternBtn', 'click', onClickOnce(applyPattern));
    bind('#clearPatternBtn', 'click', clearPattern);

    // ====== قوالب وتكرار ذكي ======
    const applyRepeatBtn = $('#applyRepeatBtn');
    if (applyRepeatBtn) {
      applyRepeatBtn.addEventListener('click', onClickOnce(applyRepeatRule));
    }
    const repeatTypeSel = $('#repeatType');
    if (repeatTypeSel) {
      repeatTypeSel.addEventListener('change', (e) => {
        const cdf = $('#customDaysField');
        if (cdf) cdf.hidden = (e.target.value !== 'custom');
      });
    }
    // weekday chips
    document.querySelectorAll('#weekdayChips .chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        chip.classList.toggle('active');
      });
    });

    // Leave
    bind('#closeLeaveBtn', 'click', closeLeaveSheet);
    bind('#leaveOverlay', 'click', closeLeaveSheet);

    // ====== New Leave Request (i18n-aware) ======
    const newLeaveBtn = $('#newLeaveBtn');
    if (newLeaveBtn) {
      newLeaveBtn.addEventListener('click', openNewLeaveSheet);
    }
    const cancelLeaveBtn = $('#cancelLeaveBtn');
    if (cancelLeaveBtn) {
      cancelLeaveBtn.addEventListener('click', closeNewLeaveSheet);
    }
    const newLeaveOverlay = $('#newLeaveOverlay');
    if (newLeaveOverlay) {
      newLeaveOverlay.addEventListener('click', closeNewLeaveSheet);
    }
    const saveLeaveBtn = $('#saveLeaveBtn');
    if (saveLeaveBtn) {
      saveLeaveBtn.addEventListener('click', onClickOnce(saveNewLeaveRequest));
    }
    const halfDayCheck = $('#leaveHalfDayCheck');
    if (halfDayCheck) {
      halfDayCheck.addEventListener('change', (e) => {
        const halfPeriod = $('#leaveHalfPeriod');
        const hoursCheckEl = $('#leaveHoursCheck');
        const hoursInputEl = $('#leaveHoursInput');
        if (halfPeriod) halfPeriod.disabled = !e.target.checked;
        if (e.target.checked) {
          if (hoursCheckEl) hoursCheckEl.checked = false;
          if (hoursInputEl) hoursInputEl.disabled = true;
        }
      });
    }
    const hoursCheck = $('#leaveHoursCheck');
    if (hoursCheck) {
      hoursCheck.addEventListener('change', (e) => {
        const hoursInputEl = $('#leaveHoursInput');
        const halfDayEl = $('#leaveHalfDayCheck');
        const halfPeriodEl = $('#leaveHalfPeriod');
        if (hoursInputEl) hoursInputEl.disabled = !e.target.checked;
        if (e.target.checked) {
          if (halfDayEl) halfDayEl.checked = false;
          if (halfPeriodEl) halfPeriodEl.disabled = true;
        }
      });
    }
    // تاريخ "إلى" افتراضي يساوي "من"
    const leaveFromInput = $('#leaveFromInput');
    if (leaveFromInput) {
      leaveFromInput.addEventListener('change', (e) => {
        const toInput = $('#leaveToInput');
        if (!toInput.value || toInput.value < e.target.value) {
          toInput.value = e.target.value;
        }
      });
    }

    // Stats
    bind('#closeStatsBtn', 'click', closeStatsSheet);
    bind('#statsOverlay', 'click', closeStatsSheet);
    bind('#applyStatsRange', 'click', onClickOnce(() => {
      const from = $('#statsFrom') ? $('#statsFrom').value : '';
      const to = $('#statsTo') ? $('#statsTo').value : '';
      if (!from || !to) {
        toast(t('stats.need_dates'), 'warning');
        return;
      }
      renderStats(parseDate(from), parseDate(to));
      toast(t('stats.updated'), 'success');
    }));

    // Backup
    bind('#exportBackupBtn', 'click', onClickOnce(exportBackup));
    bind('#importBackupBtn', 'click', () => {
      const input = $('#importBackupInput');
      if (input) input.click();
    });
    bind('#importBackupInput', 'change', (e) => {
      const file = e.target.files[0];
      if (file) importBackup(file);
      e.target.value = '';
    });
    bind('#resetSettingsBtn', 'click', onClickOnce(resetSettings));
    bind('#deleteAllBtn', 'click', onClickOnce(deleteAll));
    bind('#closeBackupBtn', 'click', closeBackupSheet);
    bind('#backupOverlay', 'click', closeBackupSheet);

    // About
    bind('#closeAboutBtn', 'click', closeAboutSheet);
    bind('#aboutOverlay', 'click', closeAboutSheet);

    // More page
    document
      .querySelectorAll('[data-sheet]')
      .forEach((btn) => {
        btn.addEventListener(
          'click',
          () =>
            openSheetByName(
              btn.dataset.sheet
            )
        );
      });

    // System theme
    if (
      window.matchMedia
    ) {
      const media =
        window.matchMedia(
          '(prefers-color-scheme: dark)'
        );

      if (media.addEventListener) {
        media.addEventListener(
          'change',
          applyTheme
        );
      } else if (media.addListener) {
        media.addListener(
          applyTheme
        );
      }
    }
  }

  // =========================================================
  // Public API
  // =========================================================

  global.SPSettings = {
    init,
    applyTheme,
    openSettingsSheet,
    closeSettingsSheet,
    openControlSheet,
    closeControlSheet,
    openNotificationsSheet,
    closeNotificationsSheet,
    openDatetimeSheet,
    closeDatetimeSheet,
    saveDatetimeSettings,
    openSheetByName,

    // Expose these for other modules if needed
    calculateUsedLeave,
    getLeaveHours,
    leaveHoursToDays,
    renderLeaveBalance,
    renderLeaveRecords
  };

})(window);