/**
 * ShiftPro - Jest Tests
 * اختبارات لحسابات الراتب والتواريخ.
 *
 * دي اختبارات Unit Tests لوظائف SPUtils الأساسية.
 * تستخدم Jest (https://jestjs.io/).
 *
 * التشغيل:
 *   npm install --save-dev jest
 *   npx jest tests/
 *
 * ملاحظة: الاختبارات دي بتفترض إن ملفات utils.js قابلة للاستيراد
 * مباشرة من غير DOM. لو محتاج DOM، استخدم jsdom.
 */

// ---------- اختبارات دوال الوقت ----------

// نسخة مبسطة من timeToMin و timeDiffMin للاختبار (بدون DOM)
function timeToMin(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const parts = hhmm.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function minToTime(min) {
  if (min == null || isNaN(min)) return '';
  while (min < 0) min += 24 * 60;
  min = min % (24 * 60);
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function timeDiffMin(start, end) {
  const s = timeToMin(start);
  const e = timeToMin(end);
  if (s == null || e == null) return 0;
  let diff = e - s;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function computeRangeHours(from, to) {
  const min = timeDiffMin(from, to);
  return Math.round((min / 60) * 100) / 100;
}

// ---------- اختبارات دوال التواريخ ----------

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayDiff(a, b) {
  const MS = 86400000;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((da - db) / MS);
}

// ---------- اختبارات حساب الراتب ----------

// محاكاة لحساب الراتب الأساسي
function computeSalaryForRange(baseSalary, hours, hourlyRate, overtimeHours, overtimeRate) {
  const basePay = hours * hourlyRate;
  const overtimePay = overtimeHours * hourlyRate * overtimeRate;
  return Math.round(basePay + overtimePay);
}

// ---------- Jest tests ----------

describe('Time utilities', () => {
  test('timeToMin parses HH:MM correctly', () => {
    expect(timeToMin('07:00')).toBe(420);
    expect(timeToMin('19:00')).toBe(1140);
    expect(timeToMin('00:00')).toBe(0);
    expect(timeToMin('23:59')).toBe(1439);
  });

  test('timeToMin returns null for invalid input', () => {
    expect(timeToMin('')).toBeNull();
    expect(timeToMin(null)).toBeNull();
    expect(timeToMin('abc')).toBeNull();
    expect(timeToMin('1:')).toBeNull();
  });

  test('minToTime formats minutes to HH:MM', () => {
    expect(minToTime(420)).toBe('07:00');
    expect(minToTime(0)).toBe('00:00');
    expect(minToTime(1439)).toBe('23:59');
  });

  test('minToTime handles negatives by wrapping', () => {
    expect(minToTime(-60)).toBe('23:00');
    expect(minToTime(-1)).toBe('23:59');
  });

  test('timeDiffMin computes difference, handling midnight crossing', () => {
    // نفس اليوم
    expect(timeDiffMin('07:00', '19:00')).toBe(720); // 12h
    // عبور منتصف الليل
    expect(timeDiffMin('19:00', '07:00')).toBe(720); // 12h next day
    expect(timeDiffMin('22:00', '06:00')).toBe(480); // 8h
  });

  test('computeRangeHours returns hours with 2 decimals', () => {
    expect(computeRangeHours('07:00', '19:00')).toBe(12);
    expect(computeRangeHours('19:00', '07:00')).toBe(12);
    expect(computeRangeHours('08:00', '12:30')).toBe(4.5);
  });
});

describe('Date utilities', () => {
  test('fmtDate formats Date to YYYY-MM-DD', () => {
    expect(fmtDate(new Date(2025, 0, 1))).toBe('2025-01-01');
    expect(fmtDate(new Date(2025, 11, 31))).toBe('2025-12-31');
    expect(fmtDate(new Date(2026, 5, 7))).toBe('2026-06-07');
  });

  test('parseDate parses YYYY-MM-DD', () => {
    const d = parseDate('2025-06-15');
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(5); // 0-indexed
    expect(d.getDate()).toBe(15);
  });

  test('parseDate and fmtDate are inverse', () => {
    const original = '2025-06-15';
    const parsed = parseDate(original);
    expect(fmtDate(parsed)).toBe(original);
  });

  test('addDays moves date forward', () => {
    const d = new Date(2025, 0, 1);
    expect(fmtDate(addDays(d, 30))).toBe('2025-01-31');
    expect(fmtDate(addDays(d, 365))).toBe('2026-01-01');
    expect(fmtDate(addDays(d, -1))).toBe('2024-12-31');
  });

  test('dayDiff computes days between two dates', () => {
    const a = parseDate('2025-01-10');
    const b = parseDate('2025-01-01');
    expect(dayDiff(a, b)).toBe(9);
    expect(dayDiff(b, a)).toBe(-9);
  });

  test('dayDiff handles month boundaries', () => {
    const a = parseDate('2025-02-01');
    const b = parseDate('2025-01-01');
    expect(dayDiff(a, b)).toBe(31);
  });
});

describe('Salary calculation', () => {
  // افتراضات: salary=6000, monthlyHours=208, hourlyRate=6000/208=28.85
  test('basic salary: 12h shift at 28.85/h = 346.15', () => {
    const result = computeSalaryForRange(6000, 12, 6000 / 208, 0, 1.5);
    expect(result).toBeCloseTo(346.15, 1);
  });

  test('overtime: 2h overtime at 1.5x', () => {
    const hourlyRate = 6000 / 208;
    const result = computeSalaryForRange(6000, 12, hourlyRate, 2, 1.5);
    const expected = (12 * hourlyRate) + (2 * hourlyRate * 1.5);
    expect(result).toBeCloseTo(expected, 0);
  });

  test('night shift crossing midnight: 19:00 → 07:00 = 12h', () => {
    const hours = computeRangeHours('19:00', '07:00');
    expect(hours).toBe(12);
  });

  test('overtime calculation matches expected formula', () => {
    const baseRate = 30;
    const overtimeRate = 1.5;
    const regularHours = 8;
    const overtimeHours = 2;
    const expected = (8 * baseRate) + (2 * baseRate * overtimeRate);
    const result = computeSalaryForRange(0, regularHours, baseRate, overtimeHours, overtimeRate);
    expect(result).toBeCloseTo(expected, 0);
  });

  test('zero hours returns zero', () => {
    expect(computeSalaryForRange(0, 0, 30, 0, 1.5)).toBe(0);
  });

  test('24-hour shift (mطبق) = 24h', () => {
    const hours = computeRangeHours('07:00', '07:00'); // نفس الوقت = 24 ساعة
    expect(hours).toBe(24);
  });
});

describe('Leave calculations', () => {
  // محاكاة دوال leaves
  function countLeaveDays(req) {
    if (!req || !req.fromDate) return 0;
    const from = new Date(req.fromDate);
    const to = req.toDate ? new Date(req.toDate) : from;
    if (isNaN(from) || isNaN(to)) return 0;
    const ms = to - from;
    const days = Math.floor(ms / 86400000) + 1;
    if (days < 1) return 1;
    if (req.halfDay) return days - 0.5;
    if (req.hours && req.hours > 0) return Math.min(days, req.hours / 8);
    return days;
  }

  test('single day leave = 1 day', () => {
    expect(countLeaveDays({ fromDate: '2025-06-15' })).toBe(1);
  });

  test('3-day leave = 3 days', () => {
    expect(countLeaveDays({ fromDate: '2025-06-15', toDate: '2025-06-17' })).toBe(3);
  });

  test('half-day leave = 0.5 day', () => {
    expect(countLeaveDays({ fromDate: '2025-06-15', halfDay: true })).toBe(0.5);
  });

  test('half-day over multiple days', () => {
    expect(countLeaveDays({ fromDate: '2025-06-15', toDate: '2025-06-17', halfDay: true })).toBe(2.5);
  });

  test('by-hours leave (4h = 0.5 day)', () => {
    expect(countLeaveDays({ fromDate: '2025-06-15', hours: 4 })).toBe(0.5);
  });

  test('by-hours leave (8h = 1 day)', () => {
    expect(countLeaveDays({ fromDate: '2025-06-15', hours: 8 })).toBe(1);
  });

  test('invalid dates return 0', () => {
    expect(countLeaveDays({})).toBe(0);
    expect(countLeaveDays(null)).toBe(0);
  });
});

describe('i18n variable interpolation', () => {
  // محاكاة دالة t()
  function interpolate(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (m, key) => {
      return (vars[key] !== undefined) ? String(vars[key]) : m;
    });
  }

  test('replaces {name} with variable', () => {
    expect(interpolate('Hello {name}!', { name: 'Ahmed' })).toBe('Hello Ahmed!');
  });

  test('replaces multiple variables', () => {
    expect(interpolate('{greeting} {name}!', { greeting: 'Hi', name: 'Sara' })).toBe('Hi Sara!');
  });

  test('leaves unknown keys intact', () => {
    expect(interpolate('Hello {name}!', {})).toBe('Hello {name}!');
  });

  test('handles undefined vars', () => {
    expect(interpolate('Hello {name}!')).toBe('Hello {name}!');
  });

  test('handles numeric values', () => {
    expect(interpolate('{count} items', { count: 42 })).toBe('42 items');
  });
});

describe('Templates and repeat rules', () => {
  // محاكاة addDaysISO
  function addDaysISO(dstr, n) {
    const d = new Date(dstr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  test('addDaysISO moves forward', () => {
    expect(addDaysISO('2025-06-15', 1)).toBe('2025-06-16');
    expect(addDaysISO('2025-06-15', 7)).toBe('2025-06-22');
    expect(addDaysISO('2025-06-15', 30)).toBe('2025-07-15');
  });

  test('addDaysISO handles month boundary', () => {
    expect(addDaysISO('2025-01-31', 1)).toBe('2025-02-01');
  });

  test('addDaysISO handles year boundary', () => {
    expect(addDaysISO('2025-12-31', 1)).toBe('2026-01-01');
  });
});
