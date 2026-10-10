/* ShiftPro - iCal Export (.ics)
   تصدير كل الورديات كأحداث مستقلة في ملف .ics واحد.
   يفتح في Google Calendar / Apple Calendar / Outlook.

   exposes: window.SPiCal
*/
(function (global) {
  'use strict';

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // ----------_escape النصوص لـ iCal ----------
  function escapeICal(text) {
    if (text == null) return '';
    return String(text)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  // ---------- تحويل تاريخ ليوم لـ YYYYMMDD ----------
  function dateToICalDate(dstr) {
    return dstr.replace(/-/g, ''); // 2025-06-15 -> 20250615
  }

  // ---------- توليد DTSTART وDTEND ----------
  // shift: { startTime: '07:00', endTime: '19:00', hours: 12 }
  // لو نفس الوقت (start=end) → 24 ساعة
  function buildDateTimeRange(dateStr, shift) {
    const dayStr = dateToICalDate(dateStr);
    // لو مفيش وقت → حدث لكل اليوم
    if (!shift || !shift.startTime || !shift.endTime) {
      return {
        start: dayStr,
        end: dayStr, // نفس اليوم (all-day event)
        isAllDay: true
      };
    }
    const startHHMM = shift.startTime.replace(':', '') + '00';
    // احسب تاريخ النهاية: لو endTime <= startTime → في اليوم التالي
    let endDate = dateStr;
    const startM = SPUtils.timeToMin(shift.startTime);
    const endM = SPUtils.timeToMin(shift.endTime);
    if (endM <= startM) {
      // في اليوم التالي
      const d = SPUtils.parseDate(dateStr);
      d.setDate(d.getDate() + 1);
      endDate = SPUtils.fmtDate(d);
    }
    const endDayStr = dateToICalDate(endDate);
    const endHHMM = shift.endTime.replace(':', '') + '00';
    return {
      start: dayStr + 'T' + startHHMM,
      end: endDayStr + 'T' + endHHMM,
      isAllDay: false
    };
  }

  // ---------- توليد UID فريد لكل event ----------
  function makeUID(dstr, code) {
    return dstr.replace(/-/g, '') + '-' + (code || 'X') + '@shiftpro.local';
  }

  // ---------- إنشاء سلسلة VEVENT ----------
  function buildEvent(dstr, shift) {
    if (!shift) return '';
    const range = buildDateTimeRange(dstr, shift);
    const uid = makeUID(dstr, shift.code);
    const summary = escapeICal(shift.name + ' (' + (shift.code || '') + ')');
    const description = escapeICal(
      'ShiftPro\n' +
      (shift.startTime ? 'From: ' + shift.startTime + '\n' : '') +
      (shift.endTime ? 'To: ' + shift.endTime + '\n' : '') +
      (shift.hours ? 'Hours: ' + shift.hours : '')
    );

    let event = 'BEGIN:VEVENT\n';
    event += 'UID:' + uid + '\n';
    event += 'DTSTAMP:' + range.start.replace(/[-:]/g, '').replace('T', 'T') + 'Z\n';
    if (range.isAllDay) {
      // all-day: DTSTART;VALUE=DATE:YYYYMMDD
      event += 'DTSTART;VALUE=DATE:' + range.start + '\n';
      // DTEND هي اليوم التالي للـ all-day (iCal معيار: end غير شامل)
      const d = SPUtils.parseDate(dstr);
      d.setDate(d.getDate() + 1);
      event += 'DTEND;VALUE=DATE:' + dateToICalDate(SPUtils.fmtDate(d)) + '\n';
    } else {
      // timed event: مع TZID
      event += 'DTSTART:' + range.start + '\n';
      event += 'DTEND:' + range.end + '\n';
    }
    event += 'SUMMARY:' + summary + '\n';
    event += 'DESCRIPTION:' + description + '\n';
    // لون مميز لكل وردية (Google Calendar بيدعم CATEGORIES)
    if (shift.color) {
      event += 'CATEGORIES:' + shift.name + '\n';
    }
    event += 'END:VEVENT\n';
    return event;
  }

  // ---------- التصدير ----------
  function exportICS() {
    if (!global.SPStorage || !global.SPUtils) return null;
    const schedule = SPStorage.getSchedule() || {};
    const shifts = SPStorage.getShifts() || [];
    const dates = Object.keys(schedule).sort();

    if (dates.length === 0) {
      if (global.SPUtils && SPUtils.toast) {
        SPUtils.toast(t('msg.no_data_export'), 'warning');
      }
      return null;
    }

    // رأس الملف
    let ical = '';
    ical += 'BEGIN:VCALENDAR\n';
    ical += 'VERSION:2.0\n';
    ical += 'PRODID:-//ShiftPro//ShiftPro v2.0//EN\n';
    ical += 'CALSCALE:GREGORIAN\n';
    ical += 'METHOD:PUBLISH\n';
    ical += 'X-WR-CALNAME:ShiftPro\n';
    ical += 'X-WR-TIMEZONE:' + (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') + '\n';

    // الأحداث
    let count = 0;
    dates.forEach((dstr) => {
      const code = schedule[dstr];
      if (!code) return;
      const shift = shifts.find((s) => s.code === code);
      if (!shift) return;
      ical += buildEvent(dstr, shift);
      count++;
    });

    // تذييل
    ical += 'END:VCALENDAR\n';

    // wrap lines at 75 chars (iCal معيار)
    ical = wrapLines(ical);

    // Blob + download
    const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8;' });
    const filename = 'shiftpro-shifts-' + new Date().toISOString().slice(0, 10) + '.ics';
    if (SPUtils.downloadBlob) SPUtils.downloadBlob(filename, blob);
    if (global.SPUtils && SPUtils.toast) {
      SPUtils.toast((window.SPi18n && SPi18n.getLocale() === 'ar')
        ? 'تم تصدير ' + count + ' وردية'
        : 'Exported ' + count + ' shifts', 'success');
    }
    return { filename, count };
  }

  // ---------- تقطيع الأسطر لـ 75 حرف (iCal spec) ----------
  function wrapLines(text) {
    const MAX = 75;
    return text.split('\n').map((line) => {
      if (line.length <= MAX) return line;
      const chunks = [];
      let i = 0;
      while (i < line.length) {
        const chunk = line.slice(i, i + MAX - 1); // -1 للـ space prefix
        chunks.push(i === 0 ? chunk : ' ' + chunk);
        i += MAX - 1;
      }
      return chunks.join('\n');
    }).join('\n');
  }

  global.SPiCal = {
    exportICS,
    buildEvent,
    escapeICal,
    dateToICalDate,
    buildDateTimeRange
  };
})(window);
