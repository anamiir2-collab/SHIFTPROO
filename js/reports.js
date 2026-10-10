/* ShiftPro - Reports Module
   Renders report table, summary stats, donut + bar charts.
   Exports CSV, JSON, and Print/PDF.
   Exposes: window.SPReports
*/
(function (global) {
  'use strict';

  const { $, el, fmtDate, parseDate, addDays, fmtNum, fmtCurrency, fmtHours,
    monthNamesAr, weekdayShortAr, fmtTime12, toast, onClickOnce, downloadBlob } = SPUtils;
  const storage = SPStorage;

  let currentRange = 'cycle'; // daily | weekly | cycle | custom
  let customStart = null;
  let customEnd = null;
  let selectedExportFormat = 'xlsx'; // from the export menu

  function t(key, vars) {
    return global.SPi18n ? global.SPi18n.t(key, vars) : key;
  }

  function monthName(i) {
    return global.SPi18n ? global.SPi18n.getMonthName(i) : monthNamesAr[i];
  }

  function weekdayShort(date) {
    const i = date.getDay();
    return global.SPi18n ? global.SPi18n.getWeekdayShort(i) : weekdayShortAr[i];
  }

  // حالة اليوم في التقرير — تشمل الإجازة الرسمية كنوع مستقل
  function dayStatusLabel(detail) {
    if (detail.entry) {
      return (global.SPAttendance && SPAttendance.statusLabel)
        ? SPAttendance.statusLabel(detail.entry.status)
        : detail.entry.status;
    }
    if (detail.isAutoHoliday) {
      return t('dashboard.stats_holiday');
    }
    if (detail.officialHoliday) {
      return t('dashboard.stats_holiday');
    }
    return t('status.unrecorded');
  }

  function getReportRange() {
    const periodRef = SPCalendar.getPeriodRef();
    if (currentRange === 'cycle') {
      return SPCalendar.getPayPeriod(periodRef);
    }
    if (currentRange === 'daily') {
      const today = new Date();
      return { start: today, end: today };
    }
    if (currentRange === 'weekly') {
      const today = new Date();
      const start = addDays(today, -6);
      return { start, end: today };
    }
    if (currentRange === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return SPCalendar.getPayPeriod(periodRef);
  }

  function render() {
    const { start, end } = getReportRange();
    $('#reportPeriodLabel').textContent =
      `${start.getDate()} ${monthName(start.getMonth())} — ${end.getDate()} ${monthName(end.getMonth())} ${end.getFullYear()}`;

    // Use salary computation for accurate numbers
    const result = SPSalary.computeSalary(start, end);

    // Summary cards
    $('#rWorkDays').textContent = result.counts.A + result.counts.X;
    $('#rPresent').textContent = result.counts.A;
    $('#rAbsent').textContent = result.counts.B;
    $('#rLeave').textContent = result.counts.L;
    $('#rDouble').textContent = result.counts.X;
    $('#rTotalHours').textContent = fmtNum(result.totalHours, 1);

    // Donut chart
    renderDonut(result.counts);

    // Bar chart — hours per day
    renderBarChart(result.dailyDetails);

    // Table
    renderTable(result.dailyDetails);

    // New collapsible panels (absence / salary / stats)
    renderAbsencePanel(result);
    renderSalaryPanel(result);
    renderStatsPanel(result, start, end);

    // Print header
    $('#printPeriod').textContent =
      `${t('reports.period')}: ${fmtDate(start)} ${t('common.to')} ${fmtDate(end)}`;
    $('#printWorker').textContent =
      `${t('reports.employee')}: ${workerDisplayName()}`;

    // Interactive charts (Chart.js) — only refresh when its accordion is open
    if (window.SPCharts && document.querySelector('.report-disclosure.open[data-report-panel="months"], .report-disclosure.open[data-report-panel="overtime"]')) {
      try { renderInteractiveCharts(); } catch (e) { console.error('[Reports] charts error', e); }
    }
  }

  function workerDisplayName() {
    const nm = ((storage.getSettings() || {}).name || '').trim();
    if (nm && nm !== 'موظف') return nm;
    return t('dashboard.default_name');
  }

  // ---------- Panel: الغياب والإجازات ----------
  function renderAbsencePanel(result) {
    const body = $('#absencePanelBody');
    if (!body) return;
    body.innerHTML = '';

    const rows = [
      { label: t('reports.absent_days_stat'), value: String(result.counts.B || 0), cls: 'danger' },
      { label: t('reports.leave_days_stat'), value: String(result.counts.L || 0), cls: 'warning' },
      { label: t('reports.paid_leave_h'), value: fmtNum(result.paidLeaveHours || 0, 1), cls: 'success' },
      { label: t('reports.unpaid_leave_h'), value: fmtNum(result.unpaidLeaveHours || 0, 1), cls: '' },
      { label: t('reports.holiday_days'), value: String(result.counts.H || 0), cls: 'accent' },
      { label: t('reports.late_stat'), value: String(result.lateTotal || 0), cls: 'warning' },
      { label: t('reports.early_stat'), value: String(result.earlyTotal || 0), cls: 'danger' }
    ];

    rows.forEach((r) => {
      body.appendChild(el('div', { class: 'report-row' }, [
        el('span', { class: 'r-label' }, [r.label]),
        el('span', { class: 'r-value ' + r.cls }, [r.value])
      ]));
    });
  }

  // ---------- Panel: الراتب ----------
  function renderSalaryPanel(result) {
    const body = $('#salaryPanelBody');
    if (!body) return;
    body.innerHTML = '';

    const rows = [
      { label: t('reports.total_hours'), value: fmtHours(result.totalHours || 0), cls: 'accent' },
      { label: t('salarypage.base_hours'), value: fmtHours(result.baseHours || 0), cls: '' },
      { label: t('reports.total_overtime'), value: fmtHours(result.overtimeHours || 0), cls: 'success' },
      { label: t('reports.total_additions'), value: fmtCurrency(result.bonus || 0), cls: 'success' },
      { label: t('salarypage.plus_allowance'), value: fmtCurrency(result.allowance || 0), cls: 'success' },
      { label: t('salarypage.minus_deductions'), value: fmtCurrency((result.deduction || 0) + (result.absenceDeduction || 0) + (result.lateDeduction || 0)), cls: 'danger' },
      { label: t('salarypage.minus_advances'), value: fmtCurrency(result.advance || 0), cls: 'danger' }
    ];

    rows.forEach((r) => {
      body.appendChild(el('div', { class: 'report-row' }, [
        el('span', { class: 'r-label' }, [r.label]),
        el('span', { class: 'r-value ' + r.cls }, [r.value])
      ]));
    });

    body.appendChild(el('div', { class: 'report-row total' }, [
      el('span', { class: 'r-label fw-bold' }, [t('reports.net_salary')]),
      el('span', { class: 'r-value success fs-lg' }, [fmtCurrency(result.netSalary || 0)])
    ]));
  }

  // ---------- Panel: الإحصائيات ----------
  function renderStatsPanel(result, start, end) {
    const body = $('#statsPanelBody');
    if (!body) return;
    body.innerHTML = '';

    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const avgHours = (result.totalHours || 0) / totalDays;
    const denom = Math.max(1, (result.counts.A || 0) + (result.counts.X || 0) + (result.counts.B || 0));
    const pct = ((result.counts.A || 0) + (result.counts.X || 0)) > 0
      ? Math.round(((result.counts.A || 0) + (result.counts.X || 0)) / denom * 100)
      : 0;

    const rows = [
      { label: t('reports.avg_per_day'), value: fmtNum(avgHours, 1), cls: 'accent' },
      { label: t('reports.present_pct'), value: pct + '%', cls: pct >= 80 ? 'success' : 'warning' },
      { label: t('reports.work'), value: String((result.counts.A || 0) + (result.counts.X || 0)), cls: 'success' },
      { label: t('reports.holiday_days'), value: String(result.counts.H || 0), cls: 'accent' },
      { label: t('stats.gross'), value: fmtCurrency(result.grossSalary || 0), cls: 'accent' }
    ];

    rows.forEach((r) => {
      body.appendChild(el('div', { class: 'report-row' }, [
        el('span', { class: 'r-label' }, [r.label]),
        el('span', { class: 'r-value ' + r.cls }, [r.value])
      ]));
    });
  }

  // رسم الـ charts التفاعلية
  async function renderInteractiveCharts() {
    const isAr = (window.SPi18n && SPi18n.getLocale() === 'ar');
    const monthly = SPCharts.getMonthlyData(6);
    if (monthly.length === 0) return;

    // بطاقات نسبة التغيّر (آخر شهر مقابل اللي قبله)
    const cardRow = $('#changeCardRow');
    if (cardRow) {
      cardRow.innerHTML = '';
      const last = monthly[monthly.length - 1];
      const prev = monthly[monthly.length - 2] || last;
      cardRow.appendChild(SPCharts.buildChangeCard(prev.hours, last.hours, isAr ? 'ساعات' : 'Hours'));
      cardRow.appendChild(SPCharts.buildChangeCard(prev.overtime, last.overtime, isAr ? 'إضافي' : 'Overtime'));
      cardRow.appendChild(SPCharts.buildChangeCard(prev.salary, last.salary, isAr ? 'الراتب' : 'Salary'));
    }

    // رسم مقارنة الأشهر
    await SPCharts.renderMonthComparison('monthComparisonChart', monthly);

    // رسم اتجاه الإضافي
    await SPCharts.renderOvertimeTrend(
      'overtimeTrendChart',
      monthly.map((m) => m.label),
      monthly.map((m) => m.overtime)
    );
  }

  function renderDonut(counts) {
    const segments = $('#donutSegments');
    segments.innerHTML = '';
    const total = counts.A + counts.X + counts.L + counts.B + (counts.H || 0);
    $('#donutCenterVal').textContent = total;
    if (total === 0) {
      $('#donutLegend').innerHTML = '<div class="muted fs-sm">' + t('reports.no_data_donut') + '</div>';
      return;
    }
    const items = [
      { label: t('dashboard.stats_present'), value: counts.A, color: '#22c55e' },
      { label: t('dashboard.stats_double'), value: counts.X, color: '#a855f7' },
      { label: t('dashboard.stats_leave'), value: counts.L, color: '#f59e0b' },
      { label: t('dashboard.stats_absent'), value: counts.B, color: '#ef4444' },
      { label: t('dashboard.stats_holiday'), value: counts.H || 0, color: '#38bdf8' }
    ];
    const r = 48, cx = 60, cy = 60;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    items.forEach((it) => {
      if (it.value === 0) return;
      const len = (it.value / total) * circumference;
      const circle = el('circle', {
        cx, cy, r,
        fill: 'none',
        stroke: it.color,
        'stroke-width': 14,
        'stroke-dasharray': `${len} ${circumference - len}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${cx} ${cy})`
      });
      segments.appendChild(circle);
      offset += len;
    });
    // Legend
    const legend = $('#donutLegend');
    legend.innerHTML = '';
    items.forEach((it) => {
      const row = el('div', { class: 'item' });
      row.appendChild(el('span', { class: 'dot', style: `background:${it.color}` }));
      row.appendChild(el('span', {}, [it.label]));
      row.appendChild(el('span', { class: 'v' }, [String(it.value)]));
      legend.appendChild(row);
    });
  }

  function renderBarChart(dailyDetails) {
    const chart = $('#hoursBarChart');
    chart.innerHTML = '';
    if (!dailyDetails || dailyDetails.length === 0) {
      chart.appendChild(el('div', { class: 'muted fs-sm', style: 'margin:auto;text-align:center;' }, [t('reports.no_data_donut')]));
      return;
    }
    // Limit to last 14 days for readability
    const items = dailyDetails.slice(-14);
    const maxHours = Math.max(1, ...items.map((d) => d.actual));
    // If all zeros, show empty state
    const totalActual = items.reduce((s, d) => s + d.actual, 0);
    if (totalActual === 0) {
      chart.appendChild(el('div', { class: 'muted fs-sm', style: 'margin:auto;text-align:center;' }, [t('reports.no_hours_yet')]));
      return;
    }
    items.forEach((d) => {
      const pct = (d.actual / maxHours) * 100;
      let cls = '';
      if (d.actual === 0 && d.entry && d.entry.status === 'B') cls = 'danger';
      else if (d.actual > (Number(storage.getSettings().shiftHours) || 12)) cls = 'success';
      const col = el('div', { class: 'bar-col' });
      col.appendChild(el('div', { class: 'bar-value' }, [d.actual > 0 ? fmtNum(d.actual, 1) : '']));
      col.appendChild(el('div', { class: 'bar ' + cls, style: `height:${Math.max(2, pct)}%` }));
      col.appendChild(el('div', { class: 'bar-label' }, [weekdayShort(d.date)]));
      chart.appendChild(col);
    });
  }

  function renderTable(dailyDetails) {
    const tbody = $('#reportTableBody');
    tbody.innerHTML = '';
    let totalHours = 0, totalValue = 0;
    dailyDetails.forEach((d) => {
      const tr = el('tr');
      const dayName = weekdayShort(d.date);
      const dateDisplay = `${String(d.date.getDate()).padStart(2, '0')}/${String(d.date.getMonth() + 1).padStart(2, '0')}/${d.date.getFullYear()}`;
      const scheduledCode = storage.getScheduledCode(fmtDate(d.date));
      const shift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;
      const scheduledLabel = shift ? SPUtils.shiftDisplayName(shift) : t('status.unset');
      const statusLabel = dayStatusLabel(d);
      const timeRange = (d.entry && d.entry.from && d.entry.to)
        ? `${fmtTime12(d.entry.from)} — ${fmtTime12(d.entry.to)}`
        : '-';
      tr.innerHTML = `<td>${dayName}</td><td>${dateDisplay}</td><td>${scheduledLabel}</td><td>${statusLabel}</td><td>${timeRange}</td><td>${fmtNum(d.actual, 1)}</td><td>${fmtCurrency(d.value)}</td>`;
      tbody.appendChild(tr);
      totalHours += d.actual;
      totalValue += d.value;
    });
    $('#reportTotalHours').textContent = fmtNum(totalHours, 1);
    $('#reportTotalValue').textContent = fmtCurrency(totalValue);
  }

  function getReportRows(result) {
    return (result.dailyDetails || []).map((d) => {
      const dayName = weekdayShort(d.date);
      const dateDisplay = `${String(d.date.getDate()).padStart(2, '0')}/${String(d.date.getMonth() + 1).padStart(2, '0')}/${d.date.getFullYear()}`;
      const scheduledCode = storage.getScheduledCode(fmtDate(d.date));
      const shift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;
      const scheduledLabel = shift ? SPUtils.shiftDisplayName(shift) : t('status.unset');
      const statusLabel = dayStatusLabel(d);
      return {
        day: dayName,
        date: dateDisplay,
        scheduled: scheduledLabel,
        status: statusLabel,
        from: d.entry && d.entry.from ? d.entry.from : '',
        to: d.entry && d.entry.to ? d.entry.to : '',
        hours: Number(d.actual || 0),
        overtime: Number(d.ot || 0),
        late: Number(d.late || 0),
        early: Number(d.early || 0),
        value: Number(d.value || 0),
        note: d.entry && d.entry.note ? d.entry.note : ''
      };
    });
  }

  function reportSummary(result, start, end) {
    return {
      employee: workerDisplayName(),
      from: fmtDate(start),
      to: fmtDate(end),
      workDays: (result.counts.A || 0) + (result.counts.X || 0),
      present: result.counts.A || 0,
      double: result.counts.X || 0,
      leave: result.counts.L || 0,
      absent: result.counts.B || 0,
      baseHours: Number(result.baseHours || 0),
      overtimeHours: Number(result.overtimeHours || 0),
      totalHours: Number(result.totalHours || 0),
      baseSalary: Number(result.baseSalary || 0),
      overtimeValue: Number(result.overtimeValue || 0),
      bonus: Number(result.bonus || 0),
      allowance: Number(result.allowance || 0),
      deduction: Number(result.deduction || 0),
      advance: Number(result.advance || 0),
      netSalary: Number(result.netSalary || 0)
    };
  }

  function exportReportJSON() {
    const { start, end } = getReportRange();
    const result = SPSalary.computeSalary(start, end);
    const data = { app: 'ShiftPro', type: 'report', summary: reportSummary(result, start, end), table: getReportRows(result) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    downloadBlob(`ShiftPro-Report-${fmtDate(start)}-to-${fmtDate(end)}.json`, blob);
    toast(t('reports.export_json') + ' — ' + t('msg.exported'), 'success');
  }

  async function exportReportXLSX() {
    const { start, end } = getReportRange();
    const result = SPSalary.computeSalary(start, end);
    let XLSX = global.XLSX;
    if (!XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = './vendor/xlsx.full.min.js';
        s.onload = () => global.XLSX ? resolve() : reject(new Error('XLSX not loaded'));
        s.onerror = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
          s2.onload = () => global.XLSX ? resolve() : reject(new Error('XLSX not loaded'));
          s2.onerror = () => reject(new Error('Failed to load XLSX'));
          document.head.appendChild(s2);
        };
        document.head.appendChild(s);
      });
      XLSX = global.XLSX;
    }
    const rows = getReportRows(result);
    const summary = reportSummary(result, start, end);
    const table = [[t('reports.day_col'),t('reports.date_col'),t('reports.scheduled_col'),t('reports.status_col'),t('attendance.from_label'),t('attendance.to_label'),t('reports.hours_col'),t('reports.total_overtime'),t('attendance.late_label'),t('attendance.early_label'),t('reports.value_col'),t('calendar.note_label')]];
    rows.forEach(r => table.push([r.day,r.date,r.scheduled,r.status,r.from,r.to,r.hours,r.overtime,r.late,r.early,r.value,r.note]));
    const summaryRows = [
      [t('reports.summary')],[t('reports.employee'),summary.employee],[t('reports.from_date'),summary.from],[t('reports.to_date'),summary.to],
      [t('reports.work'),summary.workDays],[t('dashboard.stats_present'),summary.present],[t('dashboard.stats_double'),summary.double],[t('dashboard.stats_leave'),summary.leave],[t('dashboard.stats_absent'),summary.absent],
      [t('salarypage.base_hours'),summary.baseHours],[t('salarypage.overtime_hours'),summary.overtimeHours],[t('reports.total_hours'),summary.totalHours],
      [t('salary.base_salary'),summary.baseSalary],[t('salarypage.plus_overtime'),summary.overtimeValue],[t('salarypage.plus_bonus'),summary.bonus],[t('salarypage.plus_allowance'),summary.allowance],
      [t('salarypage.minus_deductions'),summary.deduction],[t('salarypage.minus_advances'),summary.advance],[t('salarypage.net_due'),summary.netSalary]
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(table);
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    ws['!cols'] = [{wch:12},{wch:14},{wch:22},{wch:14},{wch:12},{wch:12},{wch:10},{wch:10},{wch:10},{wch:16},{wch:14},{wch:28}];
    wsSummary['!cols'] = [{wch:24},{wch:24}];
    XLSX.utils.book_append_sheet(wb, ws, t('reports.day_col'));
    XLSX.utils.book_append_sheet(wb, wsSummary, t('reports.summary'));
    const filename = `ShiftPro-Report-${fmtDate(start)}-to-${fmtDate(end)}.xlsx`;
    XLSX.writeFile(wb, filename);
    toast(t('export.excel') + ' — ' + t('msg.exported'), 'success');
  }

  async function exportSelectedReport() {
    // الصيغة من قائمة التصدير، مع بقاء select القديم احتياطًا إن وُجد
    const legacySel = $('#reportExportFormat');
    const format = selectedExportFormat || (legacySel ? legacySel.value : 'xlsx');
    const { start, end } = getReportRange();
    try {
      if (format === 'xlsx') return await exportReportXLSX();
      if (format === 'csv') return exportCSV();
      if (format === 'json') return exportReportJSON();
      if (format === 'pdf') {
        if (!global.SPPDF || !SPPDF.exportReportRange) throw new Error(t('msg.module_missing'));
        toast(t('export.pdf') + ' — ' + t('pwa.installing'), 'info');
        const r = await SPPDF.exportReportRange(start, end);
        if (r && r.ok) toast(t('export.pdf') + ' — ' + t('msg.exported'), 'success');
        return r;
      }
      if (format === 'ics') {
        if (!global.SPiCal) throw new Error(t('msg.module_missing'));
        return SPiCal.exportICS();
      }
      if (format === 'print') return printReport();
    } catch (e) {
      console.error('[Reports] export error', e);
      toast(t('msg.no_data_export') + ' (' + e.message + ')', 'error');
    }
  }

  // ---------- Export functions ----------
  function exportCSV() {
    const { start, end } = getReportRange();
    const result = SPSalary.computeSalary(start, end);
    const headers = [t('reports.day_col'), t('reports.date_col'), t('reports.scheduled_col'), t('reports.status_col'), t('attendance.from_label'), t('attendance.to_label'), t('reports.hours_col'), t('reports.total_overtime'), t('attendance.late_label'), t('attendance.early_label'), t('reports.value_col'), t('calendar.note_label')];
    let csv = '\uFEFF' + headers.join(',') + '\n';
    result.dailyDetails.forEach((d) => {
      const dayName = weekdayShort(d.date);
      const dateDisplay = `${String(d.date.getDate()).padStart(2, '0')}/${String(d.date.getMonth() + 1).padStart(2, '0')}/${d.date.getFullYear()}`;
      const scheduledCode = storage.getScheduledCode(fmtDate(d.date));
      const shift = scheduledCode ? storage.getShiftByCode(scheduledCode) : null;
      const scheduledLabel = shift ? SPUtils.shiftDisplayName(shift) : t('status.unset');
      const statusLabel = dayStatusLabel(d);
      const from = (d.entry && d.entry.from) ? d.entry.from : '';
      const to = (d.entry && d.entry.to) ? d.entry.to : '';
      const note = (d.entry && d.entry.note) ? d.entry.note : '';
      const row = [dayName, dateDisplay, scheduledLabel, statusLabel, from, to, fmtNum(d.actual, 2), fmtNum(d.ot, 2), d.late, d.early, Math.round(d.value), note];
      csv += row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
    });
    // Summary footer
    csv += '\n\n' + t('reports.summary') + ',,,\n';
    csv += `"${t('salarypage.base_hours')}","","","","","","${fmtNum(result.baseHours, 2)}"\n`;
    csv += `"${t('salarypage.overtime_hours')}","","","","","","${fmtNum(result.overtimeHours, 2)}"\n`;
    csv += `"${t('reports.total_hours')}","","","","","","${fmtNum(result.totalHours, 2)}"\n`;
    csv += `"${t('salary.base_salary')}","","","","","","${result.baseSalary}"\n`;
    csv += `"${t('salarypage.plus_overtime')}","","","","","","${result.overtimeValue}"\n`;
    csv += `"${t('salarypage.plus_bonus')}","","","","","","${result.bonus}"\n`;
    csv += `"${t('salarypage.plus_allowance')}","","","","","","${result.allowance}"\n`;
    csv += `"${t('salarypage.minus_deductions')}","","","","","","${result.deduction + result.absenceDeduction + result.lateDeduction}"\n`;
    csv += `"${t('salarypage.minus_advances')}","","","","","","${result.advance}"\n`;
    csv += `"${t('salarypage.net_due')}","","","","","","${result.netSalary}"\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(`ShiftPro-${fmtDate(start)}-to-${fmtDate(end)}.csv`, blob);
    toast(t('export.csv') + ' — ' + t('msg.exported'), 'success');
  }

  function exportJSON() {
    const data = storage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(`ShiftPro-Backup-${SPUtils.todayStr()}.json`, blob);
    toast(t('msg.exported'), 'success');
  }

  function printReport() {
    // Make sure the report page is visible before printing
    const wasActive = $('#page-reports').classList.contains('active');
    if (!wasActive) {
      // temporarily show reports page for printing
      document.querySelectorAll('.page').forEach((p) => p.style.display = 'none');
      $('#page-reports').style.display = 'block';
    }
    setTimeout(() => {
      window.print();
      if (!wasActive) {
        document.querySelectorAll('.page').forEach((p) => p.style.removeProperty('display'));
      }
    }, 100);
  }

  // ---------- Init ----------
  function init() {
    // إظهار وإخفاء جدول التقارير فقط، مع حفظ الاختيار على الجهاز
    const reportTableToggle = $('#toggleReportTableBtn');
    const reportTablePanel = $('#reportTableVisibilityPanel');
    if (reportTableToggle && reportTablePanel) {
      let tableVisible = true;
      try { tableVisible = localStorage.getItem('spReportTableVisible') !== 'false'; } catch (e) {}
      const updateReportTableToggle = () => {
        reportTablePanel.hidden = !tableVisible;
        reportTableToggle.setAttribute('aria-expanded', String(tableVisible));
        const isEnglish = global.SPi18n && SPi18n.getLocale() === 'en';
        reportTableToggle.textContent = isEnglish
          ? (tableVisible ? 'Hide table' : 'Show table')
          : (tableVisible ? 'إخفاء الجدول' : 'إظهار الجدول');
      };
      reportTableToggle.addEventListener('click', onClickOnce(() => {
        tableVisible = !tableVisible;
        try { localStorage.setItem('spReportTableVisible', String(tableVisible)); } catch (e) {}
        updateReportTableToggle();
      }));
      updateReportTableToggle();
      if (global.SPi18n) SPi18n.subscribe(updateReportTableToggle);
    }

    $('#prevReportBtn').addEventListener('click', onClickOnce(() => SPCalendar.shiftPeriod(-1)));
    $('#nextReportBtn').addEventListener('click', onClickOnce(() => SPCalendar.shiftPeriod(1)));
    // Legacy export buttons are optional after the new unified export menu.
    const legacyCsvBtn = $('#exportCsvBtn');
    if (legacyCsvBtn) legacyCsvBtn.addEventListener('click', onClickOnce(exportCSV));
    const legacyJsonBtn = $('#exportJsonBtn');
    if (legacyJsonBtn) legacyJsonBtn.addEventListener('click', onClickOnce(exportJSON));
    const legacyPrintBtn = $('#printBtn');
    if (legacyPrintBtn) legacyPrintBtn.addEventListener('click', onClickOnce(printReport));
    // XLSX عبر SheetJS
    const exportXlsxBtn = $('#exportXlsxBtn');
    if (exportXlsxBtn) {
      exportXlsxBtn.addEventListener('click', onClickOnce(async () => {
        if (!window.SPBackup) { toast(t('msg.module_missing'), 'error'); return; }
        toast(t('export.excel') + ' — ' + t('pwa.installing'), 'info');
        try {
          const r = await SPBackup.exportXLSX();
          if (r) toast(t('msg.exported') + ' — ' + r.filename, 'success');
        } catch (e) {
          toast(t('export.excel') + ': ' + e.message, 'error');
        }
      }));
    }
    // iCal (.ics) - يفتح في Google/Apple Calendar
    const exportIcsBtn = $('#exportIcsBtn');
    if (exportIcsBtn) {
      exportIcsBtn.addEventListener('click', onClickOnce(() => {
        if (!window.SPiCal) { toast(t('msg.module_missing'), 'error'); return; }
        try {
          const r = SPiCal.exportICS();
          // toast بيحصل جوّه
        } catch (e) {
          toast(t('export.ics') + ': ' + e.message, 'error');
        }
      }));
    }
    // تصدير PDF احترافي
    const exportPdfBtn = $('#exportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', onClickOnce(async () => {
        if (!window.SPPDF) { toast(t('msg.module_missing'), 'error'); return; }
        const today = new Date();
        toast(t('export.pdf') + ' — ' + t('pwa.installing'), 'info');
        try {
          const result = await SPPDF.exportMonthlyReport(today.getFullYear(), today.getMonth());
          if (result.ok) toast(t('msg.exported') + ' — ' + result.filename, 'success');
          else toast(t('export.pdf') + ': ' + t('msg.no_data_export'), 'error');
        } catch (e) {
          toast(t('export.pdf') + ': ' + e.message, 'error');
        }
      }));
    }

    // Report accordions
    document.querySelectorAll('[data-report-panel]').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const panel = trigger.dataset.reportPanel;
        const section = trigger.closest('.report-disclosure');
        const content = $('#reportPanel-' + panel);
        const willOpen = !!content && content.hidden;
        document.querySelectorAll('.report-disclosure').forEach((s) => s.classList.remove('open'));
        document.querySelectorAll('.report-disclosure-content').forEach((el) => { el.hidden = true; });
        document.querySelectorAll('[data-report-panel]').forEach((t) => t.setAttribute('aria-expanded', 'false'));
        if (willOpen && content) {
          content.hidden = false;
          section.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          if (panel === 'months' || panel === 'overtime') {
            setTimeout(() => { renderInteractiveCharts().catch(() => {}); }, 40);
          }
        }
      });
    });

    const reportExportBtn = $('#reportExportBtn');
    if (reportExportBtn) reportExportBtn.addEventListener('click', onClickOnce(exportSelectedReport));

    // ====== Export menu (disclosure) — يعيد استخدام دوال التصدير القائمة ======
    const exportMenuTrigger = $('#exportMenuTrigger');
    const exportMenuPanel = $('#exportMenuPanel');
    if (exportMenuTrigger && exportMenuPanel) {
      exportMenuTrigger.addEventListener('click', () => {
        const willOpen = exportMenuPanel.hidden;
        exportMenuPanel.hidden = !willOpen;
        exportMenuTrigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        exportMenuTrigger.closest('.report-disclosure').classList.toggle('open', willOpen);
      });
    }
    document.querySelectorAll('[data-export-format]').forEach((btn) => {
      btn.addEventListener('click', onClickOnce(() => {
        selectedExportFormat = btn.dataset.exportFormat;
        // إغلاق القائمة بعد الاختيار
        if (exportMenuPanel) {
          exportMenuPanel.hidden = true;
          const trig = $('#exportMenuTrigger');
          if (trig) trig.setAttribute('aria-expanded', 'false');
          const disc = btn.closest('.report-disclosure');
          if (disc) disc.classList.remove('open');
        }
        exportSelectedReport();
      }));
    });

    // Range tabs
    document.querySelectorAll('[data-report-range]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-report-range]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = btn.dataset.reportRange;
        $('#customRangeCard').hidden = currentRange !== 'custom';
        render();
      });
    });

    $('#applyCustomRange').addEventListener('click', () => {
      const from = $('#customFrom').value;
      const to = $('#customTo').value;
      if (!from || !to) { toast(t('msg.need_from_to'), 'warning'); return; }
      customStart = parseDate(from);
      customEnd = parseDate(to);
      if (customStart > customEnd) {
        toast(t('msg.start_before_end'), 'warning');
        return;
      }
      render();
      toast(t('msg.custom_applied'), 'success');
    });
  }

  global.SPReports = {
    init, render, exportCSV, exportJSON, exportReportXLSX, exportReportJSON, exportSelectedReport
  };
})(window);
