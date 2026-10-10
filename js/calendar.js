/* ShiftPro - Calendar Module
   Renders the calendar grid, handles day-click, multi-select, and pattern.
   Official holidays + Ramadan dates integrated.
   Exposes: window.SPCalendar
*/
(function (global) {
  'use strict';

  const {
    $,
    el,
    fmtDate,
    parseDate,
    addDays,
    sameDay,
    dayDiff,
    monthNamesAr,
    monthShortAr,
    weekdayShortAr
  } = SPUtils;

  const storage = SPStorage;

  let periodRef = new Date();
  const selectedDates = new Set();
  let onSelectChangeCb = null;

  // ---------- i18n helpers ----------

  function t(key, vars) {
    return global.SPi18n ? global.SPi18n.t(key, vars) : key;
  }

  function monthName(i) {
    return global.SPi18n ? global.SPi18n.getMonthName(i) : monthNamesAr[i];
  }

  function monthShort(i) {
    return global.SPi18n ? global.SPi18n.getMonthShort(i) : monthShortAr[i];
  }

  // ---------- الإعدادات: خيارات العرض ----------

  function displaySettings() {
    try {
      return storage.getSettings();
    } catch (e) {
      return {};
    }
  }

  function shouldShowHolidays() {
    return displaySettings().showHolidays !== false;
  }

  function localizedHolidayName(holiday) {
    if (!holiday) return '';
    if (
      global.SPOfficialHolidays &&
      typeof global.SPOfficialHolidays.getHolidayLocalizedName === 'function'
    ) {
      return global.SPOfficialHolidays.getHolidayLocalizedName(holiday);
    }
    return holiday.name || '';
  }

  // ---------- Official Holidays ----------

  function getOfficialHoliday(date) {
    // خيار "إظهار الإجازات الرسمية" = OFF يعني لا عرض ولا خصم — اليوم عادي تمامًا
    if (!shouldShowHolidays()) return null;
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.getOfficialHoliday !== 'function'
    ) {
      return null;
    }

    return global.SPOfficialHolidays.getOfficialHoliday(date);
  }

  function getSpecialDate(date) {
    if (!shouldShowHolidays()) return null;
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.getSpecialDate !== 'function'
    ) {
      return null;
    }

    return global.SPOfficialHolidays.getSpecialDate(date);
  }

  function isOfficialHoliday(date) {
    if (!shouldShowHolidays()) return false;
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.isOfficialHoliday !== 'function'
    ) {
      return false;
    }

    return global.SPOfficialHolidays.isOfficialHoliday(date);
  }

  function isRamadanStart(date) {
    if (!shouldShowHolidays()) return false;
    if (
      !global.SPOfficialHolidays ||
      typeof global.SPOfficialHolidays.isRamadanStart !== 'function'
    ) {
      return false;
    }

    return global.SPOfficialHolidays.isRamadanStart(date);
  }

  // ---------- Pay Period ----------

  function getPayPeriod(refDate) {
    const cd =
      storage.getSettings().cycleDay;

    let y =
      refDate.getFullYear();

    let m =
      refDate.getMonth();

    let start;

    if (
      refDate.getDate() >= cd
    ) {
      start =
        new Date(
          y,
          m,
          cd
        );
    } else {
      start =
        new Date(
          y,
          m - 1,
          cd
        );
    }

    const end =
      new Date(
        start.getFullYear(),
        start.getMonth() + 1,
        cd - 1
      );

    return {
      start,
      end
    };
  }

  // ---------- Shift Legend ----------

  function shiftLegend() {
    const shifts =
      storage.getShifts();

    return shifts
      .map(
        (s) =>
          `<span><i class="dot" style="background:${s.color}"></i> ${SPUtils.shiftDisplayName(s)}</span>`
      )
      .join('');
  }

  function getCellStyling(code) {
    const shift =
      storage.getShiftByCode(
        code
      );

    if (!shift) {
      return {
        bg: '',
        color: '',
        label: t('calendar.pick')
      };
    }

    return {
      bg: shift.color,
      color: '#fff',
      label: shift.name
    };
  }

  function renderLegend() {
    $('#shiftLegend').innerHTML =
      shiftLegend();

    // عنصر مفتاح "إجازة رسمية" — يظهر فقط عند تفعيل عرض الإجازات
    const holidayLegend = document.getElementById('legendHoliday');
    if (holidayLegend) {
      holidayLegend.hidden = !shouldShowHolidays();
    }
  }

  // ---------- Calendar ----------

  function renderCalendar() {
    const {
      start,
      end
    } =
      getPayPeriod(
        periodRef
      );

    $('#monthLabel').textContent =
      `${start.getDate()} ${
        monthName(
          start.getMonth()
        )
      } – ${end.getDate()} ${
        monthName(
          end.getMonth()
        )
      }`;

    const grid =
      $('#calGrid');

    grid.innerHTML = '';

    const startOffset =
      start.getDay();

    const totalDays =
      dayDiff(
        end,
        start
      ) + 1;

    const today =
      new Date();

    // ---------- Empty cells ----------

    for (
      let i = 0;
      i < startOffset;
      i++
    ) {
      grid.appendChild(
        el(
          'div',
          {
            class:
              'cal-cell empty'
          }
        )
      );
    }

    // ---------- Days ----------

    for (
      let i = 0;
      i < totalDays;
      i++
    ) {
      const date =
        addDays(
          start,
          i
        );

      const dstr =
        fmtDate(
          date
        );

      const code =
        storage.getScheduledCode(
          dstr
        );

      const entry =
        storage.getEntry(
          dstr
        );

      const status =
        entry
          ? entry.status
          : null;

      const shift =
        storage.getShiftByCode(
          code
        );

      // ---------- Official Holiday ----------

      const officialHoliday =
        getOfficialHoliday(
          date
        );

      // ---------- Special Date ----------

      const specialDate =
        getSpecialDate(
          date
        );

      const official =
        !!officialHoliday;

      const ramadanStart =
        !!(
          specialDate &&
          specialDate.isRamadanStart
        );

      /*
        ساعات اليوم.

        الإجازة الرسمية لا توقف
        حساب ساعات العمل.

        إذا تم تسجيل حضور في
        الإجازة الرسمية يتم حساب
        الساعات بشكل طبيعي.
      */
      const hours =
        entry
          ? computeEntryHours(
              entry
            )
          : 0;

      // ---------- Cell Class ----------

      let cellClass =
        'cal-cell clickable';

      if (code) {
        cellClass +=
          ' scheduled';
      }

      if (
        sameDay(
          date,
          today
        )
      ) {
        cellClass +=
          ' today';
      }

      if (
        date < today &&
        !sameDay(
          date,
          today
        )
      ) {
        cellClass +=
          ' before';
      }

      if (
        selectedDates.has(
          dstr
        )
      ) {
        cellClass +=
          ' selected';
      }

      /*
        الإجازة الرسمية لا تمنع
        التعامل مع اليوم كيوم عمل.
        لذلك لا نضيف class خاص
        يعطل أو يغير سلوك اليوم.
      */

      if (ramadanStart) {
        cellClass +=
          ' ramadan-start';
      }

      // يوم إجازة رسمية: لمسة بصرية خفيفة دون تغيير سلوك اليوم
      if (official) {
        cellClass += ' holiday';
      }

      const cell =
        el(
          'div',
          {
            class:
              cellClass,

            dataset: {
              date: dstr
            },

            role: 'button',

            tabindex: '0',

            'aria-label':
              buildAriaLabel(
                date,
                shift,
                officialHoliday,
                ramadanStart
              )
          }
        );

      // ---------- Shift Background ----------

      /*
        الوردية تظهر بشكل طبيعي
        حتى لو كان اليوم إجازة رسمية.
      */
      if (shift) {
        cell.style.background =
          shift.color;

        cell.style.borderColor =
          shift.color;

        cell.style.color =
          '#fff';
      }

      // ---------- Day Number ----------

      const num =
        el(
          'div',
          {
            class: 'num'
          }
        );

      num.textContent =
        date.getDate() === 1
          ? `${date.getDate()} ${
              monthShort(
                date.getMonth()
              )
            }`
          : date.getDate();

      cell.appendChild(
        num
      );

      // ---------- Shift Tag ----------

      const tag =
        el(
          'div',
          {
            class: 'tag'
          }
        );

      /*
        في حالة الإجازة الرسمية:
        يظهر اسم المناسبة فقط.
      */
      if (officialHoliday) {
        tag.textContent =
          localizedHolidayName(officialHoliday);
      } else if (ramadanStart) {
        tag.textContent =
          t('holiday.ramadan_start');
      } else {
        tag.textContent =
          shift
            ? SPUtils.shiftDisplayName(shift)
            : t('calendar.pick');
      }

      cell.appendChild(
        tag
      );

      // ---------- Holiday dot ----------

      if (official) {
        const hdot = el('i', {
          class: 'holiday-dot',
          'aria-hidden': 'true'
        });

        cell.appendChild(hdot);
      }

      // ---------- Ramadan Label ----------

      if (ramadanStart) {
        const ramadanLabel =
          el(
            'div',
            {
              class:
                'ramadan-label'
            }
          );

        ramadanLabel.textContent =
          t('holiday.ramadan_label');

        cell.appendChild(
          ramadanLabel
        );
      }

      // ---------- Hours Preview ----------

      /*
        ساعات الحضور تظهر بشكل طبيعي
        حتى في الإجازات الرسمية.
      */
      if (
        entry &&
        hours > 0
      ) {
        const hrs =
          el(
            'div',
            {
              class: 'hrs'
            }
          );

        hrs.textContent =
          SPUtils.fmtHours(hours);

        cell.appendChild(
          hrs
        );
      }

      // ---------- Attendance Badge ----------

      if (status) {
        const b =
          el(
            'div',
            {
              class:
                'badge ' +
                status,

              'aria-hidden':
                'true'
            }
          );

        b.textContent =
          status === 'A'
            ? '✓'
            : (
                status === 'X'
                  ? t('calendar.badge_double')
                  : (
                      status === 'L'
                        ? t('calendar.badge_leave')
                        : t('calendar.badge_absent')
                    )
              );

        cell.appendChild(
          b
        );
      }

      // ---------- Click ----------

      cell.addEventListener(
        'click',
        () => {

          /*
            كل الأيام قابلة للضغط
            بما فيها الإجازات الرسمية.

            الإجازة الرسمية لا تمنع
            تسجيل الحضور أو الإجازة
            أو تعديل السجل.
          */

          if (
            selectedDates.size > 0
          ) {
            toggleSelection(
              dstr
            );
          } else {
            SPAttendance.openDaySheet(
              parseDate(
                dstr
              )
            );
          }
        }
      );

      // ---------- Long Press ----------

      let pressTimer =
        null;

      const startPress =
        (e) => {
          pressTimer =
            setTimeout(
              () => {
                pressTimer =
                  null;

                SPUtils.haptic(
                  20
                );

                toggleSelection(
                  dstr
                );

                if (
                  e.preventDefault
                ) {
                  e.preventDefault();
                }
              },
              500
            );
        };

      const cancelPress =
        () => {
          if (pressTimer) {
            clearTimeout(
              pressTimer
            );

            pressTimer =
              null;
          }
        };

      cell.addEventListener(
        'touchstart',
        startPress,
        {
          passive: true
        }
      );

      cell.addEventListener(
        'touchend',
        cancelPress
      );

      cell.addEventListener(
        'touchmove',
        cancelPress
      );

      cell.addEventListener(
        'touchcancel',
        cancelPress
      );

      grid.appendChild(
        cell
      );
    }
  }

  // ---------- Accessibility ----------

  function buildAriaLabel(
    date,
    shift,
    officialHoliday,
    ramadanStart
  ) {
    let label =
      `${date.getDate()} ${
        monthName(
          date.getMonth()
        )
      }`;

    if (officialHoliday) {
      label +=
        ` — ${localizedHolidayName(officialHoliday)}`;
    } else if (ramadanStart) {
      label +=
        ` — ${t('holiday.ramadan_start')}`;
    } else if (shift) {
      label +=
        ` — ${SPUtils.shiftDisplayName(shift)}`;
    } else {
      label +=
        ` — ${t('calendar.day_unset')}`;
    }

    return label;
  }

  // ---------- Selection ----------

  function toggleSelection(
    dstr
  ) {
    if (
      selectedDates.has(
        dstr
      )
    ) {
      selectedDates.delete(
        dstr
      );
    } else {
      selectedDates.add(
        dstr
      );
    }

    updateSelectionUI();

    renderCalendar();
  }

  function updateSelectionUI() {
    const toolbar =
      $('#calToolbar');

    const clearBtn =
      $('#clearSelectBtn');

    if (
      selectedDates.size > 0
    ) {
      toolbar.classList.add(
        'show'
      );

      clearBtn.hidden =
        false;

      $('#selCount').textContent =
        t('calendar.selected_count', { n: selectedDates.size });
    } else {
      toolbar.classList.remove(
        'show'
      );

      clearBtn.hidden =
        true;
    }
  }

  function clearSelection() {
    selectedDates.clear();

    updateSelectionUI();

    renderCalendar();
  }

  // ---------- Apply Shift ----------

  async function applyShiftToSelected() {
    if (
      selectedDates.size === 0
    ) {
      return;
    }

    const shifts =
      storage.getShifts();

    const overlay =
      el(
        'div',
        {
          class:
            'sp-confirm-overlay show'
        }
      );

    const box =
      el(
        'div',
        {
          class:
            'sp-confirm-box'
        }
      );

    const title =
      el(
        'div',
        {
          class:
            'sp-confirm-title'
        },
        [
          t('calendar.choose_shift')
        ]
      );

    const msg =
      el(
        'div',
        {
          class:
            'sp-confirm-msg'
        },
        [
          t('calendar.will_apply', { n: selectedDates.size })
        ]
      );

    const grid =
      el(
        'div',
        {
          style:
            'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px;'
        }
      );

    shifts.forEach(
      (s) => {
        const btn =
          el(
            'button',
            {
              class:
                'btn sm',

              style:
                `background:${s.color}22;border-color:${s.color};color:${s.color};`
            },
            [
              s.name
            ]
          );

        btn.addEventListener(
          'click',
          async () => {
            overlay.remove();

            const entries = {};

            selectedDates.forEach(
              (d) => {
                entries[d] =
                  s.code;
              }
            );

            storage.setScheduleMany(
              entries
            );

            SPUtils.toast(
              t('calendar.applied', { shift: SPUtils.shiftDisplayName(s), n: selectedDates.size }),
              'success'
            );

            clearSelection();

            SPApp.onDataChange();
          }
        );

        grid.appendChild(
          btn
        );
      }
    );

    const cancelBtn =
      el(
        'button',
        {
          class:
            'sp-btn sp-btn-ghost'
        },
        [
          t('common.cancel')
        ]
      );

    cancelBtn.addEventListener(
      'click',
      () =>
        overlay.remove()
    );

    box.appendChild(
      title
    );

    box.appendChild(
      msg
    );

    box.appendChild(
      grid
    );

    box.appendChild(
      cancelBtn
    );

    overlay.appendChild(
      box
    );

    document.body.appendChild(
      overlay
    );
  }

  // ---------- Clear Selected ----------

  async function clearSelected() {
    if (
      selectedDates.size === 0
    ) {
      return;
    }

    const ok =
      await SPUtils.confirmDialog(
        t('calendar.clear_confirm', { n: selectedDates.size }),
        {
          okText: t('calendar.clear'),
          danger: true
        }
      );

    if (!ok) {
      return;
    }

    const entries = {};

    selectedDates.forEach(
      (d) => {
        entries[d] =
          null;
      }
    );

    storage.setScheduleMany(
      entries
    );

    SPUtils.toast(
      t('calendar.cleared'),
      'success'
    );

    clearSelection();

    SPApp.onDataChange();
  }

  // ---------- Entry Hours ----------

  function computeEntryHours(entry) {
    if (!entry) {
      return 0;
    }

    // ---------- Leave ----------

    if (
      entry.status === 'L'
    ) {
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
        الإجازة بدون تحديد ساعات
        تحسب تلقائياً 8 ساعات.
      */
      return 8;
    }

    // ---------- Attendance ----------

    if (
      (
        entry.status === 'A' ||
        entry.status === 'X'
      ) &&
      entry.from &&
      entry.to
    ) {
      if (
        global.SPAttendance &&
        typeof
          global.SPAttendance.computeActualHours ===
          'function'
      ) {
        const actual =
          global.SPAttendance.computeActualHours(
            entry
          );

        if (
          Number.isFinite(
            actual
          ) &&
          actual > 0
        ) {
          return actual;
        }
      }

      return SPUtils.computeRangeHours(
        entry.from,
        entry.to
      );
    }

    const sh =
      Number(
        storage.getSettings().shiftHours
      ) || 12;

    // ---------- 24 Hour Shift ----------

    if (
      entry.status === 'X'
    ) {
      return sh * 2;
    }

    // ---------- Normal Attendance ----------

    if (
      entry.status === 'A'
    ) {
      return sh;
    }

    // ---------- Absence ----------

    if (
      entry.status === 'B'
    ) {
      return 0;
    }

    return 0;
  }

  // ---------- Navigation ----------

  function shiftPeriod(
    delta
  ) {
    periodRef.setMonth(
      periodRef.getMonth() +
      delta
    );

    renderCalendar();

    SPSalary.render();

    SPReports.render();
  }

  function gotoToday() {
    periodRef =
      new Date();

    renderCalendar();

    SPSalary.render();

    SPReports.render();

    SPUtils.toast(
      t('calendar.goto_cycle'),
      'info'
    );
  }

  function getPeriodRef() {
    return periodRef;
  }

  function setPeriodRef(d) {
    periodRef = d;
  }

  // ---------- Init ----------

  function init() {
    // Event wiring only. Rendering is deferred until after the first paint
    // so opening the app stays responsive on mobile devices.
    $('#prevBtn')
      .addEventListener(
        'click',
        SPUtils.onClickOnce(
          () =>
            shiftPeriod(-1)
        )
      );

    $('#nextBtn')
      .addEventListener(
        'click',
        SPUtils.onClickOnce(
          () =>
            shiftPeriod(1)
        )
      );

    $('#todayBtn')
      .addEventListener(
        'click',
        gotoToday
      );

    $('#clearSelectBtn')
      .addEventListener(
        'click',
        clearSelection
      );

    $('#applyShiftToSelected')
      .addEventListener(
        'click',
        applyShiftToSelected
      );

    $('#clearSelected')
      .addEventListener(
        'click',
        clearSelected
      );
  }

  // ---------- Public API ----------

  global.SPCalendar = {
    init,
    renderCalendar,
    renderLegend,
    getPayPeriod,
    computeEntryHours,
    shiftPeriod,
    gotoToday,
    getPeriodRef,
    setPeriodRef,
    clearSelection,

    getOfficialHoliday,
    getSpecialDate,
    isOfficialHoliday,
    isRamadanStart
  };

})(window);