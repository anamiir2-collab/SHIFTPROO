/* ShiftPro - PDF Export Module
   تصدير تقارير شهرية كاملة كـ PDF عبر jsPDF + html2canvas (محلي بالكامل).
   - زر "تصدير تقرير الشهر" → PDF جاهز للمشاركة
   - يشمل: ملخص الورديات، الإضافي، الخصومات، الإجازات، صافي الراتب
   - الإيصال يتبع اللغة المختارة (AR/EN)

   exposes: window.SPPDF
*/
(function (global) {
  'use strict';

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  // ---------- تحميل jsPDF + html2canvas ديناميكيًا (محليًا) ----------
  // محاولة تحميل من ملفات محلية، fallback لـ CDN لو موجودة
  let _jspdfPromise = null;
  function loadJsPDF() {
    if (_jspdfPromise) return _jspdfPromise;
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf.jsPDF);
    _jspdfPromise = new Promise((resolve, reject) => {
      // محاولة محلية أولًا
      const localPath = './vendor/jspdf.umd.min.js';
      const s = document.createElement('script');
      s.src = localPath;
      s.onload = () => {
        if (global.jspdf && global.jspdf.jsPDF) resolve(global.jspdf.jsPDF);
        else reject(new Error('jsPDF not loaded'));
      };
      s.onerror = () => {
        // fallback لـ CDN
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        s2.onload = () => {
          if (global.jspdf && global.jspdf.jsPDF) resolve(global.jspdf.jsPDF);
          else reject(new Error('jsPDF not loaded'));
        };
        s2.onerror = () => reject(new Error('Failed to load jsPDF'));
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    return _jspdfPromise;
  }

  let _html2canvasPromise = null;
  function loadHtml2canvas() {
    if (_html2canvasPromise) return _html2canvasPromise;
    if (global.html2canvas) return Promise.resolve(global.html2canvas);
    _html2canvasPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = './vendor/html2canvas.min.js';
      s.onload = () => {
        if (global.html2canvas) resolve(global.html2canvas);
        else reject(new Error('html2canvas not loaded'));
      };
      s.onerror = () => {
        // fallback لـ CDN
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        s2.onload = () => {
          if (global.html2canvas) resolve(global.html2canvas);
          else reject(new Error('html2canvas not loaded'));
        };
        s2.onerror = () => reject(new Error('Failed to load html2canvas'));
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    return _html2canvasPromise;
  }

  // ---------- تنسيق للأرقام والعملة ----------
  function fmtNum(n) {
    return global.SPi18n ? SPi18n.formatNumber(n) : String(n);
  }
  function fmtCurrency(n) {
    return global.SPi18n ? SPi18n.formatCurrency(n) : (Number(n).toLocaleString('en-US') + ' EGP');
  }

  // ---------- توليد تقرير شهري PDF ----------
  // year, month (0-11)
  async function exportMonthlyReport(year, month, rangeStart, rangeEnd) {
    if (!global.SPStorage || !global.SPSalary) {
      throw new Error('Required modules not loaded');
    }
    const { $, el, fmtDate, parseDate } = SPUtils;
    const settings = SPStorage.getSettings();
    const startDate = rangeStart instanceof Date ? new Date(rangeStart) : new Date(year, month, 1);
    const endDate = rangeEnd instanceof Date ? new Date(rangeEnd) : new Date(year, month + 1, 0);
    const start = fmtDate(startDate);
    const end = fmtDate(endDate);
    const result = SPSalary.computeSalary(startDate, endDate);

    // قائمة الإجازات المقبولة في الشهر
    let leaves = [];
    if (global.SPLeaves) {
      leaves = SPLeaves.getApprovedInRange(start, end);
    }

    // ---------- إنشاء عنصر HTML مؤقت ----------
    const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');
    const dir = isAr ? 'rtl' : 'ltr';
    const lang = isAr ? 'ar' : 'en';

    const reportNode = el('div', {
      style: 'background:#fff;color:#0d1f35;font-family:Cairo,"IBM Plex Sans Arabic","Noto Sans Arabic",Tahoma,Arial,sans-serif;padding:30px;width:794px;min-height:1123px;direction:' + dir + ';text-align:' + (isAr ? 'right' : 'left') + ';line-height:1.75;overflow-wrap:anywhere;box-sizing:border-box;',
      lang: lang,
      dir: dir
    });

    // رأس التقرير
    reportNode.appendChild(el('div', {
      style: 'border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:start;'
    }, [
      el('div', {}, [
        el('h1', { style: 'margin:0 0 6px;font-size:24px;color:#2563eb;' }, ['ShiftPro']),
        el('p', { style: 'margin:0;font-size:13px;color:#6b7280;' }, [
          isAr ? 'تقرير شهري' : 'Monthly Report'
        ])
      ]),
      el('div', { style: 'text-align:' + (isAr ? 'left' : 'right') + ';' }, [
        el('p', { style: 'margin:0;font-size:13px;' }, [
          (isAr ? 'الموظف: ' : 'Employee: ') + (settings.name || '-')
        ]),
        el('p', { style: 'margin:4px 0 0;font-size:13px;color:#6b7280;' }, [
          (isAr ? 'الفترة: ' : 'Period: ') + start + ' → ' + end
        ])
      ])
    ]));

    // بطاقات إحصائية
    const stats = el('div', {
      style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;'
    });
    const counts = result.counts || {};
    const cards = [
      { label: isAr ? 'حضور' : 'Present', val: counts.A || 0, color: '#22c55e' },
      { label: isAr ? 'مطبق' : 'Double', val: counts.X || 0, color: '#a855f7' },
      { label: isAr ? 'إجازة' : 'Leave', val: counts.L || 0, color: '#f59e0b' },
      { label: isAr ? 'غياب' : 'Absent', val: counts.B || 0, color: '#ef4444' }
    ];
    cards.forEach((c) => {
      stats.appendChild(el('div', {
        style: 'border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center;'
      }, [
        el('div', { style: 'font-size:24px;font-weight:800;color:' + c.color + ';' }, [String(c.val)]),
        el('div', { style: 'font-size:11px;color:#6b7280;margin-top:4px;' }, [c.label])
      ]));
    });
    reportNode.appendChild(stats);

    // جدول الساعات والراتب
    const calc = el('div', { style: 'margin-bottom:24px;' });
    calc.appendChild(el('h2', { style: 'font-size:16px;margin:0 0 12px;color:#2563eb;' }, [
      isAr ? 'حساب الراتب' : 'Salary Calculation'
    ]));
    const rows = [
      [isAr ? 'إجمالي الساعات' : 'Total hours', fmtNum(result.totalHours || 0) + (isAr ? ' س' : ' h')],
      [isAr ? 'ساعات إضافية' : 'Overtime hours', fmtNum(result.overtimeHours || 0) + (isAr ? ' س' : ' h')],
      [isAr ? 'سعر الساعة' : 'Hourly rate', fmtCurrency(result.hourlyRate || 0)],
      [isAr ? 'الراتب الأساسي' : 'Base salary', fmtCurrency(result.baseSalary || 0)],
      [isAr ? '+ الإضافي' : '+ Overtime', fmtCurrency(result.overtimeValue || 0)],
      [isAr ? '+ المكافآت' : '+ Bonuses', fmtCurrency(result.bonus || 0)],
      [isAr ? '+ البدلات' : '+ Allowances', fmtCurrency(result.allowance || 0)],
      [isAr ? '− الخصومات' : '− Deductions', fmtCurrency(result.deduction || 0)],
      [isAr ? '− السلف' : '− Advances', fmtCurrency(result.advance || 0)]
    ];
    rows.forEach((r) => {
      calc.appendChild(el('div', {
        style: 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;'
      }, [
        el('span', { style: 'color:#6b7280;' }, [r[0]]),
        el('strong', {}, [r[1]])
      ]));
    });
    // صافي الراتب
    calc.appendChild(el('div', {
      style: 'display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;border-top:2px solid #2563eb;font-size:16px;'
    }, [
      el('strong', {}, [isAr ? 'صافي الراتب' : 'Net salary']),
      el('strong', { style: 'color:#2563eb;font-size:18px;' }, [fmtCurrency(result.netSalary || 0)])
    ]));
    reportNode.appendChild(calc);

    // قسم الإجازات
    if (leaves.length > 0) {
      const lvSection = el('div', { style: 'margin-bottom:24px;' });
      lvSection.appendChild(el('h2', { style: 'font-size:16px;margin:0 0 12px;color:#2563eb;' }, [
        isAr ? 'الإجازات في الفترة' : 'Leaves in period'
      ]));
      const tbl = el('table', {
        style: 'width:100%;border-collapse:collapse;font-size:12px;'
      });
      const thead = el('thead');
      thead.appendChild(el('tr', {}, [
        el('th', { style: 'text-align:' + (isAr ? 'right' : 'left') + ';padding:6px;border-bottom:2px solid #e5e7eb;' }, [isAr ? 'من' : 'From']),
        el('th', { style: 'text-align:' + (isAr ? 'right' : 'left') + ';padding:6px;border-bottom:2px solid #e5e7eb;' }, [isAr ? 'إلى' : 'To']),
        el('th', { style: 'text-align:' + (isAr ? 'right' : 'left') + ';padding:6px;border-bottom:2px solid #e5e7eb;' }, [isAr ? 'النوع' : 'Type']),
        el('th', { style: 'text-align:' + (isAr ? 'right' : 'left') + ';padding:6px;border-bottom:2px solid #e5e7eb;' }, [isAr ? 'أيام' : 'Days'])
      ]));
      tbl.appendChild(thead);
      const tbody = el('tbody');
      leaves.forEach((lv) => {
        const days = global.SPLeaves.countLeaveDays(lv);
        const typeName = global.SPLeaves.getTypeName(lv.type);
        tbody.appendChild(el('tr', {}, [
          el('td', { style: 'padding:6px;border-bottom:1px solid #f3f4f6;' }, [lv.fromDate]),
          el('td', { style: 'padding:6px;border-bottom:1px solid #f3f4f6;' }, [lv.toDate || lv.fromDate]),
          el('td', { style: 'padding:6px;border-bottom:1px solid #f3f4f6;' }, [typeName]),
          el('td', { style: 'padding:6px;border-bottom:1px solid #f3f4f6;' }, [fmtNum(days)])
        ]));
      });
      tbl.appendChild(tbody);
      lvSection.appendChild(tbl);
      reportNode.appendChild(lvSection);
    }

    // ---------- جدول التقرير الكامل ----------
    const tableSection = el('div', { style: 'margin-bottom:24px;' });
    tableSection.appendChild(el('h2', { style: 'font-size:16px;margin:0 0 12px;color:#2563eb;' }, [
      isAr ? 'جدول الحضور والورديات' : 'Attendance & Shift Table'
    ]));
    const dailyTable = el('table', { style: 'width:100%;border-collapse:collapse;font-size:10px;' });
    const headerRow = el('tr');
    [isAr ? 'اليوم' : 'Day', isAr ? 'التاريخ' : 'Date', isAr ? 'الوردية' : 'Shift', isAr ? 'الحالة' : 'Status', isAr ? 'الوقت' : 'Time', isAr ? 'الساعات' : 'Hours', isAr ? 'القيمة' : 'Value'].forEach((label) => {
      headerRow.appendChild(el('th', { style: 'padding:6px;border-bottom:2px solid #e5e7eb;text-align:' + (isAr ? 'right' : 'left') + ';' }, [label]));
    });
    dailyTable.appendChild(el('thead', {}, [headerRow]));
    const dailyBody = el('tbody');
    (result.dailyDetails || []).forEach((d) => {
      const dstr = fmtDate(d.date);
      const code = SPStorage.getScheduledCode(dstr);
      const shift = code ? SPStorage.getShiftByCode(code) : null;
      const status = d.entry ? (global.SPAttendance && SPAttendance.statusLabels ? SPAttendance.statusLabels[d.entry.status] : d.entry.status) : 'غير مسجل';
      const time = d.entry && d.entry.from && d.entry.to ? d.entry.from + ' — ' + d.entry.to : '-';
      const row = el('tr');
      [weekdayName(d.date), dstr, shift ? shift.name : 'غير محدد', status, time, fmtNum(d.actual || 0), fmtCurrency(d.value || 0)].forEach((value) => {
        row.appendChild(el('td', { style: 'padding:5px;border-bottom:1px solid #f3f4f6;' }, [String(value)]));
      });
      dailyBody.appendChild(row);
    });
    dailyTable.appendChild(dailyBody);
    tableSection.appendChild(dailyTable);
    reportNode.appendChild(tableSection);

    function weekdayName(d) {
      const names = isAr ? ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      return names[d.getDay()];
    }

    // تذييل
    reportNode.appendChild(el('div', {
      style: 'margin-top:40px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:11px;color:#6b7280;text-align:center;'
    }, [
      'ShiftPro v2.0 — ' + (isAr ? 'صدر في ' : 'Generated at ') + new Date().toLocaleString(isAr ? 'ar-EG' : 'en-US')
    ]));

    // اخفاء العنصر مؤقتًا
    reportNode.style.position = 'fixed';
    reportNode.style.top = '-9999px';
    reportNode.style.left = '0';
    document.body.appendChild(reportNode);

    try {
      // ---------- تحويل لـ canvas ----------
      // انتظر الخطوط العربية حتى تظهر الحروف متصلة وباتجاه صحيح داخل ملف PDF.
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const html2canvas = await loadHtml2canvas();
      const canvas = await html2canvas(reportNode, {
        scale: 2.5,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });

      // ---------- تحويل لـ PDF ----------
      const jsPDF = await loadJsPDF();
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const imgData = canvas.toDataURL('image/png');
      const pageWidth = 210;
      const pageHeight = 297;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // اسم الملف
      const rangeLabel = rangeStart instanceof Date || rangeEnd instanceof Date
        ? (isAr ? 'تقرير_' : 'report_') + fmtDate(startDate) + '_الى_' + fmtDate(endDate)
        : (isAr ? 'تقرير_' : 'report_') + (month + 1) + '_' + year;
      const filename = rangeLabel + '.pdf';
      pdf.save(filename);
      return { ok: true, filename };
    } catch (e) {
      console.error('[PDF] export error', e);
      if (global.SPUtils && SPUtils.toast) {
        SPUtils.toast('فشل تصدير PDF: ' + e.message, 'error');
      }
      return { ok: false, error: e.message };
    } finally {
      // امسح العنصر المؤقت
      if (reportNode.parentNode) reportNode.parentNode.removeChild(reportNode);
    }
  }

  async function exportReportRange(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date)) throw new Error('Invalid report range');
    return exportMonthlyReport(start.getFullYear(), start.getMonth(), start, end);
  }

  // ---------- تصدير إيصال حضور ليوم واحد ----------
  async function exportDayReceipt(date) {
    if (!global.SPStorage || !global.SPSalary) return { ok: false, error: 'modules missing' };
    const dstr = (typeof date === 'string') ? date : SPUtils.fmtDate(date);
    const entry = SPStorage.getEntry(dstr);
    if (!entry) {
      if (global.SPUtils && SPUtils.toast) SPUtils.toast('لا يوجد سجل لهذا اليوم', 'warning');
      return { ok: false, error: 'no entry' };
    }
    const settings = SPStorage.getSettings();
    const d = SPUtils.parseDate(dstr);
    const hours = (global.SPAttendance && SPAttendance.computeActualHours)
      ? SPAttendance.computeActualHours(entry) : 0;
    const value = (global.SPAttendance && SPAttendance.dayValue)
      ? SPAttendance.dayValue(d, entry) : 0;
    const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');

    const receiptNode = SPUtils.el('div', {
      style: 'background:#fff;color:#0d1f35;font-family:Cairo,"IBM Plex Sans Arabic","Noto Sans Arabic",Tahoma,Arial,sans-serif;padding:30px;width:400px;direction:' + (isAr ? 'rtl' : 'ltr') + ';text-align:' + (isAr ? 'right' : 'left') + ';line-height:1.75;box-sizing:border-box;'
    });
    receiptNode.appendChild(SPUtils.el('h2', { style: 'text-align:center;color:#2563eb;margin:0 0 10px;' }, ['ShiftPro']));
    receiptNode.appendChild(SPUtils.el('p', { style: 'text-align:center;color:#6b7280;margin:0 0 20px;' }, [
      isAr ? 'إيصال يوم' : 'Day receipt'
    ]));
    const fields = [
      [isAr ? 'الموظف' : 'Employee', settings.name || '-'],
      [isAr ? 'التاريخ' : 'Date', dstr],
      [isAr ? 'الحضور' : 'Check-in', entry.from || '-'],
      [isAr ? 'الانصراف' : 'Check-out', entry.to || '-'],
      [isAr ? 'ساعات' : 'Hours', SPUtils.fmtHours(hours)],
      [isAr ? 'القيمة' : 'Value', SPUtils.fmtCurrency(value)]
    ];
    fields.forEach((f) => {
      receiptNode.appendChild(SPUtils.el('div', {
        style: 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px;'
      }, [
        SPUtils.el('span', { style: 'color:#6b7280;' }, [f[0]]),
        SPUtils.el('strong', {}, [f[1]])
      ]));
    });

    receiptNode.style.position = 'fixed';
    receiptNode.style.top = '-9999px';
    receiptNode.style.left = '0';
    document.body.appendChild(receiptNode);

    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const html2canvas = await loadHtml2canvas();
      const canvas = await html2canvas(receiptNode, { scale: 2.5, backgroundColor: '#fff', logging: false });
      const jsPDF = await loadJsPDF();
      const pdf = new jsPDF({ unit: 'mm', format: 'a6', orientation: 'portrait' });
      const imgData = canvas.toDataURL('image/png');
      const pageWidth = 105;
      const pageHeight = 148;
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      const filename = (isAr ? 'ايصال_' : 'receipt_') + dstr + '.pdf';
      pdf.save(filename);
      return { ok: true, filename };
    } catch (e) {
      console.error('[PDF] day receipt error', e);
      return { ok: false, error: e.message };
    } finally {
      if (receiptNode.parentNode) receiptNode.parentNode.removeChild(receiptNode);
    }
  }

  global.SPPDF = {
    exportMonthlyReport,
    exportReportRange,
    exportDayReceipt,
    loadJsPDF,
    loadHtml2canvas
  };
})(window);
