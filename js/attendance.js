/* ShiftPro - Attendance Module
   Handles the day sheet (add/edit/delete attendance entries),
   check-in / check-out from dashboard, copy-to-other-days.
   Exposes: window.SPAttendance
*/
(function (global) {
  'use strict';

  const {
    $,
    el,
    fmtDate,
    parseDate,
    formatHijri,
    fmtTime12,
    computeRangeHours,
    timeToMin,
    timeDiffMin,
    nowHHMM,
    monthNamesAr,
    weekdayNamesAr,
    toast,
    confirmDialog,
    haptic,
    onClickOnce
  } = SPUtils;

  const storage = SPStorage;

  let activeDate = null;
  let originalEntry = null;

  // ملاحظة: statusLabels الأصلي بقي للتوافق مع الكود القديم،
  // لكن العرض يجب أن يستخدم statusLabel() المترجمة حسب اللغة الحالية.
  const statusLabels = {
    A: 'حضرت',
    X: 'مطبق (24 ساعة)',
    L: 'إجازة',
    B: 'غياب'
  };

  function t(key, vars) {
    return global.SPi18n ? global.SPi18n.t(key, vars) : key;
  }

  // اسم الحالة حسب اللغة الحالية
  function statusLabel(code) {
    switch (code) {
      case 'A': return t('dashboard.status_present');
      case 'X': return t('attendance.double_24');
      case 'L': return t('dashboard.status_leave');
      case 'B': return t('dashboard.status_absent');
      default: return '';
    }
  }

  // اسم الإجازة الرسمية المحلي لليوم (إن وُجدت)
  function getHolidayFor(date) {
    if (!global.SPOfficialHolidays || typeof global.SPOfficialHolidays.getOfficialHoliday !== 'function') return null;
    try {
      const s = storage.getSettings();
      if (s.showHolidays === false) return null;
      return global.SPOfficialHolidays.getOfficialHoliday(date);
    } catch (e) {
      return null;
    }
  }

  function holidayTypeLabel(holiday) {
    if (!holiday) return '';
    const cat = holiday.category || holiday.type || 'public';
    if (cat === 'national') return t('holiday.national');
    if (cat === 'religious' || cat === 'islamic') return t('holiday.religious');
    return t('holiday.public');
  }

  // ---------- Hours & overtime computation ----------

  function getShiftForDate(date) {
    const dstr = fmtDate(date);
    const code = storage.getScheduledCode(dstr);

    return code
      ? storage.getShiftByCode(code)
      : null;
  }

  function computeLateMinutes(date, fromTime) {
    if (!fromTime) return 0;

    const shift = getShiftForDate(date);

    if (!shift || !shift.startTime) {
      return 0;
    }

    const grace =
      Number(
        storage.getSettings().lateGraceMinutes
      ) || 0;

    const diff =
      timeDiffMin(
        shift.startTime,
        fromTime
      );

    if (diff > 12 * 60) {
      return 0;
    }

    return Math.max(
      0,
      diff - grace
    );
  }

  function computeEarlyLeaveMinutes(date, toTime) {
    if (!toTime) return 0;

    const shift = getShiftForDate(date);

    if (!shift || !shift.endTime) {
      return 0;
    }

    const diff =
      timeDiffMin(
        toTime,
        shift.endTime
      );

    if (diff > 12 * 60) {
      return 0;
    }

    return Math.max(
      0,
      diff
    );
  }

  function computeOvertimeHours(date, entry) {
    const settings =
      storage.getSettings();

    if (!settings.overtimeEnabled) {
      return 0;
    }

    const actualHours =
      computeActualHours(entry);

    let threshold =
      Number(
        settings.overtimeAfterHours
      ) || 0;

    if (threshold === 0) {
      const shift =
        getShiftForDate(date);

      threshold = shift
        ? Number(shift.hours) || 0
        : (
            Number(
              settings.shiftHours
            ) || 12
          );
    }

    return Math.max(
      0,
      Math.round(
        (
          actualHours -
          threshold
        ) * 100
      ) / 100
    );
  }

  // ---------- Duration ----------

  function getEntryDurationHours(entry) {
    if (
      !entry ||
      !entry.from ||
      !entry.to
    ) {
      return 0;
    }

    /*
      لو فيه تاريخ بداية ونهاية
      نحسب المدة الحقيقية بالتاريخ والوقت.
    */
    if (
      entry.fromDate &&
      entry.toDate
    ) {
      const start =
        new Date(
          entry.fromDate +
          'T' +
          entry.from +
          ':00'
        );

      const end =
        new Date(
          entry.toDate +
          'T' +
          entry.to +
          ':00'
        );

      if (
        Number.isNaN(
          start.getTime()
        ) ||
        Number.isNaN(
          end.getTime()
        )
      ) {
        return 0;
      }

      const diff =
        (
          end - start
        ) / 3600000;

      if (diff <= 0) {
        return 0;
      }

      return Math.round(
        diff * 100
      ) / 100;
    }

    return computeRangeHours(
      entry.from,
      entry.to
    );
  }

  /*
    =========================================================
    حساب ساعات اليوم
    =========================================================

    القواعد:

    1) الغياب = 0 ساعة.

    2) الإجازة الشخصية L:
       - الموظف يحدد عدد الساعات.
       - إذا لم يحدد، الافتراضي 8 ساعات.

    3) الحضور A:
       - لو فيه دخول وخروج يتم حساب المدة الفعلية.
       - لو لا يوجد وقت، تستخدم ساعات الوردية.

    4) مطبق X:
       - لو فيه دخول وخروج يتم حساب المدة الفعلية.
       - بدون وقت يتم حساب الوردية × 2.

    5) الإجازة الرسمية:
       لا يوجد لها أي شرط خاص هنا.

       بمعنى:
       إذا كان اليوم إجازة رسمية
       وسجل الموظف حضورًا،
       يتم حساب ساعات حضوره طبيعيًا.

       الإجازة الرسمية نفسها لا تنشئ ساعات
       تلقائيًا ولا تمنع تسجيل الحضور.
  =========================================================
  */

  function computeActualHours(entry) {
    if (!entry) return 0;

    // ---------- غياب ----------

    if (entry.status === 'B') {
      return 0;
    }

    // ---------- إجازة ----------

    if (entry.status === 'L') {
      const leaveHours =
        Number(
          entry.leaveHours
        );

      if (
        Number.isFinite(
          leaveHours
        ) &&
        leaveHours >= 0
      ) {
        return Math.min(
          24,
          leaveHours
        );
      }

      /*
        لو سجل قديم بدون leaveHours
        نستخدم 8 ساعات.
      */
      return 8;
    }

    // ---------- حضور / مطبق ----------

    // While checked in, calculate elapsed time up to this moment instead of
    // prematurely counting the whole planned shift as completed.
    if (
      entry.from &&
      !entry.to &&
      (entry.status === 'A' || entry.status === 'X')
    ) {
      // Legacy records that have `from` but no `fromDate` cannot be safely
      // interpreted as "today's open check-in" — they were created by an
      // older app version on whatever day they belong to. Treat them as
      // completed shifts using the configured shift hours so their working
      // hours and salary are counted correctly.
      if (!entry.fromDate) {
        const configuredHours =
          Number(storage.getSettings().shiftHours) || 12;
        return entry.status === 'X'
          ? configuredHours * 2
          : configuredHours;
      }

      const startDate = entry.fromDate;
      const todayDate = SPUtils.fmtDate(new Date());

      // السجل القديم الذي لا يحتوي على انصراف لا يُحسب من تاريخ قديم حتى الآن.
      // نعتبر اليوم السابق وردية مكتملة بحسب جدول ذلك اليوم أو ساعات الوردية بالإعدادات.
      if (startDate < todayDate) {
        const scheduledCode = storage.getScheduledCode(startDate);
        const scheduledShift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;
        const scheduledHours = scheduledShift ? Number(scheduledShift.hours) : 0;
        const configuredHours = Number(storage.getSettings().shiftHours) || 12;
        const completedHours = scheduledHours > 0 ? scheduledHours : configuredHours;
        return entry.status === 'X' ? completedHours * 2 : completedHours;
      }

      const startedAt = new Date(startDate + 'T' + entry.from + ':00');
      if (!Number.isNaN(startedAt.getTime())) {
        return Math.max(0, (Date.now() - startedAt.getTime()) / 3600000);
      }
    }

    if (
      entry.from &&
      entry.to &&
      (
        entry.status === 'A' ||
        entry.status === 'X'
      )
    ) {
      const duration =
        getEntryDurationHours(
          entry
        );

      if (duration > 0) {
        return duration;
      }
    }

    const sh =
      Number(
        storage.getSettings().shiftHours
      ) || 12;

    // ---------- مطبق 24 ساعة ----------

    if (entry.status === 'X') {
      return sh * 2;
    }

    // ---------- حضور ----------

    if (entry.status === 'A') {
      return sh;
    }

    return 0;
  }

  function dayValue(date, entry) {
    if (!entry) return 0;

    const s =
      storage.getSettings();

    const hourlyRate =
      s.hourlyRate > 0
        ? Number(
            s.hourlyRate
          )
        : (
            Number(
              s.salary
            ) || 0
          ) /
          (
            Number(
              s.monthlyHours
            ) || 1
          );

    const actual =
      computeActualHours(
        entry
      );

    const overtime =
      computeOvertimeHours(
        date,
        entry
      );

    const base =
      actual -
      overtime;

    const overtimeValue =
      overtime *
      hourlyRate *
      (
        Number(
          s.overtimeRate
        ) || 1.5
      );

    return (
      base *
      hourlyRate
    ) +
    overtimeValue;
  }

  // ---------- Leave Hours UI ----------

  function updateLeaveHoursVisibility(status) {
    const group =
      $('#leaveHoursGroup');

    const input =
      $('#inpLeaveHours');

    if (!group) return;

    const isLeave =
      status === 'L';

    group.style.display =
      isLeave
        ? ''
        : 'none';

    if (input) {
      input.disabled =
        !isLeave;

      if (
        isLeave &&
        (
          input.value === '' ||
          input.value == null
        )
      ) {
        input.value = '8';
      }
    }
  }

  // ---------- Day Sheet ----------

  function openDaySheet(date) {
    activeDate = date;

    const dstr =
      fmtDate(date);

    const code =
      storage.getScheduledCode(
        dstr
      );

    const entry =
      storage.getEntry(
        dstr
      );

    originalEntry =
      entry
        ? JSON.parse(
            JSON.stringify(
              entry
            )
          )
        : null;

    $('#daySheetTitle').textContent =
      SPi18n
        ? SPi18n.formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })
        : `${date.getDate()} ${
            monthNamesAr[
              date.getMonth()
            ]
          } ${date.getFullYear()}`;

    // الهجري — قابل للإخفاء من الإعدادات
    const s = storage.getSettings();
    const hijriEl = $('#daySheetHijri');
    if (hijriEl) {
      const showHijri = s.showHijri !== false;
      hijriEl.hidden = !showHijri;
      hijriEl.textContent = showHijri ? formatHijri(date) : '';
    }

    const shift =
      code
        ? storage.getShiftByCode(
            code
          )
        : null;

    $('#daySheetSub').textContent =
      t('attendance.shift_line', {
        shift: shift ? SPUtils.shiftDisplayName(shift) : t('status.unset')
      }) +
      (
        shift &&
        shift.startTime
          ? ` — ${fmtTime12(
              shift.startTime
            )} ${t('common.to')} ${fmtTime12(
              shift.endTime
            )}`
          : ''
      ) +
      (
        entry
          ? ` — ${t('attendance.attendance_line', {
              status: statusLabel(
                entry.status
              ) || '—'
            })}`
          : ''
      );

    // لافتة الإجازة الرسمية داخل تفاصيل اليوم
    renderDayHolidayCard(date);

    renderShiftPicker(
      code
    );

    $('#inpFrom').value =
      entry && entry.from
        ? entry.from
        : '';

    $('#inpTo').value =
      entry && entry.to
        ? entry.to
        : '';

    const defaultDate =
      fmtDate(date);

    if ($('#inpFromDate')) {
      $('#inpFromDate').value =
        entry &&
        entry.fromDate
          ? entry.fromDate
          : defaultDate;
    }

    if ($('#inpToDate')) {
      $('#inpToDate').value =
        entry &&
        entry.toDate
          ? entry.toDate
          : defaultDate;
    }

    $('#inpNote').value =
      entry && entry.note
        ? entry.note
        : '';

    $('#inpLocation').value =
      entry && entry.location
        ? entry.location
        : '';

    $('#inpAbsenceReason').value =
      entry &&
      entry.absenceReason
        ? entry.absenceReason
        : '';

    $('#inpLeaveType').value =
      entry &&
      entry.leaveType
        ? entry.leaveType
        : '';

    $('#inpLeaveType').disabled =
      !(
        entry &&
        entry.status === 'L'
      );

    $('#inpAbsenceReason').disabled =
      !(
        entry &&
        entry.status === 'B'
      );

    if ($('#inpLeaveHours')) {
      $('#inpLeaveHours').value =
        entry &&
        entry.leaveHours != null
          ? entry.leaveHours
          : '8';
    }

    updateLeaveHoursVisibility(
      entry
        ? entry.status
        : null
    );

    updateDurationPreview();
    updateComputedStats();

    $('#dayOverlay')
      .classList.add(
        'show'
      );

    $('#daySheet')
      .classList.add(
        'show'
      );
  }

  // لافتة الإجازة الرسمية (اسم + تصنيف + حالة الاتساق مع الإعدادات)
  function renderDayHolidayCard(date) {
    const card = document.getElementById('dayHolidayCard');
    if (!card) return;

    const holiday = getHolidayFor(date);
    const nameEl = document.getElementById('dayHolidayName');
    const metaEl = document.getElementById('dayHolidayMeta');

    if (!holiday) {
      card.hidden = true;
      return;
    }

    let name = holiday.name || '';
    if (
      global.SPOfficialHolidays &&
      typeof global.SPOfficialHolidays.getHolidayLocalizedName === 'function'
    ) {
      name = global.SPOfficialHolidays.getHolidayLocalizedName(holiday);
    }

    if (nameEl) nameEl.textContent = name;

    let meta = holidayTypeLabel(holiday);
    const s = storage.getSettings();
    if (s.holidaysAsLeave) {
      meta += ' — ' + (s.holidaysPaid ? t('holiday.auto_leave_paid_note') : t('holiday.auto_leave_note'));
    }
    if (metaEl) metaEl.textContent = meta;

    card.hidden = false;
  }

  function closeDaySheet() {
    $('#dayOverlay')
      .classList.remove(
        'show'
      );

    $('#daySheet')
      .classList.remove(
        'show'
      );

    activeDate = null;
    originalEntry = null;
  }

  function renderShiftPicker(
    activeCode
  ) {
    const picker =
      $('#shiftPicker');

    picker.innerHTML = '';

    const shifts =
      storage.getShifts();

    shifts.forEach(
      (s) => {
        const btn = el(
          'button',
          {
            class:
              'chip' +
              (
                s.code ===
                activeCode
                  ? ' active'
                  : ''
              ),

            style:
              s.code ===
              activeCode
                ? `background:${s.color};color:#fff;border-color:${s.color};`
                : `border-color:${s.color};color:${s.color};`,

            'data-shift-code':
              s.code
          },
          [SPUtils.shiftDisplayName(s)]
        );

        btn.addEventListener(
          'click',
          () =>
            setSchedule(
              s.code
            )
        );

        picker.appendChild(
          btn
        );
      }
    );
  }

  function setSchedule(code) {
    if (!activeDate) {
      return;
    }

    const dstr =
      fmtDate(
        activeDate
      );

    // سجّل لـ undo قبل التعديل
    if (window.SPUndoRedo) SPUndoRedo.pushUndo('set schedule ' + dstr);

    storage.setSchedule(
      dstr,
      code
    );

    openDaySheet(
      activeDate
    );

    SPUtils.haptic(10);

    SPApp.onDataChange();
  }

  function updateDurationPreview() {
    const from =
      $('#inpFrom').value;

    const to =
      $('#inpTo').value;

    const preview =
      $('#durationPreview');

    if (from && to) {
      let h =
        computeRangeHours(
          from,
          to
        );

      if (
        $('#inpFromDate') &&
        $('#inpToDate') &&
        $('#inpFromDate').value &&
        $('#inpToDate').value
      ) {
        const start =
          new Date(
            $('#inpFromDate').value +
            'T' +
            from +
            ':00'
          );

        const end =
          new Date(
            $('#inpToDate').value +
            'T' +
            to +
            ':00'
          );

        if (
          !Number.isNaN(
            start.getTime()
          ) &&
          !Number.isNaN(
            end.getTime()
          ) &&
          end > start
        ) {
          h =
            Math.round(
              (
                (
                  end - start
                ) /
                3600000
              ) * 100
            ) / 100;
        }
      }

      preview.textContent =
        t('attendance.duration_preview', {
          h: h,
          from: fmtTime12(from),
          to: fmtTime12(to)
        });
    } else {
      preview.textContent =
        '';
    }
  }

  function updateComputedStats() {
    if (!activeDate) {
      return;
    }

    const entry =
      collectEntryFromForm({
        silent: true
      });

    const hours =
      computeActualHours(
        entry
      );

    const overtime =
      computeOvertimeHours(
        activeDate,
        entry
      );

    const from =
      entry
        ? entry.from
        : '';

    const to =
      entry
        ? entry.to
        : '';

    const late =
      entry &&
      entry.status === 'L'
        ? 0
        : computeLateMinutes(
            activeDate,
            from
          );

    const early =
      entry &&
      entry.status === 'L'
        ? 0
        : computeEarlyLeaveMinutes(
            activeDate,
            to
          );

    $('#daySheetHours')
      .textContent =
      SPUtils.fmtHours(hours);

    $('#daySheetOvertime')
      .textContent =
      SPUtils.fmtHours(overtime);

    $('#daySheetLate')
      .textContent =
      late;

    $('#daySheetEarly')
      .textContent =
      early;
  }

  // ---------- Collect form ----------

  function collectEntryFromForm(
    options = {}
  ) {
    const silent =
      options.silent === true;

    const from =
      $('#inpFrom').value;

    const to =
      $('#inpTo').value;

    const note =
      $('#inpNote')
        .value
        .trim();

    const location =
      $('#inpLocation')
        .value
        .trim();

    const leaveType =
      $('#inpLeaveType')
        .value;

    const absenceReason =
      $('#inpAbsenceReason')
        .value
        .trim();

    const leaveHoursInput =
      $('#inpLeaveHours');

    let leaveHours =
      leaveHoursInput
        ? Number(
            leaveHoursInput.value
          )
        : 8;

    let status =
      originalEntry
        ? originalEntry.status
        : null;

    if (
      !status &&
      from &&
      to
    ) {
      status = 'A';
    }

    if (!status) {
      return null;
    }

    const entry = {
      status
    };

    // ---------- Attendance ----------

    if (
      from &&
      to &&
      (
        status === 'A' ||
        status === 'X'
      )
    ) {
      entry.from =
        from;

      entry.to =
        to;

      entry.fromDate =
        $('#inpFromDate') &&
        $('#inpFromDate').value
          ? $('#inpFromDate').value
          : (
              activeDate
                ? fmtDate(
                    activeDate
                  )
                : ''
            );

      entry.toDate =
        $('#inpToDate') &&
        $('#inpToDate').value
          ? $('#inpToDate').value
          : (
              activeDate
                ? fmtDate(
                    activeDate
                  )
                : ''
            );

      if (
        entry.fromDate &&
        entry.toDate
      ) {
        const start =
          new Date(
            entry.fromDate +
            'T' +
            entry.from +
            ':00'
          );

        const end =
          new Date(
            entry.toDate +
            'T' +
            entry.to +
            ':00'
          );

        if (
          Number.isNaN(
            start.getTime()
          ) ||
          Number.isNaN(
            end.getTime()
          )
        ) {
          if (!silent) {
            toast(
              t('attendance.invalid_date'),
              'error'
            );
          }

          return null;
        }

        const hours =
          (
            end - start
          ) / 3600000;

        if (hours <= 0) {
          if (!silent) {
            toast(
              t('attendance.end_after_start'),
              'error'
            );
          }

          return null;
        }

        if (hours > 36) {
          if (!silent) {
            toast(
              t('attendance.max_36'),
              'error'
            );
          }

          return null;
        }
      }
    }

    // ---------- Note ----------

    if (note) {
      entry.note =
        note;
    }

    // ---------- Location ----------

    if (location) {
      entry.location =
        location;
    }

    // ---------- Leave ----------

    if (status === 'L') {
      let hours =
        Number(
          leaveHours
        );

      if (
        !Number.isFinite(
          hours
        )
      ) {
        hours = 8;
      }

      hours =
        Math.min(
          24,
          Math.max(
            0,
            hours
          )
        );

      entry.leaveHours =
        hours;

      if (leaveType) {
        entry.leaveType =
          leaveType;
      }
    }

    // ---------- Absence ----------

    if (
      status === 'B' &&
      absenceReason
    ) {
      entry.absenceReason =
        absenceReason;
    }

    return entry;
  }

  // ---------- Status ----------

  function setStatus(code) {
    if (!activeDate) {
      return;
    }

    if (code === 'L') {
      if (!originalEntry) {
        originalEntry = {
          status: 'L',
          leaveHours: 8
        };
      } else {
        originalEntry =
          JSON.parse(
            JSON.stringify(
              originalEntry
            )
          );

        originalEntry.status =
          'L';

        if (
          originalEntry.leaveHours ==
            null ||
          !Number.isFinite(
            Number(
              originalEntry.leaveHours
            )
          )
        ) {
          originalEntry.leaveHours =
            8;
        }
      }

      if ($('#inpLeaveHours')) {
        const current =
          Number(
            $('#inpLeaveHours')
              .value
          );

        if (
          !Number.isFinite(
            current
          )
        ) {
          $('#inpLeaveHours')
            .value = '8';
        }
      }

      updateLeaveHoursVisibility(
        'L'
      );

      if ($('#inpLeaveType')) {
        $('#inpLeaveType')
          .disabled = false;
      }

      if ($('#inpAbsenceReason')) {
        $('#inpAbsenceReason')
          .disabled = true;
      }

      updateComputedStats();

      haptic(10);

      return;
    }

    updateLeaveHoursVisibility(
      code
    );

    if ($('#inpLeaveType')) {
      $('#inpLeaveType').disabled =
        code !== 'L';
    }

    if ($('#inpAbsenceReason')) {
      $('#inpAbsenceReason').disabled =
        code !== 'B';
    }

    const from =
      $('#inpFrom').value;

    const to =
      $('#inpTo').value;

    const note =
      $('#inpNote')
        .value
        .trim();

    const location =
      $('#inpLocation')
        .value
        .trim();

    const absenceReason =
      $('#inpAbsenceReason')
        .value
        .trim();

    const entry = {
      status: code
    };

    // ---------- Attendance ----------

    if (
      (
        code === 'A' ||
        code === 'X'
      ) &&
      from &&
      to
    ) {
      entry.from =
        from;

      entry.to =
        to;

      if (
        $('#inpFromDate') &&
        $('#inpFromDate').value
      ) {
        entry.fromDate =
          $('#inpFromDate')
            .value;
      }

      if (
        $('#inpToDate') &&
        $('#inpToDate').value
      ) {
        entry.toDate =
          $('#inpToDate')
            .value;
      }
    }

    // ---------- تسجيل حضور سريع من التقويم ----------

    if (
      code === 'A' &&
      !from &&
      !to
    ) {
      const selectedDate = fmtDate(activeDate);
      const todayDate = fmtDate(new Date());

      if (selectedDate === todayDate) {
        // اليوم الحالي: ابدأ حساب الوقت الفعلي من لحظة الضغط.
        entry.from = nowHHMM();
        entry.fromDate = selectedDate;
        $('#inpFrom').value = entry.from;
        if ($('#inpFromDate')) $('#inpFromDate').value = selectedDate;
      } else {
        // اليوم السابق: استخدم وقت الوردية المجدولة بدل وقت الساعة الحالي.
        // إذا لم توجد وردية، يحتسب التطبيق ساعات الوردية من الإعدادات.
        const scheduledCode = storage.getScheduledCode(selectedDate);
        const scheduledShift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;

        // سجّل الوردية كاملة لليوم السابق حتى تظهر الساعات وتدخل في الراتب.
        const startTime = scheduledShift && scheduledShift.startTime
          ? scheduledShift.startTime
          : '07:00';
        const configuredHours = Number(storage.getSettings().shiftHours) || 12;
        const shiftHours = scheduledShift && Number(scheduledShift.hours) > 0
          ? Number(scheduledShift.hours)
          : configuredHours;
        const endTime = scheduledShift && scheduledShift.endTime
          ? scheduledShift.endTime
          : (() => {
              const parts = startTime.split(':').map(Number);
              const total = parts[0] * 60 + parts[1] + Math.round(shiftHours * 60);
              const mins = ((total % 1440) + 1440) % 1440;
              return String(Math.floor(mins / 60)).padStart(2, '0') + ':' +
                String(mins % 60).padStart(2, '0');
            })();

        entry.from = startTime;
        entry.to = endTime;
        entry.fromDate = selectedDate;
        const overnight = endTime <= startTime;
        const nextDate = new Date(activeDate);
        nextDate.setDate(nextDate.getDate() + 1);
        entry.toDate = overnight ? fmtDate(nextDate) : selectedDate;
        $('#inpFrom').value = entry.from;
        $('#inpTo').value = entry.to;
        if ($('#inpFromDate')) $('#inpFromDate').value = entry.fromDate;
        if ($('#inpToDate')) $('#inpToDate').value = entry.toDate;
      }
    }

    // ---------- Note ----------

    if (note) {
      entry.note =
        note;
    }

    // ---------- Location ----------

    if (location) {
      entry.location =
        location;
    }

    // ---------- Absence ----------

    if (
      code === 'B' &&
      absenceReason
    ) {
      entry.absenceReason =
        absenceReason;
    }

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("set entry");
    storage.setEntry(
      fmtDate(activeDate),
      entry
    );

    originalEntry =
      JSON.parse(
        JSON.stringify(
          entry
        )
      );

    haptic(12);

    toast(
      t('attendance.saved_status', {
        status: statusLabel(code)
      }),
      'success'
    );

    closeDaySheet();

    SPApp.onDataChange();
  }

  // ---------- Delete ----------

  async function deleteEntry() {
    if (!activeDate) {
      return;
    }

    const ok =
      await confirmDialog(
        t('attendance.delete_confirm_msg'),
        {
          okText: t('common.delete'),
          cancelText: t('common.cancel'),
          danger: true,
          title: t('attendance.delete_title')
        }
      );

    if (!ok) {
      return;
    }

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("delete entry");
    storage.deleteEntry(
      fmtDate(activeDate)
    );

    haptic(15);

    toast(
      t('attendance.deleted'),
      'success'
    );

    closeDaySheet();

    SPApp.onDataChange();
  }

  // ---------- Save ----------

  function saveDay() {
    if (!activeDate) {
      return;
    }

    const entry =
      collectEntryFromForm();

    if (!entry) {
      toast(
        t('attendance.no_status'),
        'warning'
      );

      return;
    }

    if (
      (
        entry.status === 'A' ||
        entry.status === 'X'
      ) &&
      entry.from &&
      entry.to
    ) {
      const h =
        getEntryDurationHours(
          entry
        );

      if (
        h <= 0 ||
        h > 36
      ) {
        toast(
          t('attendance.invalid_time'),
          'error'
        );

        return;
      }
    }

    if (
      entry.status === 'L'
    ) {
      const leaveHours =
        Number(
          entry.leaveHours
        );

      if (
        !Number.isFinite(
          leaveHours
        ) ||
        leaveHours < 0 ||
        leaveHours > 24
      ) {
        toast(
          t('attendance.leave_hours_range'),
          'error'
        );

        return;
      }
    }

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("set entry");
    storage.setEntry(
      fmtDate(activeDate),
      entry
    );

    originalEntry =
      JSON.parse(
        JSON.stringify(
          entry
        )
      );

    haptic(12);

    toast(
      t('msg.saved'),
      'success'
    );

    closeDaySheet();

    SPApp.onDataChange();
  }

  // ---------- Copy day ----------

  async function copyDayToOthers() {
    if (
      !activeDate ||
      !originalEntry
    ) {
      toast(
        t('attendance.nothing_to_copy'),
        'warning'
      );

      return;
    }

    const ok =
      await confirmDialog(
        t('attendance.copy_confirm'),
        {
          okText: t('attendance.copy_start'),
          cancelText: t('common.cancel'),
          title: t('attendance.copy_title')
        }
      );

    if (!ok) {
      return;
    }

    closeDaySheet();

    toast(
      t('attendance.copy_hint_toast'),
      'info'
    );

    showCopyToolbar();
  }

  function showCopyToolbar() {
    const toolbar =
      $('#calToolbar');

    toolbar.classList.add(
      'show'
    );

    $('#selCount').textContent =
      t('attendance.copy_toolbar');

    const applyBtn =
      $('#applyShiftToSelected');

    applyBtn.textContent =
      t('attendance.copy_title');

    applyBtn.dataset.mode =
      'copy';
  }

  // ---------- Dashboard quick actions ----------

  function checkInToday() {
    const today =
      new Date();

    const dstr =
      fmtDate(today);

    let entry =
      storage.getEntry(
        dstr
      ) ||
      {
        status: 'A'
      };

    entry.status =
      entry.status === 'X'
        ? 'X'
        : 'A';

    if (!entry.from) {
      entry.from =
        nowHHMM();
    }

    if (!entry.fromDate) {
      entry.fromDate =
        dstr;
    }

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("set entry");
    storage.setEntry(
      dstr,
      entry
    );

    haptic(15);

    toast(
      t('attendance.checkin_done_toast', { time: fmtTime12(entry.from) }),
      'success'
    );

    SPApp.onDataChange();
  }

  function checkOutToday() {
    const today =
      new Date();

    const dstr =
      fmtDate(today);

    let entry =
      storage.getEntry(
        dstr
      );

    if (
      !entry ||
      (
        entry.status !== 'A' &&
        entry.status !== 'X'
      )
    ) {
      toast(
        t('attendance.no_checkin_toast'),
        'warning'
      );

      return;
    }

    entry.to =
      nowHHMM();

    if (!entry.toDate) {
      entry.toDate =
        dstr;
    }

    if (window.SPUndoRedo) SPUndoRedo.pushUndo("set entry");
    storage.setEntry(
      dstr,
      entry
    );

    haptic(15);

    toast(
      t('attendance.checkout_done_toast', { time: fmtTime12(entry.to) }),
      'success'
    );

    SPApp.onDataChange();
  }

  // ---------- Init ----------

  function init() {
    $('#dayOverlay')
      .addEventListener(
        'click',
        closeDaySheet
      );

    $('#inpFrom')
      .addEventListener(
        'input',
        () => {
          updateDurationPreview();
          updateComputedStats();
        }
      );

    $('#inpTo')
      .addEventListener(
        'input',
        () => {
          updateDurationPreview();
          updateComputedStats();
        }
      );

    if ($('#inpLeaveHours')) {
      $('#inpLeaveHours')
        .addEventListener(
          'input',
          () => {
            updateComputedStats();
          }
        );

      $('#inpLeaveHours')
        .addEventListener(
          'change',
          () => {
            updateComputedStats();
          }
        );
    }

    if ($('#inpFromDate')) {
      $('#inpFromDate')
        .addEventListener(
          'input',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );

      $('#inpFromDate')
        .addEventListener(
          'change',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );
    }

    if ($('#inpToDate')) {
      $('#inpToDate')
        .addEventListener(
          'input',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );

      $('#inpToDate')
        .addEventListener(
          'change',
          () => {
            updateDurationPreview();
            updateComputedStats();
          }
        );
    }

    // ---------- Status buttons ----------

    $('#markPresentBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('A')
        )
      );

    $('#btnX')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('X')
        )
      );

    $('#btnL')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('L')
        )
      );

    $('#btnB')
      .addEventListener(
        'click',
        onClickOnce(
          () => setStatus('B')
        )
      );

    // ---------- Clear schedule ----------

    $('#schClearBtn')
      .addEventListener(
        'click',
        () => {
          if (!activeDate) {
            return;
          }

          storage.setSchedule(
            fmtDate(activeDate),
            null
          );

          openDaySheet(
            activeDate
          );

          SPApp.onDataChange();
        }
      );

    // ---------- Save ----------

    $('#saveDayBtn')
      .addEventListener(
        'click',
        onClickOnce(
          saveDay
        )
      );

    // ---------- Delete ----------

    $('#deleteDayBtn')
      .addEventListener(
        'click',
        onClickOnce(
          deleteEntry
        )
      );

    // ---------- Copy ----------

    $('#copyDayBtn')
      .addEventListener(
        'click',
        onClickOnce(
          copyDayToOthers
        )
      );

    // ---------- Dashboard ----------

    $('#checkinBtn')
      .addEventListener(
        'click',
        onClickOnce(
          checkInToday
        )
      );

    $('#checkoutBtn')
      .addEventListener(
        'click',
        onClickOnce(
          checkOutToday
        )
      );
  }

  // ---------- Public API ----------

  global.SPAttendance = {
    init,
    openDaySheet,
    closeDaySheet,
    setStatus,
    computeActualHours,
    computeOvertimeHours,
    computeLateMinutes,
    computeEarlyLeaveMinutes,
    dayValue,
    statusLabels
  };

})(window);