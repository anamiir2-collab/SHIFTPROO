/* ShiftPro - Salary Module
   Computes salary for a pay period.

   Official Holiday Rules:
   - Official holidays DO NOT block attendance.
   - If no attendance is recorded on an official holiday:
       0 salary hours.
   - If the employee works on an official holiday:
       Actual worked hours are counted normally.
       Additional official-holiday hours are added according
       to the employee/company selected multiplier.
   - Example with multiplier 1:
       8 worked + 8 official = 16 salary hours.
   - Official holidays never deduct personal leave balance.

   Exposes: window.SPSalary
*/
(function (global) {
  'use strict';

  const {
    $,
    el,
    fmtDate,
    parseDate,
    addDays,
    fmtNum,
    fmtCurrency,
    fmtHours,
    monthNamesAr,
    toast,
    onClickOnce
  } = SPUtils;

  const storage = SPStorage;

  // دالة ترجمة محلية
  function t(key, vars) {
    return global.SPi18n ? global.SPi18n.t(key, vars) : key;
  }

  // راتب بدقة منزلتين عشريتين بدل تقريب كل بند إلى جنيه كامل.
  function fmtSalaryCurrency(amount) {
    const locale = global.SPi18n && global.SPi18n.getLocale() === 'en'
      ? 'en-US'
      : 'ar-EG';
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EGP',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(amount) || 0);
    } catch (e) {
      return fmtNum(Number(amount) || 0, 2) + ' ' + (locale === 'en-US' ? 'EGP' : 'ج.م');
    }
  }

  function monthName(i) {
    return global.SPi18n ? global.SPi18n.getMonthName(i) : monthNamesAr[i];
  }

  // =========================================================
  // Pay period
  // =========================================================

  function getPayPeriod(refDate) {
    return SPCalendar.getPayPeriod(refDate);
  }

  // =========================================================
  // Hourly rate
  // =========================================================

  function getHourlyRate() {
    const s = storage.getSettings();

    if (
      s.hourlyRate &&
      Number(s.hourlyRate) > 0
    ) {
      return Number(s.hourlyRate);
    }

    const monthly =
      Number(s.salary) || 0;

    const hours =
      Number(s.monthlyHours) || 1;

    return monthly / hours;
  }

  function getOvertimeHourlyRate() {
    const s =
      storage.getSettings();

    return (
      getHourlyRate() *
      (Number(s.overtimeRate) || 1.5)
    );
  }

  // =========================================================
  // Official holiday multiplier
  // =========================================================

  function getOfficialHolidayMultiplier() {
    const s =
      storage.getSettings();

    let multiplier =
      Number(
        s.officialHolidayRate
      );

    // Default:
    // 1 = same number of additional hours
    // Example:
    // 8 worked + 8 official = 16
    if (!Number.isFinite(multiplier)) {
      multiplier = 1;
    }

    if (multiplier < 0) {
      multiplier = 0;
    }

    if (multiplier > 5) {
      multiplier = 5;
    }

    return multiplier;
  }

  // =========================================================
  // Official holiday helpers
  // =========================================================

  function isOfficialHoliday(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.isOfficialHoliday !== 'function'
    ) {
      return false;
    }

    return global.SPOfficialHolidays.isOfficialHoliday(
      fmtDate(date)
    );
  }

  function getOfficialHolidayName(date) {
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.getOfficialHolidayName !== 'function'
    ) {
      return '';
    }

    return global.SPOfficialHolidays.getOfficialHolidayName(
      fmtDate(date)
    ) || '';
  }

  // =========================================================
  // Leave helpers
  // =========================================================

  function getLeaveHours(entry) {
    if (!entry) return 0;

    let hours =
      Number(entry.leaveHours);

    // Old leave records
    if (!Number.isFinite(hours)) {
      hours = 8;
    }

    if (hours < 0) hours = 0;
    if (hours > 24) hours = 24;

    return hours;
  }

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
      'بدون راتب': 'unpaid',
      بدون_راتب: 'unpaid',

      periodic: 'periodic',
      دورية: 'periodic',

      other: 'other',
      أخرى: 'other',
      اخرى: 'other'
    };

    return aliases[value] || 'annual';
  }

  function isPaidLeave(entry) {
    if (!entry) return false;

    const type =
      normalizeLeaveType(
        entry.leaveType
      );

    return type !== 'unpaid';
  }

  // =========================================================
  // Compute salary
  // =========================================================

  function computeSalary(start, end) {
    const s =
      storage.getSettings();

    const baseRate =
      getHourlyRate();

    const overtimeRate =
      getOvertimeHourlyRate();

    const officialHolidayMultiplier =
      getOfficialHolidayMultiplier();

    const counts = {
      A: 0,
      X: 0,
      L: 0,
      B: 0,
      H: 0   // أيام إجازة رسمية (افتراضية عند تفعيل holidaysAsLeave)
    };

    let baseHours = 0;
    let overtimeHours = 0;

    // Additional official holiday hours
    let officialHolidayHours = 0;

    // ساعات الإجازة الرسمية المدفوعة (عند تفعيل الخيارين معًا)
    let holidayPaidHours = 0;

    let lateTotal = 0;
    let earlyTotal = 0;

    let paidLeaveHours = 0;
    let unpaidLeaveHours = 0;

    const dailyDetails = [];

    let d =
      new Date(start);

    while (d <= end) {
      const dstr =
        fmtDate(d);

      const entry =
        storage.getEntry(dstr);

      const status =
        entry
          ? entry.status
          : null;

      const officialHoliday =
        s.showHolidays !== false &&
        isOfficialHoliday(d);

      const officialHolidayName =
        officialHoliday
          ? getOfficialHolidayName(d)
          : '';

      /*
        خيار "اعتبار الإجازات الرسمية إجازة تلقائيًا":
        - يوم إجازة رسمية بدون أي سجل → يُعد يوم إجازة (H)
          ولا يُعد غيابًا ولا حضورًا.
        - إذا كان "الإجازات الرسمية مدفوعة" مفعّلًا
          يُضاف أجر يوم عادي (ساعات الوردية × سعر الساعة).
        - بدون تفعيل الخيارين: اليوم يبقى كما كان تمامًا
          (بدون سجلات = بدون قيمة) — السلوك الأصلي محفوظ.
      */
      if (
        !entry &&
        officialHoliday &&
        s.holidaysAsLeave
      ) {
        counts.H++;

        if (s.holidaysPaid) {
          const sh =
            Number(s.shiftHours) || 12;

          baseHours += sh;

          holidayPaidHours += sh;
        }

        dailyDetails.push({
          date: new Date(d),

          entry: null,

          actual: s.holidaysPaid ? (Number(s.shiftHours) || 12) : 0,

          ot: 0,

          late: 0,

          early: 0,

          value: s.holidaysPaid
            ? Math.round(
                (Number(s.shiftHours) || 12) * baseRate
              )
            : 0,

          officialHoliday,

          officialHolidayName,

          isAutoHoliday: true,

          officialHolidayHours: 0
        });

        d = addDays(d, 1);
        continue;
      }

      let actual = 0;
      let ot = 0;
      let late = 0;
      let early = 0;
      let value = 0;

      // =====================================================
      // Absence
      // =====================================================

      if (status === 'B') {
        counts.B++;
      }

      // =====================================================
      // Leave
      // =====================================================

      else if (status === 'L') {

        // Official holiday is NOT personal leave.
        // Do not deduct it as annual/casual/etc.
        if (officialHoliday) {

          // A manually-created L record on an official
          // holiday contributes nothing to salary.
          actual = 0;

        } else {

          counts.L++;

          actual =
            getLeaveHours(entry);

          if (isPaidLeave(entry)) {

            baseHours +=
              actual;

            paidLeaveHours +=
              actual;

          } else {

            unpaidLeaveHours +=
              actual;
          }
        }
      }

      // =====================================================
      // Applied shift X
      // =====================================================

      else if (status === 'X') {

        counts.X++;

        actual =
          SPAttendance.computeActualHours(
            entry
          );

        ot =
          SPAttendance.computeOvertimeHours(
            d,
            entry
          );

        const regularHours =
          Math.max(
            0,
            actual - ot
          );

        baseHours +=
          regularHours;

        overtimeHours +=
          ot;

        // ===================================================
        // Official holiday
        // ===================================================

        if (
          officialHoliday &&
          actual > 0
        ) {

          officialHolidayHours +=
            actual *
            officialHolidayMultiplier;
        }
      }

      // =====================================================
      // Attendance A
      // =====================================================

      else if (status === 'A') {

        counts.A++;

        actual =
          SPAttendance.computeActualHours(
            entry
          );

        ot =
          SPAttendance.computeOvertimeHours(
            d,
            entry
          );

        const regularHours =
          Math.max(
            0,
            actual - ot
          );

        baseHours +=
          regularHours;

        overtimeHours +=
          ot;

        // ===================================================
        // Official holiday additional hours
        // ===================================================

        if (
          officialHoliday &&
          actual > 0
        ) {

          officialHolidayHours +=
            actual *
            officialHolidayMultiplier;
        }

        // ===================================================
        // Late / early
        // ===================================================

        if (
          entry &&
          entry.from
        ) {

          late =
            SPAttendance.computeLateMinutes(
              d,
              entry.from
            );
        }

        if (
          entry &&
          entry.to
        ) {

          early =
            SPAttendance.computeEarlyLeaveMinutes(
              d,
              entry.to
            );
        }

        lateTotal +=
          late;

        earlyTotal +=
          early;
      }

      // =====================================================
      // Day value
      // =====================================================

      value =
        SPAttendance.dayValue(
          d,
          entry
        );

      dailyDetails.push({
        date:
          new Date(d),

        entry,

        actual,

        ot,

        late,

        early,

        value,

        officialHoliday,

        officialHolidayName,

        isAutoHoliday: false,

        officialHolidayHours:
          officialHoliday &&
          actual > 0
            ? actual *
              officialHolidayMultiplier
            : 0
      });

      d =
        addDays(d, 1);
    }

    // =========================================================
    // Adjustments
    // =========================================================

    const adjustments =
      storage
        .getAdjustments()
        .filter((a) => {

          const ad =
            parseDate(a.date);

          return (
            ad >= start &&
            ad <= end
          );
        });

    let bonus = 0;
    let allowance = 0;
    let deduction = 0;
    let advance = 0;

    adjustments.forEach((a) => {

      const amt =
        Number(a.amount) || 0;

      if (a.type === 'bonus') {
        bonus += amt;
      }

      else if (a.type === 'allowance') {
        allowance += amt;
      }

      else if (a.type === 'deduction') {
        deduction += amt;
      }

      else if (a.type === 'advance') {
        advance += amt;
      }
    });

    // =========================================================
    // Absence deduction
    // =========================================================

    let absenceDeduction = 0;

    if (s.deductAbsence) {

      const dayValue =
        baseRate *
        (
          Number(s.shiftHours) ||
          12
        );

      absenceDeduction =
        counts.B *
        dayValue;
    }

    // =========================================================
    // Late deduction
    // =========================================================

    let lateDeduction = 0;

    if (s.deductLate) {

      const lateHours =
        lateTotal / 60;

      lateDeduction =
        lateHours *
        baseRate;
    }

    // =========================================================
    // Salary totals
    // =========================================================

    /*
      Important:

      officialHolidayHours are ADDITIONAL salary hours.

      Example:
      actual = 8
      multiplier = 1

      normal:
      8 hours

      official:
      +8 hours

      total:
      16 hours
    */

    const totalHours =
      baseHours +
      overtimeHours +
      officialHolidayHours;

    const baseSalary =
      baseHours *
      baseRate;

    const overtimeValue =
      overtimeHours *
      overtimeRate;

    // Official holiday additional payment
    const officialHolidayValue =
      officialHolidayHours *
      overtimeRate;

    const totalDeductions =
      deduction +
      advance +
      absenceDeduction +
      lateDeduction;

    const grossSalary =
      baseSalary +
      overtimeValue +
      officialHolidayValue +
      bonus +
      allowance;

    const netSalary =
      grossSalary -
      totalDeductions;

    // =========================================================
    // Result
    // =========================================================

    return {

      counts,

      baseHours:
        Math.round(
          baseHours * 100
        ) / 100,

      overtimeHours:
        Math.round(
          overtimeHours * 100
        ) / 100,

      officialHolidayHours:
        Math.round(
          officialHolidayHours * 100
        ) / 100,

      holidayPaidHours:
        Math.round(
          holidayPaidHours * 100
        ) / 100,

      totalHours:
        Math.round(
          totalHours * 100
        ) / 100,

      paidLeaveHours:
        Math.round(
          paidLeaveHours * 100
        ) / 100,

      unpaidLeaveHours:
        Math.round(
          unpaidLeaveHours * 100
        ) / 100,

      lateTotal,
      earlyTotal,

      baseRate,
      overtimeRate,

      officialHolidayMultiplier,

      // Keep full precision in the calculation; round only for display.
      baseSalary,
      overtimeValue,
      officialHolidayValue,
      bonus,
      allowance,
      deduction,
      advance,
      absenceDeduction,
      lateDeduction,
      grossSalary,
      totalDeductions,
      netSalary,

      adjustments,

      dailyDetails
    };
  }

  // =========================================================
  // Render salary page
  // =========================================================

  function render() {

    const periodRef =
      SPCalendar.getPeriodRef();

    const {
      start,
      end
    } =
      getPayPeriod(
        periodRef
      );

    $('#periodLabel').textContent =
      `${start.getDate()} ` +
      `${monthName(start.getMonth())} — ` +
      `${end.getDate()} ` +
      `${monthName(end.getMonth())} ` +
      `${end.getFullYear()}`;

    const s =
      storage.getSettings();

    // صف "أيام إجازة رسمية" يظهر فقط عند تفعيل الاعتبار التلقائي
    const holidayRow = document.getElementById('pHolidayRow');
    if (holidayRow) {
      holidayRow.hidden = !(s.holidaysAsLeave && s.showHolidays !== false);
    }

    // تلميح دورة الصرف — نص مترجم مع أرقام الدورة الفعلية
    const cycleHint = document.getElementById('cycleHint');
    const cycleEndDay = s.cycleDay - 1 <= 0 ? 28 : s.cycleDay - 1;
    if (cycleHint) {
      cycleHint.textContent = t('salarypage.period_hint', { start: s.cycleDay, end: cycleEndDay });
    }

    const result =
      computeSalary(
        start,
        end
      );

    // Counts
    $('#pA').textContent =
      result.counts.A;

    $('#pX').textContent =
      result.counts.X;

    $('#pL').textContent =
      result.counts.L;

    $('#pB').textContent =
      result.counts.B;

    $('#pHoliday').textContent =
      result.counts.H || 0;

    // Hours
    $('#pBaseHours').textContent =
      fmtHours(
        result.baseHours
      );

    $('#pOvertimeHours').textContent =
      fmtHours(
        result.overtimeHours
      );

    $('#pHours').textContent =
      fmtHours(
        result.totalHours
      );

    // Rates
    $('#pRate').textContent =
      fmtNum(
        result.baseRate,
        2
      ) + ' ' + t('salarypage.currency_per_hour');

    $('#pOvertimeRate').textContent =
      fmtNum(
        result.overtimeRate,
        2
      ) + ' ' + t('salarypage.currency_per_hour');

    // Detailed salary breakdown: display all components separately.
    $('#pBaseSalary').textContent = fmtSalaryCurrency(result.baseSalary);
    $('#pBaseFormula').textContent = t('salarypage.formula_base', {
      hours: fmtNum(result.baseHours, 2),
      rate: fmtNum(result.baseRate, 2)
    });

    $('#pOvertimeValue').textContent = fmtSalaryCurrency(result.overtimeValue);
    $('#pOvertimeFormula').textContent = t('salarypage.formula_overtime', {
      hours: fmtNum(result.overtimeHours, 2),
      rate: fmtNum(result.overtimeRate, 2)
    });

    const officialHolidayValueRow = document.getElementById('pOfficialHolidayValueRow');
    const holidayFormulaRow = document.getElementById('pOfficialHolidayFormulaRow');
    const showHolidayPay = result.officialHolidayValue > 0;
    if (officialHolidayValueRow) officialHolidayValueRow.hidden = !showHolidayPay;
    if (holidayFormulaRow) holidayFormulaRow.hidden = !showHolidayPay;
    const holidayFormula = document.getElementById('pOfficialHolidayFormula');
    if (holidayFormula) {
      holidayFormula.textContent = t('salarypage.formula_holiday', {
        hours: fmtNum(result.officialHolidayHours, 2),
        multiplier: fmtNum(result.officialHolidayMultiplier, 2),
        rate: fmtNum(result.overtimeRate, 2)
      });
    }
    const holidayValue = document.getElementById('pOfficialHolidayValue');
    if (holidayValue) holidayValue.textContent = fmtSalaryCurrency(result.officialHolidayValue);

    $('#pBonus').textContent = fmtSalaryCurrency(result.bonus);
    $('#pAllowance').textContent = fmtSalaryCurrency(result.allowance);
    $('#pGrossSalary').textContent = fmtSalaryCurrency(result.grossSalary);
    $('#pDeduction').textContent = fmtSalaryCurrency(result.deduction);
    $('#pAbsenceDeduction').textContent = fmtSalaryCurrency(result.absenceDeduction);
    $('#pLateDeduction').textContent = fmtSalaryCurrency(result.lateDeduction);
    $('#pTotalDeductions').textContent = fmtSalaryCurrency(result.totalDeductions);
    $('#pAdvance').textContent = fmtSalaryCurrency(result.advance);
    $('#pTotal').textContent = fmtSalaryCurrency(result.netSalary);

    renderAdjustments(
      result.adjustments
    );
  }

  // =========================================================
  // Render adjustments
  // =========================================================

  function renderAdjustments(
    adjustments
  ) {

    const list =
      $('#adjustmentsList');

    list.innerHTML = '';

    if (
      adjustments.length === 0
    ) {

      list.appendChild(
        el('div', {
          class:
            'empty-state',
          style:
            'padding:24px 8px;'
        }, [
          el('div', {
            class:
              'fs-sm muted'
          }, [
            t('salarypage.empty_adj')
          ])
        ])
      );

      return;
    }

    adjustments.forEach((a) => {

      const sign =
        (
          a.type === 'bonus' ||
          a.type === 'allowance'
        )
          ? '+'
          : '−';

      const cls =
        (
          a.type === 'bonus' ||
          a.type === 'allowance'
        )
          ? 'success'
          : 'danger';

      const row =
        el('div', {
          class:
            'setting-row',
          style:
            'padding:8px 0;' +
            'border-bottom:1px solid var(--line-soft);'
        });

      const meta =
        el('div', {
          class: 'meta'
        });

      meta.appendChild(
        el('div', {
          class:
            't1 fs-sm'
        }, [
          a.type === 'bonus'
            ? t('adj.type_bonus')
            : a.type === 'allowance'
              ? t('adj.type_allowance')
              : a.type === 'deduction'
                ? t('adj.type_deduction')
                : t('adj.type_advance')
        ])
      );

      meta.appendChild(
        el('div', {
          class:
            't2 fs-sm'
        }, [
          `${fmtDate(parseDate(a.date))}` +
          `${a.reason ? ' — ' + a.reason : ''}`
        ])
      );

      row.appendChild(meta);

      row.appendChild(
        el('strong', {
          class:
            cls + ' fs-md'
        }, [
          sign +
          ' ' +
          fmtSalaryCurrency(
            a.amount
          )
        ])
      );

      const delBtn =
        el('button', {
          class:
            'icon-btn',
          style:
            'width:32px;' +
            'height:32px;' +
            'font-size:14px;',
          'aria-label':
            t('common.delete')
        }, [
          '×'
        ]);

      delBtn.addEventListener(
        'click',
        async () => {

          const ok =
            await SPUtils.confirmDialog(
              t('adj.delete_confirm'),
              {
                okText:
                  t('common.delete'),
                danger:
                  true
              }
            );

          if (!ok) return;

          storage.deleteAdjustment(
            a.id
          );

          SPUtils.toast(
            t('msg.deleted'),
            'success'
          );

          SPApp.onDataChange();
        }
      );

      row.appendChild(
        delBtn
      );

      list.appendChild(
        row
      );
    });
  }

  // =========================================================
  // Adjustment sheet
  // =========================================================

  function openAdjustmentSheet(
    preselectedDate
  ) {

    const overlay =
      $('#adjOverlay');

    const sheet =
      $('#adjSheet');

    $('#adjTitle').textContent =
      t('adj.sheet_title');

    $('#adjType').value =
      'bonus';

    $('#adjAmount').value =
      '';

    $('#adjReason').value =
      '';

    $('#adjDate').value =
      preselectedDate ||
      SPUtils.todayStr();

    overlay.classList.add(
      'show'
    );

    sheet.classList.add(
      'show'
    );
  }

  function closeAdjustmentSheet() {

    $('#adjOverlay')
      .classList.remove(
        'show'
      );

    $('#adjSheet')
      .classList.remove(
        'show'
      );
  }

  function saveAdjustment() {

    const type =
      $('#adjType').value;

    const amount =
      Number(
        $('#adjAmount').value
      ) || 0;

    const date =
      $('#adjDate').value;

    const reason =
      $('#adjReason').value.trim();

    if (amount <= 0) {

      toast(
        t('adj.enter_amount'),
        'warning'
      );

      return;
    }

    if (!date) {

      toast(
        t('adj.enter_date'),
        'warning'
      );

      return;
    }

    storage.addAdjustment({
      type,
      amount,
      date,
      reason
    });

    closeAdjustmentSheet();

    toast(
      t('adj.saved'),
      'success'
    );

    SPApp.onDataChange();
  }

  // =========================================================
  // Init
  // =========================================================

  function init() {

    $('#prevPeriodBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () =>
            SPCalendar.shiftPeriod(-1)
        )
      );

    $('#nextPeriodBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () =>
            SPCalendar.shiftPeriod(1)
        )
      );

    $('#addAdjustmentBtn')
      .addEventListener(
        'click',
        onClickOnce(
          () =>
            openAdjustmentSheet()
        )
      );

    $('#saveAdjBtn')
      .addEventListener(
        'click',
        onClickOnce(
          saveAdjustment
        )
      );

    $('#cancelAdjBtn')
      .addEventListener(
        'click',
        closeAdjustmentSheet
      );

    $('#adjOverlay')
      .addEventListener(
        'click',
        closeAdjustmentSheet
      );
  }

  // =========================================================
  // Public API
  // =========================================================

  global.SPSalary = {

    init,

    render,

    computeSalary,

    getHourlyRate,

    getOvertimeHourlyRate,

    getPayPeriod,

    getLeaveHours,

    isPaidLeave,

    getOfficialHolidayMultiplier,

    isOfficialHoliday
  };

})(window);