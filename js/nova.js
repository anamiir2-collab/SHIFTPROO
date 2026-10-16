/* NOVA: local, allowlisted ShiftPro assistant. No external API. */
(function (w) {
  'use strict';
  const t = (key, vars) => w.SPi18n && w.SPi18n.t ? w.SPi18n.t(key, vars) : key;
  const norm = s => String(s || '').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\s+/g, ' ').trim();
  function classifyIntent(s) {
    const q = norm(s);
    if (!q) return 'empty';
    if (/(تسجيل حضور|سجل حضور|سجلت حضور|احضر الان|check in|clock in)/.test(q)) return 'checkin';
    if (/(تسجيل انصراف|سجل انصراف|انصرف الان|خلصت شغل|check out|clock out)/.test(q)) return 'checkout';
    if (/(رصيد.*اجاز|اجازاتي|رصيد الاجازات|leave balance)/.test(q)) return 'leave_balance';
    if (/(كام ساع|كم ساع|عدد الساع|ساعات.*اشتغ|اشتغلت.*ساع|worked hours|hours worked)/.test(q)) return 'hours';
    if (/(راتب|مرتب|مستحقات|صافي|salary|payroll)/.test(q)) return 'salary';
    if (/(غياب|ايام غياب|absence|absent)/.test(q)) return 'absence';
    if (/(ورديه|ورديتي الجاي|ورديتي القادمه|شيفت|الوردية الجاي|الورديه الجاي|next shift|my shift)/.test(q)) return 'next_shift';
    if (/(افتح|روح|انتقل).*(تقويم|calendar)/.test(q)) return 'open_calendar';
    if (/(افتح|روح|انتقل).*(راتب|salary)/.test(q)) return 'open_salary';
    if (/(افتح|روح|انتقل).*(تقرير|تقارير|reports)/.test(q) || /(تقرير|تقارير|report)/.test(q)) return 'open_reports';
    if (/(افتح|روح|انتقل).*(الرئيسيه|الرئيسية|home|الحضور)/.test(q)) return 'open_dashboard';
    if (/(افتح|روح|انتقل).*(قانون العمل|مستشارك العمالي)/.test(q)) return 'open_law';
    if (/(مساعده|ساعدني|اوامر|ماذا تستطيع|help|what can you do)/.test(q)) return 'help';
    return 'unknown';
  }
  const locale = () => w.SPi18n && w.SPi18n.getLocale() === 'en' ? 'en-US' : 'ar-EG';
  const num = n => { try { return new Intl.NumberFormat(locale(), {maximumFractionDigits:2}).format(Number(n)||0); } catch(e) { return String(Number(n)||0); } };
  const money = n => { try { return new Intl.NumberFormat(locale(), {style:'currency',currency:'EGP',maximumFractionDigits:2}).format(Number(n)||0); } catch(e) { return num(n)+' EGP'; } };
  const dateLabel = d => { try { return new Intl.DateTimeFormat(locale(), {day:'numeric',month:'short',year:'numeric'}).format(d); } catch(e) { return d.toLocaleDateString(); } };
  function salaryData() {
    if (!w.SPSalary || !w.SPSalary.computeSalary) return null;
    const now = new Date();
    const p = w.SPSalary.getPayPeriod ? w.SPSalary.getPayPeriod(now) : {start:new Date(now.getFullYear(),now.getMonth(),1),end:new Date(now.getFullYear(),now.getMonth()+1,0)};
    return {period:p, result:w.SPSalary.computeSalary(p.start,p.end)};
  }
  function runCommand(command, options) {
    const intent = classifyIntent(command);
    if (intent === 'hours' || intent === 'salary' || intent === 'absence') {
      const data = salaryData();
      if (!data) return {ok:false,message:t('nova.error_data')};
      const r = data.result, vars = {start:dateLabel(data.period.start),end:dateLabel(data.period.end)};
      if (intent === 'hours') return {ok:true,message:t('nova.hours_result',{...vars,hours:num(r.totalHours)})};
      if (intent === 'salary') return {ok:true,message:t('nova.salary_result',{...vars,net:money(r.netSalary),gross:money(r.grossSalary),deductions:money(r.totalDeductions)})};
      return {ok:true,message:t('nova.absence_result',{count:num(r.counts.B)})};
    }
    if (intent === 'leave_balance') {
      if (!w.SPLeaves || !w.SPLeaves.calculateBalances) return {ok:false,message:t('nova.error_data')};
      const b = w.SPLeaves.calculateBalances(new Date().getFullYear());
      const labels = {annual:t('leave.annual'),casual:t('leave.casual'),sick:t('leave.sick'),unpaid:t('leave.unpaid'),maternity:t('leave.maternity'),special:t('leave.special'),compensatory:t('leave.compensatory'),periodic:t('leave.periodic')};
      return {ok:true,message:t('nova.leave_result',{balances:Object.keys(b).map(k=>(labels[k]||k)+': '+num(b[k].remaining)+' / '+num(b[k].total)).join('\n')})};
    }
    if (intent === 'next_shift') {
      if (!w.SPStorage || !w.SPUtils) return {ok:false,message:t('nova.error_data')};
      const now = new Date();
      for (let i=0;i<=30;i++) {
        const d = new Date(now.getFullYear(),now.getMonth(),now.getDate()+i);
        const key = w.SPUtils.fmtDate(d), code = w.SPStorage.getScheduledCode(key), shift = code && w.SPStorage.getShiftByCode(code);
        if (shift) return {ok:true,message:t('nova.shift_result',{date:dateLabel(d),shift:(w.SPi18n&&w.SPi18n.getLocale()==='en'?(shift.nameEn||shift.name):(shift.name||shift.nameEn)),start:shift.startTime||'—',end:shift.endTime||'—'})};
      }
      return {ok:true,message:t('nova.no_shift')};
    }
    const tabs = {open_calendar:'calendar',open_salary:'salary',open_reports:'reports',open_dashboard:'dashboard'};
    if (tabs[intent]) {
      if (!w.SPApp || !w.SPApp.goToTab) return {ok:false,message:t('nova.error_navigation')};
      w.SPApp.goToTab(tabs[intent]); return {ok:true,message:t('nova.navigation_done')};
    }
    if (intent === 'open_law') {
      if (!w.SPLaw || !w.SPApp) return {ok:false,message:t('nova.law_unavailable')};
      w.SPApp.goToTab('law'); return {ok:true,message:t('nova.navigation_done')};
    }
    if (intent === 'checkin' || intent === 'checkout') {
      const button = document.getElementById(intent === 'checkin' ? 'checkinBtn' : 'checkoutBtn');
      if (!button || button.hidden || button.disabled || button.closest('[hidden]')) return {ok:false,message:t(intent === 'checkin'?'nova.checkin_unavailable':'nova.checkout_unavailable')};
      if (!options || options.confirmed !== true) return {ok:true,requiresConfirmation:true,action:intent,message:t(intent==='checkin'?'nova.confirm_checkin':'nova.confirm_checkout')};
      button.click(); return {ok:true,message:t(intent==='checkin'?'nova.checkin_sent':'nova.checkout_sent')};
    }
    if (intent === 'help') return {ok:true,message:t('nova.help')};
    return {ok:false,message:t(intent==='empty'?'nova.empty':'nova.unknown')};
  }
  function esc(s) { return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function init() {
    if (!document.body || document.getElementById('novaRoot')) return;
    const root=document.createElement('div'); root.id='novaRoot'; root.className='nova-root';
    root.innerHTML='<button class="nova-fab" id="novaFab" type="button" aria-label="'+esc(t('nova.open'))+'" aria-controls="novaPanel" aria-expanded="false"><span class="nova-robot" aria-hidden="true"><svg viewBox="0 0 48 48"><path class="nova-line" d="M24 8V4m-4 0h8M5 20v9m38-9v9M18 30h12M16 38v4m16-4v4"/><circle class="nova-dot" cx="24" cy="4" r="2.5"/><rect class="nova-head" x="8" y="12" width="32" height="25" rx="9"/><circle class="nova-eye" cx="18" cy="23" r="3"/><circle class="nova-eye" cx="30" cy="23" r="3"/></svg></span></button><div class="nova-nudge" id="novaNudge" hidden></div><section class="nova-panel" id="novaPanel" aria-label="'+esc(t('nova.title'))+'" hidden><header class="nova-header"><div class="nova-header-avatar" aria-hidden="true">✦</div><div class="nova-header-copy"><strong>'+esc(t('nova.title'))+'</strong><span>'+esc(t('nova.subtitle'))+'</span></div><button class="nova-close" id="novaClose" type="button" aria-label="'+esc(t('nova.close'))+'">×</button></header><div class="nova-messages" id="novaMessages" aria-live="polite"></div><div class="nova-quick" id="novaQuick"></div><form class="nova-form" id="novaForm"><label class="nova-sr-only" for="novaInput">'+esc(t('nova.input_label'))+'</label><input id="novaInput" maxlength="500" autocomplete="off" placeholder="'+esc(t('nova.placeholder'))+'"><button id="novaSend" type="submit" aria-label="'+esc(t('nova.send'))+'">➤</button></form></section>';
    document.body.appendChild(root);
    const $=s=>root.querySelector(s), panel=$('#novaPanel'), fab=$('#novaFab'), messages=$('#novaMessages'), input=$('#novaInput'), nudge=$('#novaNudge');
    let pending=null;
    function message(text, role) { const box=document.createElement('div'); box.className='nova-message nova-message-'+role; const p=document.createElement('p'); p.textContent=text; box.appendChild(p); messages.appendChild(box); messages.scrollTop=messages.scrollHeight; }
    function open() { panel.hidden=false; fab.setAttribute('aria-expanded','true'); nudge.hidden=true; if(!messages.dataset.welcomed){const s=w.SPStorage&&w.SPStorage.getSettings?w.SPStorage.getSettings():{}; message(t('nova.intro',{name:String(s.name||'').trim()||t('dashboard.default_name')}),'assistant');messages.dataset.welcomed='1';} input.focus(); }
    function close() {panel.hidden=true;fab.setAttribute('aria-expanded','false');fab.focus();}
    function submitCommand(raw) {
      const command=String(raw||'').trim(); if(!command)return;
      message(command,'user'); const result=runCommand(command);
      if(!result.requiresConfirmation){message(result.message,result.ok?'assistant':'assistant nova-message-warning');return;}
      pending=result.action;
      const card=document.createElement('div');card.className='nova-confirm-card';
      const p=document.createElement('p');p.textContent=result.message;
      const row=document.createElement('div');row.className='nova-confirm-actions';
      const yes=document.createElement('button');yes.type='button';yes.className='nova-confirm-yes';yes.textContent=t('nova.confirm_yes');
      const no=document.createElement('button');no.type='button';no.className='nova-confirm-no';no.textContent=t('nova.confirm_no');
      yes.addEventListener('click',()=>{const a=pending;pending=null;card.remove();const r=runCommand(a==='checkin'?'سجل حضور':'سجل انصراف',{confirmed:true});message(r.message,'assistant');});
      no.addEventListener('click',()=>{pending=null;card.remove();message(t('nova.cancelled'),'assistant');});
      row.append(yes,no);card.append(p,row);messages.appendChild(card);messages.scrollTop=messages.scrollHeight;
    }
    const quick=[['nova.quick_hours','كام ساعة اشتغلت في فترة الراتب؟'],['nova.quick_salary','احسب راتبي المتوقع'],['nova.quick_shift','إيه ورديتي الجاية؟'],['nova.quick_reports','افتح التقارير']];
    $('#novaQuick').innerHTML=quick.map(x=>'<button type="button" class="nova-quick-btn" data-command="'+esc(x[1])+'">'+esc(t(x[0]))+'</button>').join('');
    $('#novaQuick').addEventListener('click',e=>{const b=e.target.closest('[data-command]');if(b)submitCommand(b.dataset.command);});
    fab.addEventListener('click',()=>panel.hidden?open():close()); $('#novaClose').addEventListener('click',close);
    $('#novaForm').addEventListener('submit',e=>{e.preventDefault();const v=input.value;input.value='';submitCommand(v);});
    function showNudge(){if(!panel.hidden)return;const s=w.SPStorage&&w.SPStorage.getSettings?w.SPStorage.getSettings():{};nudge.textContent=t('nova.nudge',{name:String(s.name||'').trim()||t('dashboard.default_name')});nudge.hidden=false;try{localStorage.setItem('shiftpro_nova_last_nudge_v1',String(Date.now()));}catch(e){}w.setTimeout(()=>{nudge.hidden=true;},9000);}
    let last=0;try{last=Number(localStorage.getItem('shiftpro_nova_last_nudge_v1'))||0;}catch(e){}
    if(Date.now()-last>21600000)w.setTimeout(showNudge,7000);
    w.setInterval(()=>{let v=0;try{v=Number(localStorage.getItem('shiftpro_nova_last_nudge_v1'))||0;}catch(e){}if(Date.now()-v>21600000)showNudge();},3600000);
    if(w.SPi18n&&w.SPi18n.subscribe)w.SPi18n.subscribe(()=>{const title=$('.nova-header-copy strong'),sub=$('.nova-header-copy span'),close=$('#novaClose'),send=$('#novaSend'),label=$('label[for="novaInput"]');if(title)title.textContent=t('nova.title');if(sub)sub.textContent=t('nova.subtitle');if(close)close.setAttribute('aria-label',t('nova.close'));if(send)send.setAttribute('aria-label',t('nova.send'));if(label)label.textContent=t('nova.input_label');input.placeholder=t('nova.placeholder');fab.setAttribute('aria-label',t('nova.open'));$('#novaQuick').querySelectorAll('[data-command]').forEach((b,i)=>{const keys=['nova.quick_hours','nova.quick_salary','nova.quick_shift','nova.quick_reports'];if(keys[i])b.textContent=t(keys[i]);});});
  }
  w.SPNova={init, classifyIntent, runCommand};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
