/* ============================================================
   SHIFTPRO — Egyptian Labor Law Reader (scoped module)
   ----------------------------------------------------------------
   Exposes: window.SPLaw
   Public API:
     - SPLaw.activate()      → enters the law tab, restores last page
     - SPLaw.deactivate()    → exits the law tab, detaches listeners
     - SPLaw.isReady()       → true if window.__LAW__ is initialized
     - SPLaw.getStats()      → returns { books, articles, preamble, total }
     - SPLaw.handleHash(h)   → returns true if hash belongs to law reader

   Architecture:
     - The dataset lives on window.__LAW__ (populated by js/data/*.js).
       SHIFTPRO does not use __LAW__ anywhere else, so this is isolated.
     - All DOM IDs are prefixed `law-` and all CSS classes `law-`/`toc-`/
       `paper`/`clause`/`chip`/`pnav`/`pbtn`/`crumb`/`art-`/`cover`/`cbtn`
       live under #page-law, scoped via css/law-reader.css.
     - Hash routing uses prefix `#law/` so SHIFTPRO's own hash/param
       navigation is not disturbed. Internal article links become
       `#law/m5`, `#law/cover`, etc. Browser back/forward works.
     - All document-level listeners are bound on activate() and removed
       on deactivate() so the reader cannot interfere with attendance,
       salary, calendar, reports, or settings sheets.
     - AR/EN labels are pulled from SHIFTPRO's SPi18n when available;
       Arabic legal text is always preserved verbatim from the dataset.
   ============================================================ */
