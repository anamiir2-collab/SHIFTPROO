/* ShiftPro — رسائل الترحيب والتحفيز
   تُحفظ الرسائل في ملف مستقل لتسهيل تعديلها وإضافة رسائل جديدة.
   المتغير {name} يُستبدل باسم الموظف تلقائيًا.
*/
(function (global) {
  'use strict';

  const messages = {
    ar: [
      'صباح الخير يا {name}! توكل على الله، وابدأ ورديتك اليوم بنية صالحة.',
      'يا {name}، تذكّر دائمًا أن إتقان العمل من صفات العمل الصالح.',
      'ربنا يجعل يومك مبارك يا {name} ويرزقك التوفيق والبركة في كل خطوة.',
      'استعن بالله يا {name} ولا تعجز.. كل جهد تبذله في الحلال له قيمة.',
      'جاهز لإنجاز جديد يا {name}؟ تركيزك واجتهادك اليوم هما سر نجاحك.',
      'أهلًا {name}! طاقتك الإيجابية بتفرق في مكان العمل، يومك سعيد وموفق.',
      'يا {name}، الخطوات الصغيرة المنتظمة هي اللي بتصنع الإنجازات الكبيرة.',
      'عاش يا {name}! شغفك وإخلاصك في عملك بيصنعوا الفرق كل يوم.',
      'لا تنسَ يا {name} تاخد استراحة قصيرة وتشرب ماء لتجديد نشاطك.',
      'يا {name}، رتّب أولوياتك وابدأ بالمهم، وخلي يومك هادئ ومثمر بإذن الله.',
      'توازنك بين إتقان عملك ورعاية نفسك يا {name} هو سر استمرار نجاحك.'
    ],
    en: [
      'Good morning, {name}! Put your trust in God and start your shift with a good intention.',
      '{name}, doing your work with care and integrity makes a real difference.',
      'May your day be blessed, {name}, with success and goodness in every step.',
      'Keep going, {name}. Every honest effort you make has value.',
      'Ready for a new achievement, {name}? Your focus and effort build success.',
      'Welcome, {name}! Your positive energy can make a difference at work.',
      '{name}, small consistent steps lead to meaningful achievements.',
      'Well done, {name}! Your dedication and enthusiasm make a difference.',
      'Remember to take a short break and drink some water, {name}.',
      'Set your priorities, {name}, and start with what matters most.',
      'Balancing great work with caring for yourself helps your success last, {name}.'
    ]
  };

  let selectedByLoad = null;

  function choose(locale) {
    const list = messages[locale] || messages.ar;
    if (selectedByLoad === null) {
      selectedByLoad = Math.floor(Math.random() * list.length);
    }
    return list[selectedByLoad % list.length];
  }

  function render(name, locale) {
    const card = document.getElementById('dailyWelcomeMessage');
    const text = document.getElementById('dailyWelcomeMessageText');
    if (!card || !text) return;
    const safeName = (name || '').trim() || (locale === 'en' ? 'there' : 'صديقي');
    const template = choose(locale);
    text.textContent = template.replace(/\{name\}/g, safeName);
    card.hidden = false;
    card.setAttribute('aria-live', 'polite');
  }

  global.SPWelcomeMessages = { render };
})(window);
