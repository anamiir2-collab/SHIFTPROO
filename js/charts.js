/* ShiftPro - Interactive Charts (Chart.js)
   رسوم بيانية تفاعلية:
   - ساعات يومية/أسبوعية
   - الإضافي
   - مقارنة شهر بشهر
   - نسب التغيّر (↑ 12% عن الشهر اللي فات)

   exposes: window.SPCharts
*/
(function (global) {
  'use strict';

  function t(key, vars) {
    return global.SPi18n ? SPi18n.t(key, vars) : key;
  }

  let _chartPromise = null;
  function loadChart() {
    if (_chartPromise) return _chartPromise;
    if (global.Chart) return Promise.resolve(global.Chart);
    _chartPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = './vendor/chart.umd.min.js';
      s.onload = () => {
        if (global.Chart) resolve(global.Chart);
        else reject(new Error('Chart not loaded'));
      };
      s.onerror = () => {
        // fallback لـ CDN
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        s2.onload = () => {
          if (global.Chart) resolve(global.Chart);
          else reject(new Error('Chart not loaded'));
        };
        s2.onerror = () => reject(new Error('Failed to load Chart.js'));
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
    return _chartPromise;
  }

  // خريطة الـ charts النشطة (عشان نقدر ندمّر/نحدّث)
  const activeCharts = new Map();

  function destroyChart(id) {
    if (activeCharts.has(id)) {
      try { activeCharts.get(id).destroy(); } catch (e) {}
      activeCharts.delete(id);
    }
  }
  function destroyAll() {
    activeCharts.forEach((c) => { try { c.destroy(); } catch (e) {} });
    activeCharts.clear();
  }

  // ---------- رسم: ساعات يومية ----------
  async function renderDailyHours(canvasId, days, hoursData, options) {
    options = options || {};
    try {
      const Chart = await loadChart();
      destroyChart(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');
      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: days,
          datasets: [{
            label: isAr ? 'ساعات' : 'Hours',
            data: hoursData,
            backgroundColor: 'rgba(59, 130, 246, 0.75)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => isAr ? (ctx.parsed.y + ' س') : (ctx.parsed.y + ' h')
              }
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#86a8c8' } },
            x: { ticks: { color: '#86a8c8' } }
          }
        }
      });
      activeCharts.set(canvasId, chart);
      return chart;
    } catch (e) {
      console.error('[Charts] daily hours error', e);
      return null;
    }
  }

  // ---------- رسم: الإضافي عبر الزمن ----------
  async function renderOvertimeTrend(canvasId, labels, overtimeData) {
    try {
      const Chart = await loadChart();
      destroyChart(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');
      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: isAr ? 'ساعات إضافية' : 'Overtime hours',
            data: overtimeData,
            borderColor: 'rgba(34, 197, 94, 1)',
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: 'rgba(34, 197, 94, 1)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#c5d8ee' } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#86a8c8' } },
            x: { ticks: { color: '#86a8c8' } }
          }
        }
      });
      activeCharts.set(canvasId, chart);
      return chart;
    } catch (e) {
      console.error('[Charts] overtime error', e);
      return null;
    }
  }

  // ---------- رسم: مقارنة شهر بشهر ----------
  async function renderMonthComparison(canvasId, monthsData) {
    // monthsData: [{ label: 'يناير', hours: 200, overtime: 30, salary: 6000 }, ...]
    try {
      const Chart = await loadChart();
      destroyChart(canvasId);
      const canvas = document.getElementById(canvasId);
      if (!canvas) return null;
      const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');
      const ctx = canvas.getContext('2d');
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: monthsData.map((m) => m.label),
          datasets: [
            {
              label: isAr ? 'ساعات أساسية' : 'Base hours',
              data: monthsData.map((m) => m.hours),
              backgroundColor: 'rgba(59, 130, 246, 0.75)',
              borderColor: 'rgba(59, 130, 246, 1)',
              borderWidth: 1
            },
            {
              label: isAr ? 'ساعات إضافية' : 'Overtime',
              data: monthsData.map((m) => m.overtime || 0),
              backgroundColor: 'rgba(34, 197, 94, 0.75)',
              borderColor: 'rgba(34, 197, 94, 1)',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: true, labels: { color: '#c5d8ee' } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { color: '#86a8c8' } },
            x: { ticks: { color: '#86a8c8' } }
          }
        }
      });
      activeCharts.set(canvasId, chart);
      return chart;
    } catch (e) {
      console.error('[Charts] month comparison error', e);
      return null;
    }
  }

  // ---------- حساب نسبة التغيّر بين شهرين ----------
  function pctChange(prev, cur) {
    if (prev == null || prev === 0) return 0;
    return Math.round(((cur - prev) / prev) * 100);
  }

  // ---------- توليد بيانات الأشهر الـ 6 الأخيرة ----------
  function getMonthlyData(months) {
    if (!global.SPStorage || !global.SPSalary) return [];
    months = months || 6;
    const result = [];
    const today = new Date();
    const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');
    const monthNames = isAr
      ? ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
      : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      try {
        const r = SPSalary.computeSalary(start, end);
        result.push({
          label: monthNames[d.getMonth()],
          hours: Math.round(r.totalHours || 0),
          overtime: Math.round(r.overtimeHours || 0),
          salary: Math.round(r.netSalary || 0)
        });
      } catch (e) {
        result.push({ label: monthNames[d.getMonth()], hours: 0, overtime: 0, salary: 0 });
      }
    }
    return result;
  }

  // ---------- تركيب بطاقة "نسبة التغيّر" ----------
  function buildChangeCard(prev, cur, label) {
    const pct = pctChange(prev, cur);
    const isUp = pct >= 0;
    const arrow = isUp ? '↑' : '↓';
    const color = isUp ? '#22c55e' : '#ef4444';
    const isAr = (global.SPi18n && SPi18n.getLocale() === 'ar');
    const sign = isUp ? '+' : '';
    const node = document.createElement('div');
    node.style.cssText = 'padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2);';
    node.innerHTML =
      '<div style="font-size:11px;color:var(--muted);margin-bottom:4px;">' + label + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:6px;">' +
        '<strong style="font-size:16px;color:' + color + ';">' + arrow + ' ' + sign + pct + '%</strong>' +
        '<span style="font-size:11px;color:var(--muted);">' +
          (isAr ? ('(من ' + prev + ' إلى ' + cur + ')') : ('(from ' + prev + ' to ' + cur + ')')) +
        '</span>' +
      '</div>';
    return node;
  }

  global.SPCharts = {
    loadChart,
    renderDailyHours,
    renderOvertimeTrend,
    renderMonthComparison,
    getMonthlyData,
    pctChange,
    buildChangeCard,
    destroyChart,
    destroyAll
  };
})(window);