(function (global) {
  'use strict';

  /* ============================================================
     1) Data source
     ============================================================ */
  function getLaw() { return global.__LAW__ || null; }

  function isReady() {
    const L = getLaw();
    return !!(L && L.books && L.preamble);
  }

  function getStats() {
    const L = getLaw();
    if (!L) return { ready: false };
    let articles = 0;
    (L.books || []).forEach((bk) => {
      (bk.articles || []).forEach(() => articles++);
      (bk.chapters || []).forEach((ch) => {
        (ch.articles || []).forEach(() => articles++);
        (ch.sections || []).forEach((s) => (s.articles || []).forEach(() => articles++));
      });
    });
    return {
      ready: true,
      books: (L.books || []).length,
      preamble: (L.preamble || []).length,
      articles: articles,
      total: (L.preamble || []).length + articles
    };
  }

  /* ============================================================
     2) Helpers
     ============================================================ */
  var ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

  function toArabicNum(n) {
    return String(n).replace(/[0-9]/g, function (d) { return ARABIC_DIGITS[+d]; });
  }
  function toLatinNum(s) {
    return String(s).replace(/[٠-٩]/g, function (d) { return ARABIC_DIGITS.indexOf(d); });
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function normalizeArabic(s) {
    return String(s)
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .toLowerCase();
  }

  /* ============================================================
     3) i18n — use SHIFTPRO's SPi18n when available; legal text
     stays in Arabic (the official language of the law).
     ============================================================ */
  function tt(key, fallback) {
    if (global.SPi18n && typeof global.SPi18n.t === 'function') {
      const v = global.SPi18n.t(key);
      if (v && v.length) return v;
    }
    return fallback;
  }
  function isEn() { return !!(global.SPi18n && global.SPi18n.getLocale && global.SPi18n.getLocale() === 'en'); }
  function isRtl() { return !(global.SPi18n && global.SPi18n.isRtl && !global.SPi18n.isRtl()); }

  /* ============================================================
     4) Build page model
     ============================================================ */
  var PAGES = [];
  var HASH = {};
  var PAGEHASH = {};
  var statArticles = 0;
  var statPreamble = 0;

  function registerPage(hash, obj) {
    var idx = PAGES.length;
    PAGES.push(obj);
    if (hash) {
      HASH[hash] = idx;
      PAGEHASH[idx] = hash;
    }
    return idx;
  }

  var ORDINALS = [
    'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة',
    'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة',
    'الحادية عشرة', 'الثانية عشرة', 'الثالثة عشرة'
  ];

  function buildPages() {
    const L = getLaw();
    if (!L) return;
    PAGES = []; HASH = {}; PAGEHASH = {};
    statArticles = 0; statPreamble = 0;

    registerPage('cover', { type: 'cover' });
    registerPage('intro', { type: 'intro' });
    registerPage('pd', { type: 'pdivider' });

    (L.preamble || []).forEach(function (p, i) {
      registerPage('t' + (i + 1), { type: 'article', kind: 'preamble', idx: i, art: p });
      statPreamble++;
    });

    (L.books || []).forEach(function (bk, bi) {
      registerPage('b' + (bi + 1), { type: 'divider', book: bi, bk: bk });

      function addArticle(a, ci, si) {
        registerPage('m' + a.num, {
          type: 'article', kind: 'law', num: a.num, paras: a.paras,
          book: bi, chapter: ci, section: si
        });
        statArticles++;
      }
      (bk.articles || []).forEach(function (a) { addArticle(a, -1, -1); });
      (bk.chapters || []).forEach(function (ch, ci) {
        (ch.articles || []).forEach(function (a) { addArticle(a, ci, -1); });
        (ch.sections || []).forEach(function (sec, si) {
          (sec.articles || []).forEach(function (a) { addArticle(a, ci, si); });
        });
      });
    });
  }

  function getArticleMeta(pg) {
    const L = getLaw();
    if (pg.kind === 'preamble') {
      return {
        chip: 'ت' + (pg.idx + 1),
        title: tt('law.article_ordinal', 'المادة ' + ORDINALS[pg.idx]),
        where: tt('law.preliminary_provisions', 'الأحكام التمهيدية'),
        hash: 't' + (pg.idx + 1)
      };
    }
    var bk = L.books[pg.book];
    var ch = pg.chapter >= 0 ? bk.chapters[pg.chapter] : null;
    var sec = (ch && pg.section >= 0) ? ch.sections[pg.section] : null;
    var where = bk.title + (bk.name ? ' — ' + bk.name : '');
    if (ch) where += ' › ' + ch.label + (ch.name ? ' ' + ch.name : '');
    if (sec) where += ' › ' + sec.label.replace(/[()]/g, '').trim() + (sec.name ? ' ' + sec.name : '');
    return {
      chip: 'م' + pg.num,
      title: tt('law.article_n', 'المادة (') + toArabicNum(pg.num) + ')',
      where: where,
      hash: 'm' + pg.num
    };
  }

  /* ============================================================
     5) Search index
     ============================================================ */
  var SEARCH = [];
  function buildSearchIndex() {
    SEARCH = [];
    PAGES.forEach(function (pg, i) {
      if (pg.type === 'article') {
        var m = getArticleMeta(pg);
        var txt = (pg.kind === 'preamble' ? pg.art.text.join(' \n ') : pg.paras.join(' \n '));
        SEARCH.push({ pi: i, chip: m.chip, title: m.title, where: m.where, text: txt, nt: normalizeArabic(txt) });
      }
    });
  }

  /* ============================================================
     6) Linkify (cross-references)
     ============================================================ */
  function linkify(s) {
    var out = escapeHtml(s);

    /* المادة (N) */
    out = out.replace(/المادة\s*\(\s*(\d+)\s*\)/g, function (m0, d) {
      var n = +d;
      return (n >= 1 && n <= statArticles)
        ? '<a class="xref" href="#law/m' + n + '">المادة (' + toArabicNum(n) + ')</a>'
        : m0;
    });

    /* المادة N من هذا القانون */
    out = out.replace(/المادة\s+(\d+)\s+من هذا القانون/g, function (m0, d) {
      var n = +d;
      return (n >= 1 && n <= statArticles)
        ? '<a class="xref" href="#law/m' + n + '">المادة ' + toArabicNum(n) + ' من هذا القانون</a>'
        : m0;
    });

    /* المواد التمهيدية بأسماء العدد الترتيبي */
    for (var i = 0; i < ORDINALS.length; i++) {
      var re = new RegExp('المادة\\s+' + ORDINALS[i] + '\\s*(?=\\s*(?:من هذا القانون|[,؛.،]))', 'g');
      out = out.replace(re, '<a class="xref" href="#law/t' + (i + 1) + '">المادة ' + ORDINALS[i] + '</a>');
    }
    return out;
  }

  var RE_CLAUSE = /^([٠-٩]{1,3}|[0-9]{1,3})\s*[-–)]\s*(.*)$/;
  var RE_SUB = /^\(?([أ-ي])\)\s+(.*)$/;

  /* ============================================================
     7) Render: article page
     ============================================================ */
  function renderArticle(pg) {
    const L = getLaw();
    var m = getArticleMeta(pg);
    var isPre = pg.kind === 'preamble';
    var paras = isPre ? pg.art.text : pg.paras;
    var h = '';

    h += '<div class="crumbs">';
    if (!isPre) {
      var bk = L.books[pg.book];
      h += '<a class="crumb" href="#law/b' + (pg.book + 1) + '">' + escapeHtml(bk.title) + '</a><span class="crumb sep">›</span>';
      if (pg.chapter >= 0) {
        var ch = bk.chapters[pg.chapter];
        h += '<a class="crumb" href="#law/b' + (pg.book + 1) + '">' + escapeHtml(ch.label + (ch.name ? ': ' + ch.name : '')) + '</a><span class="crumb sep">›</span>';
        if (pg.section >= 0) {
          var sec = ch.sections[pg.section];
          h += '<a class="crumb" href="#law/b' + (pg.book + 1) + '">' + escapeHtml(sec.label.replace(/[()]/g, '').trim() + (sec.name ? ': ' + sec.name : '')) + '</a><span class="crumb sep">›</span>';
        }
      }
    } else {
      h += '<a class="crumb" href="#law/pd">' + escapeHtml(tt('law.preliminary_provisions', 'الأحكام التمهيدية')) + '</a><span class="crumb sep">›</span>';
    }
    h += '<span class="crumb">' + escapeHtml(m.title) + '</span></div>';

    h += '<article class="paper"><div class="art-body" style="padding:0">';
    if (isPre) h += '<div style="text-align:center"><span class="tag-preamble">' + escapeHtml(tt('law.preamble_tag', 'المقدمة التمهيدية للقانون')) + '</span></div>';
    h += '<h2 class="art-title">' + escapeHtml(m.title) + '</h2>';
    h += '<div class="art-sub">' + escapeHtml(m.where) + '</div>';
    h += '<div class="orn" aria-hidden="true"><span class="dia"></span></div>';

    paras.forEach(function (t) {
      var c1 = t.match(RE_CLAUSE);
      if (c1) {
        var label = toArabicNum(toLatinNum(c1[1]));
        var rest = c1[2] || '';
        h += '<div class="clause"><span class="cn">' + label + '</span><div class="ct"><p style="margin:0">' + linkify(rest) + '</p></div></div>';
        return;
      }
      var c2 = t.match(RE_SUB);
      if (c2) {
        h += '<div class="clause"><span class="cn">' + escapeHtml(c2[1]) + '</span><div class="ct"><p style="margin:0">' + linkify(c2[2]) + '</p></div></div>';
        return;
      }
      h += '<p>' + linkify(t) + '</p>';
    });
    h += '</div></article>';
    h += navHtml();
    return h;
  }

  /* ============================================================
     8) Navigation footer
     ============================================================ */
  function navHtml() {
    const TOTAL = PAGES.length;
    var prev = currentIdx > 0 ? PAGES[currentIdx - 1] : null;
    var next = currentIdx < TOTAL - 1 ? PAGES[currentIdx + 1] : null;
    const L = getLaw();

    function lbl(pg, def) {
      if (!pg) return def;
      if (pg.type === 'article') return getArticleMeta(pg).title;
      if (pg.type === 'cover') return tt('law.cover', 'الغلاف');
      if (pg.type === 'intro') return tt('law.intro', 'المقدمة');
      if (pg.type === 'pdivider') return tt('law.preliminary_provisions', 'الأحكام التمهيدية');
      if (pg.type === 'divider') return L.books[pg.book].title;
      return def;
    }

    var h = '<nav class="pnav" aria-label="' + escapeHtml(tt('law.nav_aria', 'التنقل بين الصفحات')) + '">';
    h += '<button class="pbtn prev" id="lawBtnPrev" type="button" ' + (prev ? '' : 'disabled') + '><span>' + escapeHtml(tt('common.prev', 'السابق')) + '</span><small>' + escapeHtml(lbl(prev, '—')) + '</small></button>';
    h += '<form class="goto" id="lawGotoForm"><label for="lawGotoInput">' + escapeHtml(tt('law.go_to_page', 'انتقل لصفحة')) + '</label><input id="lawGotoInput" inputmode="numeric" pattern="[٠-٩0-9]+" value="' + toArabicNum(currentIdx + 1) + '"><button type="submit">' + escapeHtml(tt('law.go', 'اذهب')) + '</button></form>';
    h += '<button class="pbtn next" id="lawBtnNext" type="button" ' + (next ? '' : 'disabled') + '><span>' + escapeHtml(tt('common.next', 'التالي')) + '</span><small>' + escapeHtml(lbl(next, '—')) + '</small></button>';
    h += '</nav>';
    return h;
  }

  /* ============================================================
     9) Render: cover / intro / dividers
     ============================================================ */
  function renderCover() {
    const L = getLaw();
    var total = (L.preamble || []).length + statArticles;
    var h = '<div class="cover"><div class="cover-frame"><span class="co3"></span><span class="co4"></span>';
    h += '<div class="kicker">' + escapeHtml(tt('law.egypt_arab_republic', 'جمهورية مصر العربية')) + '</div>';
    h += '<h1>' + escapeHtml(tt('law.labor_law', 'قانون العمل')) + '</h1>';
    h += '<div class="sub">' + escapeHtml(tt('law.law_no_14_2025', 'رقم ١٤ لسنة ٢٠٢٥ — بإصدار قانون العمل والقانون المرافق')) + '</div>';
    h += '<div class="orn2" aria-hidden="true">◆</div>';
    h += '<div class="meta">' + escapeHtml(tt('law.cover_meta',
      'صدر بالجريدة الرسمية العدد ١٨ (تابع) بتاريخ ٣ مايو ٢٠٢٥ — يعمل به اعتبارًا من ١ سبتمبر ٢٠٢٥')) + '</div>';
    h += '<div class="stats">'
      + '<div class="stat"><b>' + toArabicNum(5) + '</b><span>' + escapeHtml(tt('law.books', 'كتب')) + '</span></div>'
      + '<div class="stat"><b>' + toArabicNum(27) + '</b><span>' + escapeHtml(tt('law.chapters', 'بابًا')) + '</span></div>'
      + '<div class="stat"><b>' + toArabicNum(total) + '</b><span>' + escapeHtml(tt('law.articles', 'مادة')) + '</span></div>'
      + '</div>';
    h += '<div class="cover-actions">'
      + '<a class="cbtn gold" href="#law/intro">' + escapeHtml(tt('law.start_reading', 'ابدأ القراءة')) + '</a>'
      + '<button class="cbtn ghost" id="lawCoverToc" type="button">' + escapeHtml(tt('law.law_index', 'فهرس القانون')) + '</button>'
      + '</div></div></div>';
    h += disclaimerHtml();
    return h;
  }

  function renderIntro() {
    const L = getLaw();
    var total = (L.preamble || []).length + statArticles;
    var h = '<div class="paper">';
    h += '<div class="doc-head">' + escapeHtml(tt('law.intro_doc_head', 'جمهورية مصر العربية — قرر مجلس النواب القانون الآتي نصه، وقد أصدرناه')) + '</div>';
    h += '<h2 class="h2">' + escapeHtml(tt('law.intro', 'المقدمة')) + '</h2>';
    h += '<div class="orn" aria-hidden="true"><span class="dia"></span></div>';
    h += '<p class="intro-p">' + tt('law.intro_p1',
      'يعرض هذا القسم النص الكامل لقانون العمل رقم ١٤ لسنة ٢٠٢٥ الصادر بتاريخ ٣ مايو ٢٠٢٥، والذي يعمل به اعتبارًا من ١ سبتمبر ٢٠٢٥، ويُلغي القانون رقم ١٢ لسنة ٢٠٠٣ بإصدار قانون العمل.') + '</p>';
    h += '<div class="note gold"><b>' + escapeHtml(tt('law.contents', 'محتويات القانون:')) + '</b> ' + toArabicNum(5) + ' ' + escapeHtml(tt('law.books', 'كتب')) + ' — ' + toArabicNum(27) + ' ' + escapeHtml(tt('law.chapters', 'بابًا')) + ' — ' + toArabicNum(total) + ' ' + escapeHtml(tt('law.articles', 'مادة')) + ' (' + toArabicNum(13) + ' ' + escapeHtml(tt('law.preamble', 'تمهيدية')) + ' + ' + toArabicNum(statArticles) + ' ' + escapeHtml(tt('law.in_law', 'في القانون المرافق')) + ').</div>';
    h += '<div class="h3">' + escapeHtml(tt('law.how_to_navigate', 'كيف تتنقل؟')) + '</div>';
    h += '<p class="intro-p">' + tt('law.intro_p2',
      'استخدم أزرار «السابق» و«التالي» أسفل كل صفحة للتنقل خطوة بخطوة، أو اكتب رقم الصفحة في خانة «انتقل لصفحة» ثم اضغط «اذهب». يفتح زر ☰ أعلى الشاشة فهرس القانون الكامل، ويمكنك منه الانتقال مباشرة إلى أي كتاب أو باب أو مادة برقمها، أو البحث في نص القانون بكلمة مفتاحية.') + '</p>';
    h += '<div class="h3">' + escapeHtml(tt('law.five_books', 'الكتب الخمسة')) + '</div>';
    (L.books || []).forEach(function (bk, i) {
      var cnt = 0;
      (bk.articles || []).forEach(function () { cnt++; });
      (bk.chapters || []).forEach(function (ch) {
        (ch.articles || []).forEach(function () { cnt++; });
        (ch.sections || []).forEach(function (s) { (s.articles || []).forEach(function () { cnt++; }); });
      });
      h += '<a class="div-row" href="#law/b' + (i + 1) + '"><span class="dn">' + toArabicNum(i + 1) + '</span><span class="dt"><b>' + escapeHtml(bk.title) + '</b><span>' + escapeHtml(bk.name || '') + ' — ' + toArabicNum(cnt) + ' ' + escapeHtml(tt('law.articles', 'مادة')) + '</span></span><span class="go">‹</span></a>';
    });
    h += '<div class="note gold" style="margin-top:18px"><b>' + escapeHtml(tt('law.disclaimer_title', 'تنويه:')) + '</b> ' + escapeHtml(tt('law.disclaimer_text',
      'هذا التطبيق وسيلة توثيق وقراءة، والنص المعتمد قانونًا هو الصادر في الجريدة الرسمية.')) + '</div>';
    h += '</div>' + navHtml();
    return h;
  }

  function disclaimerHtml() {
    return '<div class="law-disclaimer"><span class="law-disclaimer-ico">!</span><div><b>' +
      escapeHtml(tt('law.disclaimer_title', 'تنويه قانوني:')) + '</b> ' +
      escapeHtml(tt('law.disclaimer_full',
        'هذا التطبيق وسيلة توثيق وقراءة للقانون رقم ١٤ لسنة ٢٠٢٥. النص المعتمد قانونًا هو الصادر في الجريدة الرسمية المصرية. يُرجى الرجوع إلى الجهات الرسمية عند الحاجة للاستخدام القانوني الرسمي.')) +
      '</div></div>';
  }

  function renderPDivider() {
    const L = getLaw();
    var h = '<div class="paper"><div class="divider-hero">';
    h += '<div class="bk">' + escapeHtml(tt('law.labor_law_no_14_2025', 'قانون العمل رقم ١٤ لسنة ٢٠٢٥')) + '</div>';
    h += '<h2>' + escapeHtml(tt('law.preliminary_provisions', 'الأحكام التمهيدية')) + '</h2>';
    h += '<div class="ds">' + escapeHtml(tt('law.preliminary_range', 'المادة الأولى — المادة الثالثة عشرة')) + '</div>';
    h += '</div>';
    h += '<p class="intro-p" style="margin-top:16px">' + escapeHtml(tt('law.preliminary_desc',
      'تضبط هذه المواد نطاق العمل بأحكام القانون والقانون المرافق، والفئات المستثناة منه، واستمرار الصناديق والمجالس القائمة، وقواعد الانتقال للنظام الجديد، ثم إلغاء القانون السابق ونشر القانون وبدء العمل به.')) + '</p>';
    h += '<div class="chiprow">';
    for (var i = 0; i < (L.preamble || []).length; i++) {
      h += '<a class="chip" href="#law/t' + (i + 1) + '">' + ORDINALS[i] + '</a>';
    }
    h += '</div></div>' + navHtml();
    return h;
  }

  function renderDivider(pg) {
    const L = getLaw();
    var bk = pg.bk;
    var h = '<div class="paper"><div class="divider-hero">';
    h += '<div class="bk">' + escapeHtml(tt('law.companion_law', 'القانون المرافق')) + '</div>';
    h += '<h2>' + escapeHtml(bk.title) + '</h2>';
    h += '<div class="ds">' + escapeHtml(bk.name || '') + '</div>';
    h += '<div class="orn" aria-hidden="true" style="margin-bottom:4px"><span class="dia"></span></div>';
    h += '</div>';

    var rows = [];
    if (bk.articles && bk.articles.length) {
      rows.push({ label: tt('law.preliminary_provisions', 'أحكام تمهيدية للكتاب'), name: tt('law.direct_articles', 'المواد المباشرة'), start: bk.articles[0].num, count: bk.articles.length });
    }
    (bk.chapters || []).forEach(function (ch) {
      var cnt = (ch.articles || []).length;
      (ch.sections || []).forEach(function (s) { cnt += (s.articles || []).length; });
      var first = (ch.articles && ch.articles.length) ? ch.articles[0].num
        : (ch.sections && ch.sections.length && ch.sections[0].articles.length ? ch.sections[0].articles[0].num : null);
      rows.push({ label: ch.label, name: ch.name || '', start: first, count: cnt });
    });

    h += '<div class="div-list">';
    rows.forEach(function (r) {
      var href = r.start ? '#law/m' + r.start : '#law/b' + (pg.book + 1);
      h += '<a class="div-row" href="' + href + '"><span class="dn">' + escapeHtml((r.label.split(' ')[1] || r.label).slice(0, 4)) + '</span><span class="dt"><b>' + escapeHtml(r.label) + '</b><span>' + escapeHtml(r.name) + ' — ' + toArabicNum(r.count) + ' ' + escapeHtml(tt('law.articles', 'مادة')) + (r.start ? ' — ' + escapeHtml(tt('law.starts_at', 'تبدأ من المادة')) + ' ' + toArabicNum(r.start) : '') + '</span></span><span class="go">‹</span></a>';
    });
    h += '</div>';

    var chips = [];
    function pushA(a) {
      chips.push('<a class="chip" href="#law/m' + a.num + '" data-art="' + a.num + '">' + toArabicNum(a.num) + '</a>');
    }
    (bk.articles || []).forEach(pushA);
    (bk.chapters || []).forEach(function (ch) {
      (ch.articles || []).forEach(pushA);
      (ch.sections || []).forEach(function (s) { (s.articles || []).forEach(pushA); });
    });
    if (chips.length) {
      h += '<div class="h3">' + escapeHtml(tt('law.articles_of', 'مواد ') + bk.title) + '</div><div class="chiprow">' + chips.join('') + '</div>';
    }
    h += '</div>' + navHtml();
    return h;
  }

  /* ============================================================
     10) Render dispatcher
     ============================================================ */
  var currentIdx = 0;
  var els = {};
  var listenersBound = false;
  var i18nUnsub = null;

  function cacheEls() {
    els.page = document.getElementById('law-page');
    els.toc = document.getElementById('law-toc');
    els.overlay = document.getElementById('law-overlay');
    els.burger = document.getElementById('law-burger');
    els.tocclose = document.getElementById('law-tocclose');
    els.searchbtn = document.getElementById('law-searchbtn');
    els.searchinput = document.getElementById('law-searchinput');
    els.results = document.getElementById('law-tocresults');
    els.tocbody = document.getElementById('law-tocbody');
    els.bar = document.querySelector('#page-law .law-progress .bar');
    els.chip = document.getElementById('law-chip');
    els.back = document.getElementById('law-back');
  }

  function render() {
    const TOTAL = PAGES.length;
    if (!TOTAL || !els.page) return;
    var pg = PAGES[currentIdx];
    var html = '';
    switch (pg.type) {
      case 'cover': html = renderCover(); break;
      case 'intro': html = renderIntro(); break;
      case 'pdivider': html = renderPDivider(); break;
      case 'divider': html = renderDivider(pg); break;
      case 'article': html = renderArticle(pg); break;
    }
    els.page.innerHTML = html;
    els.page.className = pg.type === 'cover' ? 'law-page coverpage' : 'law-page';
    document.title = pg.type === 'article'
      ? (getArticleMeta(pg).title + ' — ' + tt('law.labor_law_14_2025', 'قانون العمل ١٤/٢٠٢٥'))
      : tt('law.doc_title', 'قانون العمل رقم ١٤ لسنة ٢٠٢٥ - النص الكامل');

    if (els.bar) els.bar.style.width = ((currentIdx + 1) / TOTAL * 100) + '%';
    if (els.chip) els.chip.textContent = toArabicNum(currentIdx + 1) + ' / ' + toArabicNum(TOTAL);

    /* wire nav buttons (re-bound on each render) */
    var bp = document.getElementById('lawBtnPrev');
    var bn = document.getElementById('lawBtnNext');
    var gf = document.getElementById('lawGotoForm');
    var gi = document.getElementById('lawGotoInput');
    if (bp) bp.addEventListener('click', function () { goTo(currentIdx - 1); });
    if (bn) bn.addEventListener('click', function () { goTo(currentIdx + 1); });
    if (gf) gf.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = parseInt(toLatinNum(gi.value), 10);
      if (!isNaN(v)) {
        var t2 = v - 1;
        if (t2 < 0) t2 = 0;
        if (t2 > TOTAL - 1) t2 = TOTAL - 1;
        goTo(t2);
      }
    });
    var ct = document.getElementById('lawCoverToc');
    if (ct) ct.addEventListener('click', function () { openToc(); });
    highlightToc();
  }

  /* ============================================================
     11) Navigation
     ============================================================ */
  function goTo(idx, noScroll, noHash) {
    const TOTAL = PAGES.length;
    if (idx < 0 || idx > TOTAL - 1) return;
    currentIdx = idx;
    els.page.dataset.page = String(idx);
    render();
    if (noScroll !== true) {
      try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
    }
    try { localStorage.setItem('shiftpro.law.page', String(currentIdx)); } catch (e) {}

    if (!noHash) {
      var h = PAGEHASH[currentIdx];
      if (h) {
        var newHash = '#law/' + h;
        if (location.hash !== newHash) {
          try { history.pushState({ law: h }, '', newHash); }
          catch (e) {
            try { history.replaceState(null, '', newHash); } catch (e2) {}
          }
        }
      }
    }
  }

  function goToHash(hash) {
    if (!hash) return false;
    hash = hash.replace(/^#?law\//, '');
    if (hash === 'cover' || hash === '') { goTo(HASH['cover'] || 0, false, true); return true; }
    if (HASH.hasOwnProperty(hash)) { goTo(HASH[hash], false, true); return true; }
    var m;
    if ((m = hash.match(/^m(\d+)$/))) {
      var n = +m[1];
      if (n >= 1 && n <= statArticles && HASH['m' + n] !== undefined) {
        goTo(HASH['m' + n], false, true);
        return true;
      }
    }
    return false;
  }

  function handleHash(fullHash) {
    if (!fullHash) return false;
    if (fullHash.indexOf('#law/') === 0 || fullHash.indexOf('law/') === 0) {
      return goToHash(fullHash);
    }
    return false;
  }

  /* ============================================================
     12) Build TOC
     ============================================================ */
  function buildToc() {
    const L = getLaw();
    if (!L || !els.tocbody) return;
    var h = '<div class="law-toc-quick">'
      + '<a class="q-chip" href="#law/cover">' + escapeHtml(tt('law.cover', 'الغلاف')) + '</a>'
      + '<a class="q-chip" href="#law/intro">' + escapeHtml(tt('law.intro', 'المقدمة')) + '</a>'
      + '<a class="q-chip" href="#law/pd">' + escapeHtml(tt('law.preliminary', 'التمهيد')) + '</a>'
      + '</div>';

    (L.books || []).forEach(function (bk, bi) {
      var cnt = 0;
      (bk.articles || []).forEach(function () { cnt++; });
      (bk.chapters || []).forEach(function (ch) {
        (ch.articles || []).forEach(function () { cnt++; });
        (ch.sections || []).forEach(function (s) { (s.articles || []).forEach(function () { cnt++; }); });
      });
      h += '<details class="toc-book"' + (bi === 0 ? ' open' : '') + ' data-book="' + bi + '">';
      h += '<summary><span>' + escapeHtml(bk.title) + '</span><span class="arrow">‹</span></summary>';
      h += '<div class="toc-inner"><span class="b-name">' + escapeHtml(bk.name || '') + ' — ' + toArabicNum(cnt) + ' ' + escapeHtml(tt('law.articles', 'مادة')) + '</span>';

      if (bk.articles && bk.articles.length) {
        h += '<div class="toc-ch">' + escapeHtml(tt('law.preliminary_provisions', 'أحكام تمهيدية للكتاب')) + '</div><div class="chips">';
        bk.articles.forEach(function (a) {
          h += '<a class="chip" href="#law/m' + a.num + '" data-art="' + a.num + '">' + toArabicNum(a.num) + '</a>';
        });
        h += '</div>';
      }

      (bk.chapters || []).forEach(function (ch) {
        h += '<div class="toc-ch">' + escapeHtml(ch.label) + (ch.name ? ' <span class="cn">— ' + escapeHtml(ch.name) + '</span>' : '') + '</div>';
        h += '<div class="chips">';
        (ch.articles || []).forEach(function (a) {
          h += '<a class="chip" href="#law/m' + a.num + '" data-art="' + a.num + '">' + toArabicNum(a.num) + '</a>';
        });
        (ch.sections || []).forEach(function (s) {
          (s.articles || []).forEach(function (a) {
            h += '<a class="chip" href="#law/m' + a.num + '" data-art="' + a.num + '" title="' + escapeHtml(s.label.replace(/[()]/g, '').trim() + (s.name ? ' ' + s.name : '')) + '">' + toArabicNum(a.num) + '</a>';
          });
        });
        h += '</div>';
      });
      h += '</div></details>';
    });

    els.tocbody.innerHTML = h;
  }

  function highlightToc() {
    if (!els.tocbody) return;
    var active = els.tocbody.querySelector('.chip.active');
    if (active) active.classList.remove('active');
    var pg = PAGES[currentIdx];
    var key = null;
    if (pg.type === 'article' && pg.kind !== 'preamble') key = 'm' + pg.num;
    if (key) {
      var el = els.tocbody.querySelector('.chip[data-art="' + key.slice(1) + '"]');
      if (el) {
        el.classList.add('active');
        try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      }
    }
  }

  /* ============================================================
     13) Drawer (open/close)
     ============================================================ */
  var lastFocus = null;

  function openToc() {
    if (!els.toc) return;
    lastFocus = document.activeElement;
    els.toc.classList.add('open');
    els.toc.setAttribute('aria-hidden', 'false');
    if (els.overlay) {
      els.overlay.classList.add('show');
      els.overlay.setAttribute('aria-hidden', 'false');
    }
    if (els.burger) els.burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    try { if (els.tocbody) els.tocbody.scrollTop = 0; } catch (e) {}
    setTimeout(function () {
      if (window.matchMedia('(min-width:1120px)').matches) {
        if (els.searchinput) els.searchinput.focus();
      } else {
        if (els.tocclose) els.tocclose.focus();
      }
    }, 60);
  }

  function closeToc() {
    if (!els.toc) return;
    els.toc.classList.remove('open');
    els.toc.setAttribute('aria-hidden', 'true');
    if (els.overlay) {
      els.overlay.classList.remove('show');
      els.overlay.setAttribute('aria-hidden', 'true');
    }
    if (els.burger) els.burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) {
      try { lastFocus.focus(); } catch (e) {}
    }
  }

  function toggleToc() {
    if (els.toc && els.toc.classList.contains('open')) closeToc();
    else openToc();
  }

  /* ============================================================
     14) Search
     ============================================================ */
  function doSearch(qRaw) {
    if (!els.results) return;
    var q = normalizeArabic(qRaw.trim());
    els.results.innerHTML = '';
    if (q.length < 2) return;

    var numQ = qRaw.trim().replace(/[٠-٩]/g, function (d) { return ARABIC_DIGITS.indexOf(d); }).replace(/[^0-9]/g, '');
    var jumpHtml = '';
    if (numQ !== '' && +numQ >= 1 && +numQ <= statArticles) {
      jumpHtml = '<a class="r-item" href="#law/m' + (+numQ) + '" data-pi="' + HASH['m' + (+numQ)] + '"><span class="r-t">' + escapeHtml(tt('law.jump_to_article', 'الانتقال إلى المادة (') + toArabicNum(+numQ) + ')') + '</span></a>';
    }

    var hits = [];
    for (var i = 0; i < SEARCH.length && hits.length < 40; i++) {
      var idx = SEARCH[i].nt.indexOf(q);
      if (idx >= 0) hits.push({ s: SEARCH[i], at: idx });
    }

    if (!hits.length && !jumpHtml) {
      els.results.innerHTML = '<div class="r-item" style="cursor:default"><span class="r-t">' + escapeHtml(tt('law.no_results', 'لا توجد نتائج مطابقة')) + '</span><span class="r-s">' + escapeHtml(tt('law.try_other_keyword', 'جرّب كلمة أخرى أو رقم مادة')) + '</span></div>';
      return;
    }

    var html = jumpHtml;
    hits.slice(0, 30).forEach(function (hit) {
      var s = hit.s;
      var start = Math.max(0, hit.at - 60);
      var end = Math.min(s.text.length, hit.at + q.length + 110);
      var snip = (start > 0 ? '…' : '') + s.text.slice(start, end).replace(/\n/g, ' … ') + (end < s.text.length ? '…' : '');
      html += '<a class="r-item" href="#law/' + PAGEHASH[s.pi] + '" data-pi="' + s.pi + '"><span class="r-t">' + escapeHtml(s.title) + ' <span style="color:#6b7d75;font-weight:400">— ' + escapeHtml(s.where) + '</span></span><span class="r-s">' + escapeHtml(snip) + '</span></a>';
    });
    els.results.innerHTML = html;
  }

  /* ============================================================
     15) Event handlers (stored so we can remove on deactivate)
     ============================================================ */
  function onBurger() { toggleToc(); }
  function onTocClose() { closeToc(); }
  function onOverlay() { closeToc(); }
  function onSearchBtn() { openToc(); setTimeout(function () { if (els.searchinput) els.searchinput.focus(); }, 80); }
  function onSearchInput(e) { doSearch(e.target.value); }
  function onKeydown(e) {
    /* Only act when law reader is the active tab */
    if (!document.body.dataset.lawActive) return;
    if (e.key === 'Escape' && els.toc && els.toc.classList.contains('open')) {
      closeToc();
      return;
    }
    var tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') goTo(currentIdx + 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') goTo(currentIdx - 1);
  }

  /* delegated click: only fire on internal `#law/...` links so we never
     intercept SHIFTPRO's own hash/links */
  function onDelegatedClick(e) {
    if (!document.body.dataset.lawActive) return;
    var a = e.target.closest ? e.target.closest('a[href^="#law/"]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href) return;
    var hash = href.slice(1); /* includes leading 'law/...' */
    if (goToHash(hash)) {
      e.preventDefault();
      if (window.matchMedia('(max-width:1119.98px)').matches && els.toc && els.toc.classList.contains('open')) {
        closeToc();
      }
    }
  }

  function onHashChange() {
    if (!document.body.dataset.lawActive) return;
    if (location.hash && location.hash.indexOf('#law/') === 0) {
      goToHash(location.hash);
    }
  }

  function onPopState() {
    if (!document.body.dataset.lawActive) return;
    if (!location.hash || location.hash.indexOf('#law/') !== 0) {
      /* Left the law reader — return to SHIFTPRO */
      exitToApp();
    } else {
      goToHash(location.hash);
    }
  }

  function onI18nChange() {
    /* Re-render the current page so labels update */
    if (!document.body.dataset.lawActive) return;
    /* Re-apply dir attribute on the SECTION container (#page-law), not
       the inner #law-page div, because the CSS drawer-positioning rules
       are scoped to #page-law[dir="rtl"] / #page-law[dir="ltr"]. */
    var section = document.getElementById('page-law');
    if (section) section.setAttribute('dir', isRtl() ? 'rtl' : 'ltr');
    /* Rebuild TOC labels */
    buildToc();
    /* Clear any stale search results so they don't intercept clicks
       in the new language direction. */
    if (els.results) els.results.innerHTML = '';
    if (els.searchinput) els.searchinput.value = '';
    /* Close the drawer if it was open so the user starts fresh. */
    closeToc();
    /* Re-render the current page */
    render();
  }

  /* ============================================================
     16) Bind / unbind
     ============================================================ */
  function bindListeners() {
    if (listenersBound) return;
    cacheEls();
    if (els.burger) els.burger.addEventListener('click', onBurger);
    if (els.tocclose) els.tocclose.addEventListener('click', onTocClose);
    if (els.overlay) els.overlay.addEventListener('click', onOverlay);
    if (els.searchbtn) els.searchbtn.addEventListener('click', onSearchBtn);
    if (els.searchinput) els.searchinput.addEventListener('input', onSearchInput);
    if (els.back) els.back.addEventListener('click', onBackClick);

    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('click', onDelegatedClick, true);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onPopState);

    if (global.SPi18n && typeof global.SPi18n.subscribe === 'function') {
      i18nUnsub = global.SPi18n.subscribe(onI18nChange);
    }
    listenersBound = true;
  }

  function unbindListeners() {
    if (!listenersBound) return;
    if (els.burger) els.burger.removeEventListener('click', onBurger);
    if (els.tocclose) els.tocclose.removeEventListener('click', onTocClose);
    if (els.overlay) els.overlay.removeEventListener('click', onOverlay);
    if (els.searchbtn) els.searchbtn.removeEventListener('click', onSearchBtn);
    if (els.searchinput) els.searchinput.removeEventListener('input', onSearchInput);
    if (els.back) els.back.removeEventListener('click', onBackClick);

    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('click', onDelegatedClick, true);
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('popstate', onPopState);

    if (i18nUnsub) { try { i18nUnsub(); } catch (e) {} i18nUnsub = null; }
    listenersBound = false;
  }

  function onBackClick() {
    exitToApp();
  }

  function exitToApp() {
    /* Clear the hash and return to dashboard via SHIFTPRO's navigation */
    try {
      if (location.hash.indexOf('#law/') === 0) {
        history.pushState(null, '', location.pathname + location.search);
      }
    } catch (e) {}
    deactivate();
    if (global.SPApp && typeof global.SPApp.goToTab === 'function') {
      global.SPApp.goToTab('dashboard');
    } else {
      /* Fallback: trigger the dashboard tab button */
      var btn = document.querySelector('.tab-btn[data-tab="dashboard"]');
      if (btn) btn.click();
    }
  }

  /* ============================================================
     17) Boot / activate / deactivate
     ============================================================ */
  var bootedOnce = false;
  function bootOnce() {
    if (bootedOnce) return;
    if (!isReady()) {
      console.error('[SPLaw] window.__LAW__ not found — ensure js/data/*.js load before js/law-reader.js');
      return;
    }
    buildPages();
    buildSearchIndex();
    bootedOnce = true;
  }

  function activate() {
    if (!isReady()) {
      console.error('[SPLaw] activate() called but window.__LAW__ is missing');
      return;
    }
    bootOnce();
    cacheEls();
    bindListeners();
    document.body.dataset.lawActive = '1';
    /* Set the dir on the SECTION (#page-law) so CSS drawer positioning
       rules apply correctly. */
    var section = document.getElementById('page-law');
    if (section) section.setAttribute('dir', isRtl() ? 'rtl' : 'ltr');
    if (els.page) els.page.setAttribute('dir', isRtl() ? 'rtl' : 'ltr');
    /* Build TOC if not built yet or rebuild for i18n */
    buildToc();

    /* Restore from hash or last-saved page */
    var restored = false;
    try {
      if (location.hash && location.hash.indexOf('#law/') === 0) {
        restored = goToHash(location.hash);
      }
      if (!restored) {
        var saved = parseInt(localStorage.getItem('shiftpro.law.page') || '0', 10);
        if (!isNaN(saved) && saved >= 0 && saved < PAGES.length) {
          goTo(saved, true, true);
          restored = true;
        }
      }
    } catch (e) {}
    if (!restored) goTo(0, true, true);
  }

  function deactivate() {
    delete document.body.dataset.lawActive;
    closeToc();
    unbindListeners();
    document.title = tt('app.name', 'ShiftPro') + ' | ' + tt('app.tagline', 'إدارة الورديات والحضور');
  }

  /* ============================================================
     18) Public API
     ============================================================ */
  global.SPLaw = {
    isReady: isReady,
    getStats: getStats,
    activate: activate,
    deactivate: deactivate,
    handleHash: handleHash,
    /* exposed for debugging only */
    _internal: {
      pages: function () { return PAGES.length; },
      search: function () { return SEARCH.length; },
      currentIdx: function () { return currentIdx; }
    }
  };

  /* Boot immediately if __LAW__ is already populated (e.g., when
     scripts were loaded synchronously before this file). Otherwise
     wait for DOMContentLoaded. */
  if (isReady()) {
    bootOnce();
  } else {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootOnce);
    } else {
      bootOnce();
    }
  }
})(window);
