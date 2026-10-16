require('../js/nova.js');

describe('SPNova command routing', () => {
  test('recognizes Arabic hours, salary and leave requests', () => {
    expect(window.SPNova.classifyIntent('كام ساعة اشتغلت الشهر ده؟')).toBe('hours');
    expect(window.SPNova.classifyIntent('احسب راتبي المتوقع')).toBe('salary');
    expect(window.SPNova.classifyIntent('رصيد الاجازات')).toBe('leave_balance');
  });
  test('recognizes shift, navigation and attendance intents', () => {
    expect(window.SPNova.classifyIntent('ايه ورديتي الجاية؟')).toBe('next_shift');
    expect(window.SPNova.classifyIntent('افتح التقارير')).toBe('open_reports');
    expect(window.SPNova.classifyIntent('افتح الراتب')).toBe('open_salary');
    expect(window.SPNova.classifyIntent('سجل حضور')).toBe('checkin');
    expect(window.SPNova.classifyIntent('سجل انصراف')).toBe('checkout');
  });
  test('does not execute unknown text as a known intent', () => {
    expect(window.SPNova.classifyIntent('')).toBe('empty');
    expect(window.SPNova.classifyIntent('افعل اي شيء')).toBe('unknown');
  });
});
