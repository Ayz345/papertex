/* PaperTeX — the home page's behaviour and motion (index.html).

   Needs, in order: js/vendor/gsap.min.js, js/vendor/ScrollTrigger.min.js,
   js/store.js, js/templates.js, js/home.js, js/symbols.js, js/math.js
   (the editor's math engine, for "Try it"). Every part degrades: without
   GSAP the page is static but complete; with prefers-reduced-motion the
   demos show their finished state and nothing moves on its own.

   Parts, top to bottom:
     convert / renderMath   the formula rules used by "Try it" and the plot
     reveals                split headings, fade-ups, hero entrance
     nav                    stuck state, scroll progress, current section
     buttons                ripple on press, magnetic primary buttons
     hero                   the Gaussian integral typing itself
     try                    the editor's MathField, a toolbar, examples typed key by key
     plot                   a function typed and drawn as you scroll
     gallery                pie, histogram, polar, bars, 3D, log axis, area
     data                   table → chart, chart type, fitted model
     how, templates, recent, privacy, desktop, footer */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.remove('no-js');                    // index.html starts as no-js; the GSAP-less branch adds it back
  var gsap = window.gsap;
  var ST = window.ScrollTrigger;
  var PT = window.PT || {};

  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  var REDUCE = mq('(prefers-reduced-motion: reduce)');
  var FINE = mq('(hover: hover) and (pointer: fine)');
  var MOTION = !!(gsap && ST) && !REDUCE;

  if (gsap && ST) gsap.registerPlugin(ST);
  if (!MOTION) root.classList.remove('motion');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  /* =====================================================================
     convert — a small version of the editor's formula rules.
     "alpha^2 + x1 -> inf" → tokens to draw, and "\alpha^2 + x_1 \to \infty".
     ===================================================================== */
  var GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
    tau: 'τ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
  };
  var SYMS = {
    inf: ['∞', '\\infty', 'sym'], partial: ['∂', '\\partial', 'sym'], nabla: ['∇', '\\nabla', 'sym'],
    in: ['∈', '\\in', 'op'], sum: ['∑', '\\sum', 'big'], prod: ['∏', '\\prod', 'big'], int: ['∫', '\\int', 'big']
  };
  var FNS = { sin: 1, cos: 1, tan: 1, log: 1, ln: 1, exp: 1, lim: 1, max: 1, min: 1, det: 1 };
  var OPS = [['->', '→', '\\to'], ['<=', '≤', '\\le'], ['>=', '≥', '\\ge'], ['!=', '≠', '\\neq'], ['+-', '±', '\\pm'],
             ['*', '·', '\\cdot'], ['+', '+', '+'], ['-', '−', '-'], ['=', '=', '='], ['<', '<', '<'], ['>', '>', '>']];
  var ESC = { '{': '\\{', '}': '\\}', '%': '\\%', '&': '\\&', '#': '\\#', '$': '\\$', '\\': '\\backslash ', '~': '\\sim ' };
  // glyphs pasted straight in become commands, so the copied LaTeX compiles under pdfLaTeX
  var GLYPH = { '×': ' \\times ', '÷': ' \\div ', '°': '{}^\\circ' };
  Object.keys(GREEK).forEach(function (k) { GLYPH[GREEK[k]] = '\\' + k + ' '; });
  Object.keys(SYMS).forEach(function (k) { GLYPH[SYMS[k][0]] = SYMS[k][2] === 'op' ? ' ' + SYMS[k][1] + ' ' : SYMS[k][1] + ' '; });
  // glyphs with an ASCII spelling are read as that spelling, so they behave the same: e^−x is e^{-x}
  var IN = { '²': '^2', '³': '^3', '−': '-', '±': '+-', '·': '*', '≤': '<=', '≥': '>=', '≠': '!=', '→': '->' };

  function convert(src) {
    var str = String(src || '').replace(/[²³−±·≤≥≠→]/g, function (m) { return IN[m]; }), i = 0;
    function tok(text, kind, lv, sh) { return { text: text, kind: kind, lv: lv, sh: sh, over: false }; }
    function isL(c) { return /[A-Za-z]/.test(c); }
    function isD(c) { return /[0-9]/.test(c); }
    function isScr(c) { return c === '^' || c === '_'; }
    function wrap(t) { return t.length === 1 && t !== "'" ? t : '{' + t + '}'; }
    function join(parts) {
      var out = '';
      parts.forEach(function (p) {
        if (/\\[A-Za-z]+$/.test(out) && /^[A-Za-z0-9]/.test(p)) out += ' ';
        out += p;
      });
      return out.replace(/ {2,}/g, ' ').trim();
    }
    // a sign is a sign, not a binary operator, at the start and after =, ( or another operator
    function signAllowed(toks) {
      var lt = toks[toks.length - 1];
      return !lt || lt.kind === 'op' || lt.kind === 'big' || lt.text === '(' || lt.text === ',';
    }
    // Scripts hang off the thing before them as one group, so x_1^2 stacks and
    // a big operator can carry its bounds: ∑ and lim above and below, ∫ at its side.
    function attach(toks, c, kids, lv, fresh) {
      var lt = toks[toks.length - 1];
      var sc = !fresh && lt && lt.kind === 'scripts' ? lt : null;
      if (!sc) {
        var nuc = !fresh && lt ? lt : null;
        sc = { kind: 'scripts', text: '', lv: lv, sh: 0, over: false, sup: [], sub: [],
               tall: !!(nuc && nuc.kind === 'big'),
               limits: !!(nuc && ((nuc.kind === 'big' && nuc.text !== '∫') || (nuc.kind === 'fn' && nuc.text === 'lim'))) };
        toks.push(sc);
      }
      Array.prototype.push.apply(c === '^' ? sc.sup : sc.sub, kids);
      sc.text = keyOf(sc.sup) + '|' + keyOf(sc.sub);       // lets the drawing tell what changed
    }
    function keyOf(list) { return list.map(function (t) { return t.kind === 'scripts' ? '[' + t.text + ']' : t.text; }).join(''); }
    function seq(lv, sh, stop) {
      var toks = [], tex = [], used = '', depth = 0;  // `used`: scripts the current nucleus already has
      while (i < str.length) {
        var c = str[i];
        if (stop && c === stop && !depth) { i++; break; }
        if (stop === ')' && (c === '(' || c === ')')) depth += c === '(' ? 1 : -1;   // e^((x+1)/2) keeps its inner pair
        if (c === ' ') { i++; continue; }
        if (isScr(c)) {
          i++;
          // x^a^b would be a double superscript; x'^2 is fine, the prime joins the superscript
          var gapped = false;
          if (used.indexOf(c) >= 0 && !(c === '^' && tex[tex.length - 1] === "'")) { tex.push('{}'); used = ''; gapped = true; }
          used += c;
          var g = group(lv + 1, 0, c);
          attach(toks, c, g.toks, lv, gapped);
          tex.push(c + wrap(g.tex));
          continue;
        }
        var u = unit(lv, sh, signAllowed(toks));
        toks = toks.concat(u.toks);
        tex.push(u.tex);
        if (u.tex === "'") {                         // a prime is a superscript to TeX: x^2' needs x^2{}'
          if (used.indexOf('^') >= 0 && tex[tex.length - 2] !== "'") { tex.splice(tex.length - 1, 0, '{}'); used = ''; }
          if (used.indexOf('^') < 0) used += '^';
        } else used = u.scr || '';
      }
      return { toks: toks, tex: join(tex) };
    }
    // what a ^ or _ applies to: (a group), or the next unit — and only the
    // same kind of script chains on, so e^-x^2 is e^{-x^2} but x_1^2 stays x_1^2
    function group(lv, sh, kind) {
      if (i >= str.length || isScr(str[i])) return { toks: [], tex: '' };
      if (str[i] === '(') { i++; return seq(lv, sh, ')'); }
      while (str[i] === ' ') i++;
      if (i >= str.length || isScr(str[i])) return { toks: [], tex: '' };
      var u = unit(lv, sh, true);
      if ((u.tex === '-' || u.tex === '+') && i < str.length && str[i] !== ' ' && !isScr(str[i])) {   // e^-x is e^{-x}
        var u2 = unit(lv, sh, false);
        u = { toks: u.toks.concat(u2.toks), tex: u.tex + u2.tex, scr: u2.scr };
      }
      var used = u.scr || '';
      while (kind && i < str.length && str[i] === kind) {
        var c2 = str[i++];
        var g2 = group(lv + 1, 0, c2);
        var gap = used.indexOf(c2) >= 0 ? '{}' : '';
        used = gap ? c2 : used + c2;
        attach(u.toks, c2, g2.toks, lv, !!gap);
        u = { toks: u.toks, tex: u.tex + gap + c2 + wrap(g2.tex) };
      }
      return u;
    }
    function unit(lv, sh, first) {
      var c = str[i];
      for (var o = 0; o < OPS.length; o++) {
        var op = OPS[o];
        if (str.substr(i, op[0].length) === op[0]) {
          i += op[0].length;
          var unary = first && (op[0] === '-' || op[0] === '+' || op[0] === '+-');
          return { toks: [tok(op[1], unary ? 'sym' : 'op', lv, sh)], tex: unary ? op[2] : ' ' + op[2] + ' ' };
        }
      }
      if (c === '√') {                               // a pasted root sign works like sqrt
        i++;
        var rg = group(lv, sh);
        rg.toks.forEach(function (t) { t.over = true; });
        return { toks: [tok('√', 'sym', lv, sh)].concat(rg.toks), tex: '\\sqrt{' + rg.tex + '}' };
      }
      if (isD(c)) {
        var n = '';
        while (i < str.length && (isD(str[i]) || (str[i] === '.' && isD(str[i + 1] || '')))) n += str[i++];
        return { toks: [tok(n, 'num', lv, sh)], tex: n };
      }
      if (isL(c)) {
        var w = '', d = '', toks = [], tex = '';
        while (i < str.length && isL(str[i])) w += str[i++];
        if (w !== 'sqrt') while (i < str.length && isD(str[i])) d += str[i++];   // sqrt2 is √2, not √ with a lost 2
        if (w === 'sqrt') {
          var rad = group(lv, sh);
          rad.toks.forEach(function (t) { t.over = true; });
          return { toks: [tok('√', 'sym', lv, sh)].concat(rad.toks), tex: '\\sqrt{' + rad.tex + '}' };
        } else if (GREEK[w]) {
          toks.push(tok(GREEK[w], w[0] === w[0].toLowerCase() ? 'var' : 'sym', lv, sh)); tex = '\\' + w;
        } else if (SYMS[w]) {
          toks.push(tok(SYMS[w][0], SYMS[w][2], lv, sh));
          tex = SYMS[w][2] === 'op' ? ' ' + SYMS[w][1] + ' ' : SYMS[w][1];
        } else if (FNS[w]) {
          toks.push(tok(w, 'fn', lv, sh)); tex = '\\' + w;
        } else {
          for (var k = 0; k < w.length; k++) toks.push(tok(w[k], 'var', lv, sh));
          tex = w;
        }
        if (d) {                                       // x1 is x_1
          attach(toks, '_', [tok(d, 'num', lv + 1, 0)], lv, false);
          tex += '_' + wrap(d);
        }
        return { toks: toks, tex: tex, scr: d ? '_' : '' };
      }
      i++;
      return { toks: [tok(c, 'sym', lv, sh)], tex: ESC[c] || GLYPH[c] || c, scr: c === '°' ? '^' : '' };
    }
    try {
      return seq(0, 0, null);
    } catch (e) {
      return { toks: [tok(str, 'sym', 0, 0)], tex: str };
    }
  }

  /* Draw tokens into `box`. Tokens from the first one that changed onward
     pop in, so typing "alph" → "alpha" makes the α arrive, not the line.
     Scripts are drawn stacked: beside their nucleus, or above and below it
     for ∑, ∏ and lim, as TeX sets them in a display. */
  var SIZES = [1, 0.7, 0.5];
  function drawTok(t, base) {
    var size = base * SIZES[Math.min(t.lv, 2)];
    if (t.kind === 'scripts') {
      var el = h('span', 't t--scripts' + (t.over ? ' t--over' : ''));
      el.style.cssText = 'display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1;padding-right:.08em' + (t.tall ? ';margin-left:-.05em;padding-left:.18em' : '');
      var up = h('span', 't__up'), dn = h('span', 't__dn');
      t.sup.forEach(function (c) { up.appendChild(drawTok(c, base)); });
      t.sub.forEach(function (c) { dn.appendChild(drawTok(c, base)); });
      if (t.sup.length) el.appendChild(up);
      if (t.sub.length) el.appendChild(dn);
      // the box's baseline is its first row's: raise a superscript, drop a lone subscript
      var both = t.sup.length && t.sub.length;
      var lift = t.tall ? 0.78 : both ? 0.34 : 0.42;
      el.style.verticalAlign = r1((t.sup.length ? lift : -0.24) * size) + 'px';
      if (both) dn.style.marginTop = r1((t.tall ? 0.62 : -0.06) * size) + 'px';
      return el;
    }
    var s2 = h('span', 't t--' + t.kind + (t.over ? ' t--over' : ''), t.text);
    s2.style.fontSize = r1(size * (t.kind === 'big' ? 1.05 : 1)) + 'px';
    if (t.kind === 'op') s2.style.padding = t.lv === 0 ? '0 .22em' : '0 .1em';
    if (t.kind === 'fn') s2.style.paddingRight = '.14em';
    if (t.kind === 'big') s2.style.padding = '0 .12em';
    return s2;
  }
  function renderMath(box, toks, prev, base, animate) {
    var first = 0;
    while (first < toks.length && prev && prev[first] &&
           prev[first].text === toks[first].text && prev[first].kind === toks[first].kind &&
           prev[first].lv === toks[first].lv && prev[first].over === toks[first].over) first++;
    box.textContent = '';
    // one inline line inside the (flex) box, so vertical offsets of scripts apply
    var line = h('span', 'mline');
    line.style.cssText = 'display:inline-block;max-width:100%;line-height:1.25;text-align:center';
    box.appendChild(line);
    var nodes = [];
    toks.forEach(function (t, n) {
      var el = drawTok(t, base);
      var before = nodes[n - 1];
      if (t.kind === 'scripts' && t.limits && before) {
        // bounds above and below: the nucleus moves into a centred column with them
        var col = h('span', 't t--limits');
        col.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1.05;margin:0 .1em';
        var up = el.querySelector('.t__up'), dn = el.querySelector('.t__dn');
        col.appendChild(up || h('span'));
        col.appendChild(before);
        col.appendChild(dn || h('span'));
        if (dn && up) dn.style.marginTop = '0';
        line.appendChild(col);
        nodes[n - 1] = col; nodes[n] = null;
        return;
      }
      line.appendChild(el);
      nodes[n] = el;
    });
    var fresh = [];
    nodes.forEach(function (el, n) { if (el && n >= Math.max(0, first - 1) && (n >= first || (toks[n + 1] && toks[n + 1].limits && n + 1 >= first))) fresh.push(el); });
    if (animate && MOTION && fresh.length && fresh.length <= 12) {
      gsap.fromTo(fresh, { yPercent: 45, scale: 0.55, autoAlpha: 0 },
        { yPercent: 0, scale: 1, autoAlpha: 1, duration: 0.42, ease: 'back.out(2.4)', stagger: 0.035, overwrite: true });
    }
    return toks;
  }

  /* =====================================================================
     reveals
     ===================================================================== */
  function splitWords(el) {
    var words = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var w = h('span', 'w'), inner = h('span', null, part);
            w.appendChild(inner);
            frag.appendChild(w);
            words.push(inner);
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    })(el);
    return words;
  }

  function setupReveals() {
    $$('[data-split]').forEach(function (el) {
      if (el.classList.contains('hero__title')) return;          // the hero has its own entrance
      var words = splitWords(el);
      gsap.set(el, { autoAlpha: 1 });
      gsap.fromTo(words, { yPercent: 115, rotate: 3 }, {
        yPercent: 0, rotate: 0, duration: 0.9, ease: 'power4.out', stagger: 0.045,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
    // Held back with opacity, not visibility, so Tab and screen readers still reach it;
    // transforms are cleared afterwards so CSS hover/press states work again.
    ST.batch('[data-reveal]', {
      start: 'top 90%', once: true,
      onEnter: function (els) {
        gsap.fromTo(els, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.09, overwrite: true, clearProps: 'transform' });
      }
    });
    // anything reached by keyboard before its scroll trigger fires shows at once
    document.addEventListener('focusin', function (e) {
      var r = e.target.closest && e.target.closest('[data-reveal], .tpl, .how__step, .os__item, .doc-card');
      if (r && parseFloat(getComputedStyle(r).opacity) < 1) gsap.set(r, { opacity: 1, clearProps: 'transform' });
    });
  }

  function heroEntrance(done) {
    var title = $('.hero__title');
    var words = splitWords(title);
    gsap.set(title, { autoAlpha: 1 });
    var tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.call(done, null, 0.45);                       // the typing starts while the page is still landing
    tl.fromTo(words, { yPercent: 120, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 1.05, stagger: 0.06 }, 0.1)
      .fromTo('[data-hero]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.35)
      .fromTo('[data-hero-sheet]', { autoAlpha: 0, y: 80, rotateX: 14, transformOrigin: '50% 100%' },
        { autoAlpha: 1, y: 0, rotateX: 0, duration: 1.2, ease: 'expo.out' }, 0.2)
      .fromTo('[data-hero-code]', { autoAlpha: 0, x: 70, z: 40 }, { autoAlpha: 1, x: 0, z: 40, duration: 1.1, ease: 'expo.out' }, 0.55);
  }

  /* =====================================================================
     nav — stuck state, scroll progress, which section you're in
     ===================================================================== */
  function setupNav() {
    var nav = $('.nav');
    var ind = $('.nav__ind');
    var links = $$('.nav__links a[href^="#"]');
    var current = null;

    function moveInd(link, now) {
      if (!ind) return;
      if (!link) { gsap.to(ind, { opacity: 0, duration: MOTION ? 0.25 : 0, overwrite: 'auto' }); return; }
      gsap.to(ind, { x: link.offsetLeft + 12, width: link.offsetWidth - 24, opacity: 1, duration: (now || !MOTION) ? 0 : 0.45, ease: 'power3.out', overwrite: 'auto' });
    }
    function setCurrent(link) {
      if (current === link) return;
      if (current) current.classList.remove('is-current');
      current = link;
      if (link) link.classList.add('is-current');
      moveInd(link);
    }

    // onUpdate, not onToggle: a page restored at the very bottom never "toggles", it just is past the start
    ST.create({ start: 12, end: 'max', onUpdate: function (self) { nav.classList.toggle('is-stuck', self.progress > 0); } });
    gsap.to('.progress__bar', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.25 } });

    var targets = { '#plot': ['#plot', '#data'] };
    links.forEach(function (link) {
      var ids = targets[link.getAttribute('href')] || [link.getAttribute('href')];
      ids.forEach(function (id) {
        var sec = $(id);
        if (!sec) return;
        ST.create({
          trigger: sec, start: 'top 55%', end: 'bottom 55%',
          onToggle: function (self) {
            if (self.isActive) setCurrent(link);
            else if (current === link) setCurrent(null);
          }
        });
      });
      if (FINE) {
        link.addEventListener('mouseenter', function () { moveInd(link); });
        link.addEventListener('mouseleave', function () { moveInd(current); });
      }
    });
    window.addEventListener('resize', function () { moveInd(current, true); });
  }

  /* =====================================================================
     buttons — every press leaves a ripple; primary buttons lean toward
     the pointer
     ===================================================================== */
  function setupButtons() {
    document.addEventListener('pointerdown', function (e) {
      var b = e.target.closest && e.target.closest('.btn, .chip');
      if (!b || e.button > 0) return;
      var rect = b.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 2.2;
      var dot = h('span', 'ripple');
      dot.style.width = dot.style.height = size + 'px';
      dot.style.left = (e.clientX - rect.left - size / 2) + 'px';
      dot.style.top = (e.clientY - rect.top - size / 2) + 'px';
      b.appendChild(dot);
      if (REDUCE) {                                   // reduced motion: a quick flash, no spreading circle
        gsap.fromTo(dot, { scale: 1, opacity: 0.2 }, { opacity: 0, duration: 0.25, onComplete: function () { dot.remove(); } });
      } else {
        gsap.fromTo(dot, { scale: 0, opacity: 0.28 }, { scale: 1, opacity: 0, duration: 0.7, ease: 'power2.out', onComplete: function () { dot.remove(); } });
      }
    });

    if (!FINE || !MOTION) return;
    $$('[data-magnetic]').forEach(function (b) {
      var holder = h('span', 'mag');                  // move a wrapper, so the button keeps its own hover/press
      holder.style.display = 'inline-flex';
      holder.style.alignSelf = getComputedStyle(b).alignSelf;   // measure the pull from the button, not a stretched box
      b.parentNode.insertBefore(holder, b);
      holder.appendChild(b);
      var xTo = gsap.quickTo(holder, 'x', { duration: 0.5, ease: 'power3.out' });
      var yTo = gsap.quickTo(holder, 'y', { duration: 0.5, ease: 'power3.out' });
      holder.addEventListener('mousemove', function (e) {
        var r = holder.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.22);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.3);
      });
      holder.addEventListener('mouseleave', function () {
        gsap.to(holder, { x: 0, y: 0, duration: 0.8, ease: 'elastic.out(1, 0.45)', overwrite: true });
      });
    });
  }

  /* =====================================================================
     hero — the Gaussian integral types itself, and its LaTeX with it
     ===================================================================== */
  function setupHero(startNow) {
    var box = $('#eqbox');
    if (!box) return null;
    var keys = $('#eqKeys'), state = $('#eqState'), caret = $('#eqCaret');
    var intG = $('#eqInt'), body = $('#eqBody'), rest = $('#eqRest'), rad = $('#eqRad');
    var slotUp = $('#slotUp'), slotLo = $('#slotLo'), limUp = $('#limUp'), limLo = $('#limLo');
    var eq = box.querySelector('.eq');
    var TX = ['\\int_{', '-\\infty', '}^{', '\\infty', '}', ' e^{-x^2}', '\\,dx = \\sqrt{\\pi}'];
    var tx = TX.map(function (_, n) { return $('#tx' + n); });

    function caretAfter(el) {
      if (el) el.after(caret); else eq.insertBefore(caret, intG);
    }
    function active(slot) {
      slotUp.classList.toggle('is-active', slot === 'up');
      slotLo.classList.toggle('is-active', slot === 'lo');
    }
    function reset() {
      tx.forEach(function (t) { t.textContent = ''; });
      keys.textContent = '';
      box.classList.remove('is-done');
      state.textContent = 'Editing';
      active(null);
      caretAfter(null);
    }
    function typeTo(tl, el, str, dur, pos) {
      var o = { n: 0 };
      tl.to(o, { n: str.length, duration: dur, ease: 'none', onUpdate: function () { el.textContent = str.slice(0, Math.round(o.n)); } }, pos);
    }
    function keysTo(tl, str, dur, pos) {
      tl.call(function () { keys.textContent = ''; }, null, pos);
      typeTo(tl, keys, str, dur, pos);
    }
    var pop = { autoAlpha: 1, scale: 1, y: 0, x: 0, duration: 0.5, ease: 'back.out(2.2)', immediateRender: false };

    if (!gsap) {                                     // no GSAP: the finished equation and its source, standing still
      tx.forEach(function (t, n) { t.textContent = TX[n]; });
      box.classList.add('is-done');
      state.textContent = '✓ Done';
      caret.style.visibility = 'hidden';
      return null;
    }

    // every piece that pops in, including the parts a staggered tween reaches late
    var hidden0 = [intG, body, rest, limUp, limLo, slotUp, slotLo, body.querySelector('.eq__sup')]
      .concat(Array.prototype.slice.call(rest.children));

    var tl = gsap.timeline({ repeat: -1, paused: true });
    tl.call(reset, null, 0)
      .set(hidden0, { autoAlpha: 0 }, 0)
      .set(rad, { '--bar': 0 }, 0)
      .set(caret, { autoAlpha: 1 }, 0);

    // int  →  ∫ with two empty limits, caret in the lower one
    keysTo(tl, 'int', 0.42, 0.5);
    tl.fromTo(intG, { autoAlpha: 0, scale: 0.4 }, Object.assign({}, pop, { duration: 0.6 }), 1.05)
      .call(function () { active('lo'); caretAfter(intG); }, null, 1.05)
      .set(caret, { autoAlpha: 0 }, 1.05)
      .fromTo([slotUp, slotLo], { autoAlpha: 0, scale: 0 }, Object.assign({}, pop, { stagger: 0.08 }), 1.25);
    typeTo(tl, tx[0], TX[0], 0.3, 1.1);
    typeTo(tl, tx[2], TX[2], 0.2, 1.4);
    typeTo(tl, tx[4], TX[4], 0.08, 1.6);

    // -inf ↵  →  lower limit, caret moves up
    keysTo(tl, '-inf ↵', 0.55, 2.1);
    tl.to(slotLo, { autoAlpha: 0, scale: 0.4, duration: 0.2 }, 2.7)
      .fromTo(limLo, { autoAlpha: 0, y: 8, scale: 0.5 }, pop, 2.72)
      .call(function () { active('up'); }, null, 2.72);
    typeTo(tl, tx[1], TX[1], 0.4, 2.72);

    // inf ↵  →  upper limit, caret into the integrand
    keysTo(tl, 'inf ↵', 0.45, 3.5);
    tl.to(slotUp, { autoAlpha: 0, scale: 0.4, duration: 0.2 }, 4.0)
      .fromTo(limUp, { autoAlpha: 0, y: -8, scale: 0.5 }, pop, 4.02)
      .call(function () { active(null); }, null, 4.02)
      .set(caret, { autoAlpha: 1 }, 4.1);
    typeTo(tl, tx[3], TX[3], 0.35, 4.02);

    // e^-x^2
    keysTo(tl, 'e^-x^2', 0.6, 4.7);
    tl.fromTo(body, { autoAlpha: 0, x: -10, scale: 0.7 }, pop, 5.35)
      .fromTo(body.querySelector('.eq__sup'), { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'back.out(3)', immediateRender: false }, 5.5)
      .call(function () { caretAfter(body); }, null, 5.35);
    typeTo(tl, tx[5], TX[5], 0.5, 5.35);

    // dx = sqrt pi
    keysTo(tl, 'dx = sqrt pi', 0.95, 6.15);
    tl.fromTo(rest, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, immediateRender: false }, 7.15)
      .fromTo(rest.children, { autoAlpha: 0, y: 10, scale: 0.6 }, Object.assign({}, pop, { stagger: 0.12 }), 7.15)
      .to(rad, { '--bar': 1, duration: 0.45, ease: 'power2.out' }, 7.55)
      .call(function () { caretAfter(rest); }, null, 7.15);
    typeTo(tl, tx[6], TX[6], 0.75, 7.15);

    // done — hold, then clear for the next pass
    tl.call(function () { box.classList.add('is-done'); state.textContent = '✓ Done'; keys.textContent = ''; }, null, 8.2)
      .set(caret, { autoAlpha: 0 }, 8.2)
      .addLabel('done', 8.25)
      .fromTo(eq, { scale: 1 }, { scale: 1.04, duration: 0.25, yoyo: true, repeat: 1, ease: 'power1.inOut', immediateRender: false }, 8.2)
      .to([intG, body, rest], { autoAlpha: 0, y: -6, duration: 0.35, stagger: 0.05 }, 12.4)
      .set([intG, body, rest], { y: 0 }, 12.9)
      .to({}, { duration: 0.1 }, 12.9);
    tl.timeScale(1.75);                              // brisk typing; the finished equation still holds ~2.4 s

    // Plays once started (as the entrance lands), never while scrolled away.
    var started = false, offscreen = false;
    var demoEl = $('#heroDemo');
    function sync() { tl.paused(!started || offscreen); }

    if (!MOTION) {                                   // reduced motion: the finished equation, standing still
      tl.seek('done', false);
      tl.pause();
      return tl;
    }
    ST.create({
      trigger: demoEl, start: 'top bottom', end: 'bottom top',
      onToggle: function (self) { offscreen = !self.isActive; sync(); }
    });
    reset();
    gsap.set(hidden0, { autoAlpha: 0 });
    gsap.set(rad, { '--bar': 0 });
    tl.start = function () { started = true; tl.restart(); sync(); };
    if (startNow) tl.start();

    // the page tilts toward the pointer, and drifts as you scroll away
    var tilt = $('#heroTilt');
    if (FINE) {
      var rx = gsap.quickTo(tilt, 'rotationX', { duration: 0.8, ease: 'power3.out' });
      var ry = gsap.quickTo(tilt, 'rotationY', { duration: 0.8, ease: 'power3.out' });
      var demo = $('#heroDemo');
      demo.addEventListener('mousemove', function (e) {
        var r = demo.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 9);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 7);
      });
      demo.addEventListener('mouseleave', function () { rx(0); ry(0); });
    }
    // as you scroll away the page lifts and the code card slides off it, never over the text
    gsap.to('.hero__code', { y: 70, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__sheet', { y: -30, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    return tl;
  }

  /* =====================================================================
     try it — the editor's own equation box (js/math.js MathField). Type
     int and fill its bounds, / for a fraction, Tab to move on; the
     examples are typed into it key by key, the way you would.
     ===================================================================== */
  var EXAMPLES = {
    int01: ['int', '0', 'Tab', '1', 'Tab', 'x^2', ' ', 'dx=1/3'],
    gauss: ['int', '-inf', 'Tab', 'inf', 'Tab', 'e^-x^2', '  ', 'dx=sqrtpi'],
    basel: ['sum', 'k=1', 'Tab', 'inf', 'Tab', '1/k^2', '  ', '=pi^2', ' ', '/6'],
    lim: ['lim', 'n->inf', '  ', '(1+1/n', '  ', ')^n', ' ', '=e'],
    matrix: ['A=matrix', 'a', 'Tab', 'b', 'Tab', 'c', 'Tab', 'd'],
    pyth: ['c=', 'sqrt', 'a^2', ' ', '+b^2']
  };
  function setupTry() {
    var M = PT.math, field = $('#tryField');
    if (!field) return;
    var sheet = $('#trySheet'), texEl = $('#tryTex'), typed = $('#tryTyped');
    var copyBtn = $('#tryCopy'), clearBtn = $('#tryClear'), bar = $('#tryBar');
    if (!M || !M.MathField) {                         // the math engine didn't load: say so plainly
      field.textContent = 'The formula box needs JavaScript.';
      return;
    }

    var lastTex = null, auto = null, replaying = false;
    var mf = new M.MathField(field, {
      onChange: update,
      onRender: function (f) { empty(f); follow(); },
      /* Tab past the last slot, or Esc, leaves the box for the Copy button:
         the keyboard is never trapped in the formula */
      onLeave: function (f, dir) { if (dir === 'next') copyBtn.focus(); },
      onEscape: function () { copyBtn.focus(); }
    });
    function empty(f) {                              // also called from the constructor, before mf is set
      f = f || mf;
      if (f) sheet.classList.toggle('is-empty', !f.root.k.length && !f.focused);
    }
    /* a formula wider than the box scrolls with the caret, so what you type
       is always in view */
    function follow() {
      var c = field.querySelector('.mcaret');
      if (!c) return;
      var fr = field.getBoundingClientRect(), cr = c.getBoundingClientRect();
      if (cr.right > fr.right - 16) field.scrollLeft += cr.right - fr.right + 32;
      else if (cr.left < fr.left + 16) field.scrollLeft -= fr.left - cr.left + 32;
    }
    function focusedNow() { return mf.hasFocus ? mf.hasFocus() : document.activeElement === field; }
    function update() {
      var tex = mf.tex();
      empty();
      if (tex === lastTex) return;
      lastTex = tex;
      /* one line, so a matrix does not make the bar jump taller; the end,
         where the typing is, stays in view */
      texEl.textContent = (tex || ' ').replace(/\s*\n\s*/g, ' ');
      texEl.scrollLeft = texEl.scrollWidth;
      if (MOTION) { texEl.classList.remove('flash'); void texEl.offsetWidth; texEl.classList.add('flash'); }
    }

    /* the keys, as they are pressed — yours, or an example's */
    var KEYNAME = { ' ': 'Space', Tab: 'Tab', Enter: '↵', Backspace: '⌫', Delete: 'Del', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc' };
    var run = null;
    function showKey(k) {
      if (typed.querySelector('.try__typed-l')) typed.textContent = '';
      if (k.length === 1 && k !== ' ') {
        if (!run) { run = h('span', 'try__run'); typed.appendChild(run); }
        run.textContent += k;
        if (run.textContent.length > 24) run.textContent = '…' + run.textContent.slice(-23);   // never wider than the sheet
      } else if (KEYNAME[k]) {
        run = null;
        typed.appendChild(h('kbd', null, KEYNAME[k]));
      } else return;
      while (typed.childNodes.length > 14) typed.removeChild(typed.firstChild);
    }
    function clearKeys(label) {
      typed.textContent = ''; run = null;
      if (label) typed.appendChild(h('span', 'try__typed-l', label));
    }
    field.addEventListener('keydown', function (e) {
      if (e.isTrusted) stop();
      if (!e.ctrlKey && !e.metaKey) showKey(e.key);
    });
    field.addEventListener('mousedown', function () { stop(); });
    sheet.addEventListener('mousedown', function (e) {   // anywhere on the sheet: into the formula
      if (e.target.closest('.try__mf, button, input')) return;
      e.preventDefault();
      stop();
      field.focus({ preventScroll: true });
    });

    /* the toolbar: the same structures as the editor's palette */
    bar.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });   // keep the caret where it is
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b === clearBtn) return;
      stop();
      if (document.activeElement !== field) field.focus({ preventScroll: true });
      var name = b.getAttribute('data-build'), sy = b.getAttribute('data-sym');
      if (name) mf.insertBuild(name);
      else if (sy && PT.symbols && PT.symbols.byCmd[sy]) {
        var it = PT.symbols.byCmd[sy];
        mf.insertNode(M.sym(it.tex, it.d, it.cls, it.f));
      }
      if (MOTION) gsap.fromTo(field.querySelector('.mroot'), { scale: 0.97 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', clearProps: 'transform' });
    });
    clearBtn.addEventListener('click', function () {
      stop();
      var root = field.querySelector('.mroot');
      function wipe() { mf.setRoot(M.row()); update(); clearKeys(); field.focus({ preventScroll: true }); }
      if (MOTION && root && mf.root.k.length) gsap.to(root, { opacity: 0, y: -10, scale: 0.92, duration: 0.22, ease: 'power2.in', onComplete: wipe });
      else wipe();
    });

    /* examples: typed key by key into the real field */
    /* between an example's words the strip of typed keys starts a new run,
       so "int" and its "0" do not read as one word "int0" */
    var BRK = '\n';
    function press(k) {
      if (k === BRK) { run = null; return; }
      field.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    }
    function keysOf(name) {
      var out = [];
      EXAMPLES[name].forEach(function (tok) {
        if (out.length) out.push(BRK);
        if (tok === 'Tab') out.push('Tab'); else for (var i = 0; i < tok.length; i++) out.push(tok[i]);
      });
      return out;
    }
    function chips(name) {
      $$('.chip[data-ex]').forEach(function (c) { c.classList.toggle('is-on', c.getAttribute('data-ex') === name); });
    }
    function stop() {
      if (auto) { auto.kill(); auto = null; }
      if (replaying) { replaying = false; if (!focusedNow()) { mf.focused = false; mf.render(); } }
      chips(null);
    }
    function play(name, takeFocus) {
      stop();
      var keys = keysOf(name);
      mf.setRoot(M.row());
      clearKeys();
      chips(name);
      if (takeFocus) field.focus({ preventScroll: true });
      else { mf.focused = true; }                   // show the caret without taking the page's focus
      replaying = true;
      if (!MOTION) {
        keys.forEach(press);
        finish();
        return;
      }
      auto = gsap.timeline({ onComplete: finish });
      var at = 0.15;
      keys.forEach(function (k) {
        auto.call(press, [k], at);
        if (k !== BRK) at += (k === 'Tab' || k === ' ') ? 0.3 : 0.075;
      });
      auto.to({}, { duration: 0.2 }, at);
    }
    function finish() {
      auto = null;
      replaying = false;
      chips(null);
      if (!focusedNow()) { mf.focused = false; mf.render(); }
      update();
    }
    $$('.chip[data-ex]').forEach(function (chip) {
      chip.addEventListener('click', function () { play(chip.getAttribute('data-ex'), true); });
    });

    /* phones and tablets: math.js gives every formula, this one included, a
       hidden text box for the on-screen keyboard */

    /* copy the LaTeX */
    copyBtn.addEventListener('click', function () {
      var label = copyBtn.querySelector('span'), status = $('#tryStatus');
      function done(ok) {
        label.textContent = ok ? 'Copied ✓' : 'Select & copy';
        copyBtn.classList.toggle('is-done', ok);
        if (status) status.textContent = ok ? 'LaTeX copied to the clipboard' : 'Copy failed; the LaTeX is selected, press Ctrl+C';
        if (MOTION) gsap.fromTo(label, { scale: 0.85 }, { scale: 1, duration: 0.5, ease: 'back.out(3)', clearProps: 'transform' });
        clearTimeout(copyBtn._t);
        copyBtn._t = setTimeout(function () {
          label.textContent = 'Copy';
          copyBtn.classList.remove('is-done');
          if (status) status.textContent = '';
        }, 1600);
      }
      var text = texEl.textContent.trim();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { selectTex(); done(false); });
      } else { selectTex(); done(false); }
    });
    function selectTex() {
      var range = document.createRange();
      range.selectNodeContents(texEl);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    /* the first time it comes into view, an integral with bounds types itself in */
    update();
    if (MOTION) {
      ST.create({ trigger: sheet, start: 'top 75%', once: true, onEnter: function () {
        if (!mf.root.k.length && document.activeElement !== field) play('int01', false);
      } });
    } else {
      play('int01', false);
    }
    clearKeys('Click the formula and type — or press an example');
  }

  /* =====================================================================
     plot — Function plots that type and draw themselves: each example
     plays once it is on screen, pauses when it leaves, then the next one
     follows.
     ===================================================================== */
  function setupPlot() {
    var stage = $('#plotStage');
    if (!stage) return;
    var curve = $('#fpCurve'), env = $('#fpEnv'), envNeg = $('#fpEnvNeg'), pen = $('#fpPen');
    var clipC = $('#clipCurveRect'), clipE = $('#clipEnvRect');
    var rows = { 1: $('#fpRow1'), 2: $('#fpRow2') }, texts = { 1: $('#fpText1'), 2: $('#fpText2') };
    var mathBox = $('#fpMath'), texBox = $('#plotTex'), cap = $('#plotCapText');

    var X0 = 50, X1 = 500, XMAX = 12, YC = 160, AMP = 110;
    function X(x) { return X0 + (X1 - X0) * x / XMAX; }
    function Y(y) { return YC - AMP * y; }
    function path(fn) {
      var d = '';
      for (var k = 0; k <= 240; k++) {
        var x = XMAX * k / 240;
        d += (k ? 'L' : 'M') + r1(X(x)) + ' ' + r1(Y(fn(x)));
      }
      return d;
    }

    // grid, axes ticks: drawn once
    var grid = $('#plotGridLines'), ticks = $('#plotTicks');
    [-1, -0.5, 0.5, 1].forEach(function (v) { grid.appendChild(s('path', { d: 'M' + X0 + ' ' + Y(v) + 'H' + X1 })); });
    for (var gx = 2; gx <= 12; gx += 2) {
      grid.appendChild(s('path', { d: 'M' + X(gx) + ' 30V290' }));
      ticks.appendChild(s('path', { d: 'M' + X(gx) + ' ' + YC + 'v5' }));
      var tt = s('text', { x: X(gx), y: YC + 18, 'text-anchor': 'middle' }); tt.textContent = gx; ticks.appendChild(tt);
    }
    [[1, '1'], [-1, '−1']].forEach(function (p) {
      ticks.appendChild(s('path', { d: 'M' + (X0 - 5) + ' ' + Y(p[0]) + 'h5' }));
      var t = s('text', { x: X0 - 9, y: Y(p[0]) + 4, 'text-anchor': 'end' }); t.textContent = p[1]; ticks.appendChild(t);
    });

    /* Each example is a few steps. A step types a formula into row 1 (solid)
       or row 2 (dashed). Typing onto the end of row 1's formula morphs its
       curve; a new row draws in. `pgf` is what pgfplots is given. */
    function ex(f) { return Math.exp(f); }
    var SCENES = [
      { name: 'Damped wave', caption: 'A damped wave, <i>y</i> = sin 2<i>x</i> · <i>e</i><sup>−<i>x</i>/4</sup>, inside its envelope.', steps: [
        { row: 1, text: 'sin(2x)', fn: function (x) { return Math.sin(2 * x); }, pgf: 'sin(deg(2*x))' },
        { row: 1, text: 'sin(2x) * e^(-x/4)', fn: function (x) { return Math.sin(2 * x) * ex(-x / 4); }, pgf: 'sin(deg(2*x))*exp(-x/4)' },
        { row: 2, text: '+-e^(-x/4)', mirror: true, fn: function (x) { return ex(-x / 4); }, pgf: 'exp(-x/4)' }
      ] },
      { name: 'Bell curve', caption: 'Two Gaussians centred at 6: the dashed one is narrower.', steps: [
        { row: 1, text: 'e^(-(x-6)^2/4)', fn: function (x) { return ex(-(x - 6) * (x - 6) / 4); }, pgf: 'exp(-(x-6)^2/4)' },
        { row: 2, text: 'e^(-(x-6)^2)', fn: function (x) { return ex(-(x - 6) * (x - 6)); }, pgf: 'exp(-(x-6)^2)' }
      ] },
      { name: 'S-curve', caption: 'Logistic growth, and the straight line it overtakes.', steps: [
        { row: 1, text: '1/(1 + e^(-(x-6)))', fn: function (x) { return 1 / (1 + ex(-(x - 6))); }, pgf: '1/(1+exp(-(x-6)))' },
        { row: 2, text: 'x/12', fn: function (x) { return x / 12; }, pgf: 'x/12' }
      ] },
      { name: 'Wave packet', caption: 'A wave packet: sin 4<i>x</i> under a Gaussian envelope.', steps: [
        { row: 1, text: 'sin(4x)', fn: function (x) { return Math.sin(4 * x); }, pgf: 'sin(deg(4*x))' },
        { row: 1, text: 'sin(4x) * e^(-(x-6)^2/4)', fn: function (x) { return Math.sin(4 * x) * ex(-(x - 6) * (x - 6) / 4); }, pgf: 'sin(deg(4*x))*exp(-(x-6)^2/4)' },
        { row: 2, text: '+-e^(-(x-6)^2/4)', mirror: true, fn: function (x) { return ex(-(x - 6) * (x - 6) / 4); }, pgf: 'exp(-(x-6)^2/4)' }
      ] }
    ];

    // the one state everything is drawn from; reset in place, so tweens can hold on to it
    var S = {};
    function fresh() {
      return { t1: '', t2: '', active: 1, fn1: null, from1: null, m: 1, d1: 0, v1: 0, fn2: null, mirror: false, d2: 0, v2: 0, tex1: null, tex2: null };
    }
    var last = {}, mathPrev = null;

    function texLine(cmd, rest) {
      var d = h('div');
      d.appendChild(h('span', 'k', cmd));
      d.appendChild(document.createTextNode(rest));
      return d;
    }
    function renderTex(flash) {
      var before = texBox.children.length;
      texBox.textContent = '';
      texBox.appendChild(texLine('\\begin', '{axis}[domain=0:12, samples=200]'));
      if (S.tex1) texBox.appendChild(texLine('  \\addplot', '[thick] {' + S.tex1 + '};'));
      if (S.tex2) {
        texBox.appendChild(texLine('  \\addplot', '[dashed] {' + S.tex2 + '};'));
        if (S.mirror) texBox.appendChild(texLine('  \\addplot', '[dashed] {-' + S.tex2 + '};'));
      }
      texBox.appendChild(texLine('\\end', '{axis}'));
      if (flash && MOTION) {
        var lines = Array.prototype.slice.call(texBox.children, 1, -1);
        var fresh2 = texBox.children.length > before ? lines.slice(-(texBox.children.length - before)) : lines.slice(-1);
        gsap.fromTo(fresh2, { backgroundColor: 'rgba(240,198,124,.35)', x: -8 }, { backgroundColor: 'rgba(240,198,124,0)', x: 0, duration: 0.9, ease: 'power2.out', stagger: 0.1 });
      }
    }

    function render(animate) {
      [1, 2].forEach(function (r) {
        if (S['t' + r] !== last['t' + r]) { texts[r].textContent = S['t' + r]; last['t' + r] = S['t' + r]; }
        rows[r].classList.toggle('is-active', S.active === r);
      });
      rows[2].classList.toggle('fp__row--off', S.active === 1 && !S.t2);

      var shown = S['t' + S.active];
      if (shown !== last.math) {
        last.math = shown;
        if (!shown) { mathBox.textContent = ''; mathPrev = []; }
        else mathPrev = renderMath(mathBox, convert('y = ' + shown).toks, mathPrev, 26, animate);
      }

      var f1 = null;
      if (S.fn1) f1 = S.from1 && S.m < 1 ? (function (a, b, m) { return function (x) { return a(x) * (1 - m) + b(x) * m; }; })(S.from1, S.fn1, S.m) : S.fn1;
      var k1 = S.v1 + ':' + S.m;
      if (k1 !== last.k1) { last.k1 = k1; curve.setAttribute('d', f1 ? path(f1) : ''); }
      if (S.v2 !== last.v2) {
        last.v2 = S.v2;
        env.setAttribute('d', S.fn2 ? path(S.fn2) : '');
        envNeg.setAttribute('d', S.fn2 && S.mirror ? path(function (x) { return -S.fn2(x); }) : '');
      }
      clipC.setAttribute('width', S.d1 >= 1 ? 520 : X0 + (X1 - X0) * S.d1);
      clipE.setAttribute('width', S.d2 >= 1 ? 520 : X0 + (X1 - X0) * S.d2);

      var drawing = (S.d1 > 0 && S.d1 < 1 && f1) ? [S.d1, f1] : (S.d2 > 0 && S.d2 < 1 && S.fn2) ? [S.d2, S.fn2] : null;
      if (drawing) {
        var x = XMAX * drawing[0];
        pen.setAttribute('cx', r1(X(x)));
        pen.setAttribute('cy', r1(Y(drawing[1](x))));
        pen.style.opacity = 1;
      } else pen.style.opacity = 0;

    }

    // a step's formula is typed onto row 1's previous one when it continues it
    function continues(sc, k) {
      for (var j = k - 1; j >= 0; j--) if (sc.steps[j].row === sc.steps[k].row) return sc.steps[k].text.indexOf(sc.steps[j].text) === 0 ? sc.steps[j].text : '';
      return '';
    }
    function commit(st, morph) {
      if (morph) { S.from1 = S.fn1; S.fn1 = st.fn; S.m = 0; S.v1++; }
      else if (st.row === 1) { S.fn1 = st.fn; S.from1 = null; S.m = 1; S.d1 = 0; S.v1++; }
      else { S.fn2 = st.fn; S.mirror = !!st.mirror; S.d2 = 0; S.v2++; }
    }
    function begin(i) {
      Object.assign(S, fresh());
      last = {};
      current = i;
      cap.innerHTML = SCENES[i].caption;            // our own fixed strings: maths set with <i> and <sup>
      renderTex(false);
    }

    // the finished example, with no motion (reduced motion, no GSAP)
    function showFinal(i) {
      begin(i);
      var sc = SCENES[i];
      sc.steps.forEach(function (st, k) {
        var morph = !!continues(sc, k) && st.row === 1;
        S['t' + st.row] = st.text;
        S.active = st.row;
        commit(st, morph);
        S.m = 1; S['d' + st.row] = 1; S['tex' + st.row] = st.pgf;
      });
      render(false);
      renderTex(false);
    }

    var fadeEls = [curve, env, envNeg, mathBox, texts[1], texts[2]];
    function build(i) {
      var sc = SCENES[i];
      var t = gsap.timeline({ paused: true, onUpdate: function () { render(true); }, onComplete: function () { play((i + 1) % SCENES.length); } });
      t.call(function () { begin(i); gsap.set(fadeEls, { opacity: 1 }); }, null, 0).to({}, { duration: 0.4 });
      sc.steps.forEach(function (st, k) {
        var r = st.row, prev = continues(sc, k), morph = !!prev && r === 1;
        var o = { n: prev.length };
        t.call(function () { S.active = r; })
          .to(o, { n: st.text.length, duration: Math.max(0.3, (st.text.length - prev.length) * 0.075), ease: 'none',
                   onUpdate: function () { S['t' + r] = st.text.slice(0, Math.round(o.n)); } })
          .call(function () { commit(st, morph); }, null, '+=0.15');
        if (morph) t.to(S, { m: 1, duration: 1.3, ease: 'power1.inOut' });
        else { var v = {}; v['d' + r] = 1; v.duration = 1.4; v.ease = 'power1.inOut'; t.to(S, v); }
        t.call(function () { S['tex' + r] = st.pgf; renderTex(true); }).to({}, { duration: 0.45 });
      });
      t.addLabel('shown').to({}, { duration: 2.6 })
        .call(function () { if (held) { waiting = true; sync(); } })
        .to(fadeEls, { opacity: 0, duration: 0.45, ease: 'power1.in' });
      return t;
    }

    // plays while on screen; pointing at a finished example keeps it up until the pointer leaves
    var tl = null, current = -1, visible = false, held = false, waiting = false;
    function sync() { if (tl) tl.paused(!visible || waiting); }
    function play(i) {
      if (tl) tl.kill();
      waiting = false;
      if (!MOTION) { tl = null; showFinal(i); return; }
      tl = build(i);
      tl.play(0);
      sync();
    }

    if (!MOTION) { showFinal(0); return; }           // reduced motion or no GSAP: the first example, finished
    stage.addEventListener('mouseenter', function () { held = true; });
    stage.addEventListener('mouseleave', function () { held = false; if (waiting) { waiting = false; sync(); } });

    Object.assign(S, fresh());
    render(false);
    renderTex(false);
    // starts drawing when you see it, stops when you scroll away
    ST.create({
      trigger: stage, start: 'top 80%', end: 'bottom 20%',
      onToggle: function (self) {
        visible = self.isActive;
        if (visible && !tl) play(0);
        sync();
      }
    });
  }

  /* =====================================================================
     gallery — seven more chart kinds. Each draws itself when it comes
     into view, answers the pointer, and keeps its LaTeX in step.
     ===================================================================== */
  function setupGallery() {
    if (!$('.gal')) return;

    // tween a plain state object, or (no motion) jump straight to the end
    function tw(targets, vars, draw) {
      if (MOTION) { var v = Object.assign({}, vars); if (draw) v.onUpdate = draw; return gsap.to(targets, v); }
      [].concat(targets).forEach(function (t, i) {
        for (var k in vars) if (k in t) t[k] = typeof vars[k] === 'function' ? vars[k](i, t) : vars[k];
      });
      if (draw) draw();
      if (vars.onComplete) vars.onComplete();
      return null;
    }
    function onSee(el, fn) {
      if (MOTION) ST.create({ trigger: el, start: 'top 85%', once: true, onEnter: fn });
      else fn();
    }
    function watch(el, fn) {
      if (MOTION) ST.create({ trigger: el, start: 'top bottom', end: 'bottom top', onToggle: function (self) { fn(self.isActive); } });
    }
    function hold(el, fn) {
      el.addEventListener('mouseenter', function () { fn(true); });
      el.addEventListener('mouseleave', function () { fn(false); });
    }
    function tex(pre, lines, flash) {
      pre.textContent = '';
      lines.forEach(function (l) {
        var d = h('div');
        if (l[0]) d.appendChild(h('span', 'k', l[0]));
        d.appendChild(document.createTextNode(l[1]));
        pre.appendChild(d);
      });
      if (flash && MOTION) { pre.classList.remove('flash'); void pre.offsetWidth; pre.classList.add('flash'); }
    }
    // a row of chips where one is chosen
    function pick(group, attr, fn) {
      var btns = $$('[data-' + attr + ']', group);
      function mark(v) {
        btns.forEach(function (b) {
          var on = b.getAttribute('data-' + attr) === String(v);
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }
      btns.forEach(function (b) {
        b.addEventListener('click', function () { var v = b.getAttribute('data-' + attr); mark(v); fn(v); });
      });
      return mark;
    }
    function vbX(svg, e, width) {           // pointer → viewBox x
      var r = svg.getBoundingClientRect();
      return (e.clientX - r.left) * width / r.width;
    }

    galPie(); galHist(); galPolar(); galHbar(); galSurf(); galLog(); galArea();

    /* -------------------------------------------------------------- pie */
    function galPie() {
      var card = $('#gcPie'), gS = $('#pieSlices'), gL = $('#pieLegend'), hint = $('.gc__hint', card);
      var D = [['Lectures', 34, '#7a4f10'], ['Labs', 26, '#d9a441'], ['Reading', 22, '#4b5058'], ['Exams', 18, '#c9c5bd']];
      var CX = 78, CY = 85, R = 66, hint0 = hint.textContent;
      var P = { sweep: MOTION ? 0 : 1 }, pops = D.map(function () { return { o: 0 }; });
      var a = -90, slices = [], pcts = [], rows = [];
      D.forEach(function (d, i) {
        var a0 = a, a1 = a + 3.6 * d[1]; a = a1;
        var p = s('path', { class: 'gc__slice', fill: d[2], 'data-i': i });
        gS.appendChild(p); slices.push({ el: p, a0: a0, a1: a1 });
        var mid = (a0 + a1) / 2 * Math.PI / 180;
        var t = s('text', { class: 'gc__pct' + (i === 3 || i === 1 ? ' gc__pct--dark' : ''), x: r1(CX + R * 0.62 * Math.cos(mid)), y: r1(CY + R * 0.62 * Math.sin(mid) + 4), 'text-anchor': 'middle' });
        t.textContent = d[1] + '%'; gS.appendChild(t); pcts.push(t);
        var row = s('g', { 'data-i': i, transform: 'translate(166,' + (44 + i * 26) + ')' });
        row.appendChild(s('rect', { x: 0, y: -9, width: 11, height: 11, rx: 2, fill: d[2] }));
        var lt = s('text', { x: 18, y: 1 }); lt.textContent = d[0]; row.appendChild(lt);
        gL.appendChild(row); rows.push(row);
      });
      function pt(deg, rr) { var q = deg * Math.PI / 180; return r1(CX + rr * Math.cos(q)) + ' ' + r1(CY + rr * Math.sin(q)); }
      function draw() {
        var end = -90 + 360 * P.sweep;
        slices.forEach(function (sl, i) {
          var a1 = Math.min(sl.a1, end);
          if (a1 <= sl.a0 + 0.01) { sl.el.setAttribute('d', ''); pcts[i].style.opacity = 0; return; }
          sl.el.setAttribute('d', 'M' + CX + ' ' + CY + 'L' + pt(sl.a0, R) + 'A' + R + ' ' + R + ' 0 ' + (a1 - sl.a0 > 180 ? 1 : 0) + ' 1 ' + pt(a1, R) + 'Z');
          var mid = (sl.a0 + sl.a1) / 2 * Math.PI / 180, o = pops[i].o * 9;
          var tr = 'translate(' + r1(o * Math.cos(mid)) + ',' + r1(o * Math.sin(mid)) + ')';
          sl.el.setAttribute('transform', tr); pcts[i].setAttribute('transform', tr);
          pcts[i].style.opacity = end >= sl.a1 ? 1 : 0;
        });
      }
      var hot = -1;
      function setHot(i) {
        if (i === hot) return;
        hot = i;
        slices.forEach(function (sl, k) { sl.el.classList.toggle('is-hot', k === i); rows[k].classList.toggle('is-hot', k === i); });
        tw(pops, { o: function (k) { return k === i ? 1 : 0; }, duration: 0.45, ease: 'back.out(2.2)', overwrite: true }, draw);
        hint.textContent = i < 0 ? hint0 : D[i][0] + ': ' + D[i][1] + '% of the week';
        if (i >= 0) pieTex(i, true);
      }
      card.querySelector('svg').addEventListener('pointerover', function (e) {
        var g = e.target.closest('[data-i]');
        setHot(g ? +g.getAttribute('data-i') : -1);
      });
      card.querySelector('svg').addEventListener('pointerleave', function () { setHot(-1); });
      draw();
      // the exporter draws slices in plain TikZ: from 90°, clockwise
      function pieTex(i, flash) {
        var k = i < 0 ? 0 : i, start = 90;
        for (var j = 0; j < k; j++) start -= 3.6 * D[j][1];
        var end = start - 3.6 * D[k][1], mid = Math.round((start + end) / 2);
        function nf(v) { return String(Math.round(v * 10) / 10); }
        tex($('#pieTex'), [['\\begin', '{tikzpicture}[x=0.18\\linewidth, y=0.18\\linewidth]'],
          ['  \\fill', '[draw=white] (0,0) -- (' + nf(start) + ':1) arc[start angle=' + nf(start) + ', end angle=' + nf(end) + ', radius=1] -- cycle;'],
          ['  \\node', '[text=white] at (' + mid + ':0.64) {' + D[k][1] + '\\%};'],
          ['  \\node', '[anchor=' + ((mid + 540) % 360) + '] at (' + mid + ':1.1) {' + D[k][0] + '};'],
          ['\\end', '{tikzpicture}']], flash);
      }
      pieTex(-1, false);
      onSee(card, function () { tw(P, { sweep: 1, duration: 1.3, ease: 'power2.inOut' }, draw); });
    }

    /* -------------------------------------------------------- histogram */
    function galHist() {
      var card = $('#gcHist'), gB = $('#histBars'), gT = $('#histTicks');
      var seed = 11;
      function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
      var data = [];
      while (data.length < 120) {
        var z = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
        var v = 172 + 7.5 * z;
        if (v >= 150 && v < 195) data.push(v);
      }
      var X0 = 32, X1 = 250, BASE = 140, TOP = 18, MAXN = 15;
      function X(v) { return X0 + (X1 - X0) * (v - 150) / 45; }
      [150, 165, 180, 195].forEach(function (v) {
        gT.appendChild(s('path', { d: 'M' + r1(X(v)) + ' ' + BASE + 'v4' }));
        var t = s('text', { x: r1(X(v)), y: BASE + 16, 'text-anchor': 'middle' }); t.textContent = v; gT.appendChild(t);
      });
      var yt = s('g'); gT.appendChild(yt);
      var bars = [], st = [];
      for (var i = 0; i < MAXN; i++) {
        var b = s('rect', { class: 'gc__bar', x: X1, y: BASE, width: 0, height: 0 });
        gB.appendChild(b); bars.push(b); st.push({ x: X1, w: 0, h: 0, n: 0 });
      }
      var tip = s('text', { class: 'gc__val', 'text-anchor': 'middle', x: 0, y: 0 }); tip.style.opacity = 0; gB.appendChild(tip);
      function draw() {
        st.forEach(function (o, i) {
          bars[i].setAttribute('x', r1(o.x)); bars[i].setAttribute('width', Math.max(0, r1(o.w)));
          bars[i].setAttribute('y', r1(BASE - o.h)); bars[i].setAttribute('height', Math.max(0, r1(o.h)));
        });
      }
      var bins = 9, scale = 1;
      function layout(n, grow) {
        var counts = []; for (var k = 0; k < n; k++) counts.push(0);
        data.forEach(function (v) { counts[Math.min(n - 1, Math.floor((v - 150) / 45 * n))]++; });
        var max = Math.max.apply(null, counts), top = Math.ceil(max / 5) * 5;
        scale = (BASE - TOP) / top;
        yt.textContent = '';
        [0, top / 2, top].forEach(function (v) {
          var y = BASE - v * scale;
          yt.appendChild(s('path', { d: 'M' + (X0 - 4) + ' ' + r1(y) + 'h4' }));
          var t = s('text', { x: X0 - 7, y: r1(y + 4), 'text-anchor': 'end' }); t.textContent = v; yt.appendChild(t);
        });
        if (MOTION) gsap.fromTo(yt, { opacity: 0 }, { opacity: 1, duration: 0.4 });
        var w = (X1 - X0) / n;
        st.forEach(function (o, i) { o.n = i < n ? counts[i] : 0; });
        tw(st, {
          x: function (i) { return i < n ? X0 + i * w : X1; },
          w: function (i) { return i < n ? w : 0; },
          h: function (i) { return i < n ? counts[i] * scale : 0; },
          duration: grow ? 0.8 : 0.7, ease: grow ? 'back.out(1.4)' : 'power3.inOut', stagger: grow ? 0.05 : 0.02, overwrite: true
        }, draw);
        histTex(n, counts, !grow);
      }
      gB.addEventListener('pointerover', function (e) {
        var i = bars.indexOf(e.target);
        if (i < 0 || !st[i].n) { tip.style.opacity = 0; return; }
        tip.textContent = st[i].n;
        tip.setAttribute('x', r1(st[i].x + st[i].w / 2)); tip.setAttribute('y', r1(BASE - st[i].n * scale - 5));
        tip.style.opacity = 1;
      });
      gB.addEventListener('pointerleave', function () { tip.style.opacity = 0; });
      pick(card, 'bins', function (v) { bins = +v; layout(bins, false); });
      // binned here, as the exporter does, so the PDF has exactly these bars
      function histTex(n, counts, flash) {
        var bw = 45 / n, c = counts.map(function (v, i) { return '(' + (Math.round((150 + bw * (i + 0.5)) * 10) / 10) + ',' + v + ')'; });
        tex($('#histTex'), [['\\begin', '{axis}[ybar=0pt, bar width=' + (Math.round(bw * 10) / 10) + ', xmin=150, xmax=195]'],
          ['  \\addplot', '[fill=ptblue!75, draw=ptblue!50!black]'], ['', '    coordinates {' + c.join(' ') + '};'], ['\\end', '{axis}']], flash);
      }
      (function () {
        var c0 = []; for (var k = 0; k < bins; k++) c0.push(0);
        data.forEach(function (v) { c0[Math.min(bins - 1, Math.floor((v - 150) / 45 * bins))]++; });
        histTex(bins, c0, false);
      })();
      onSee(card, function () { layout(bins, true); });
    }

    /* ------------------------------------------------------------ polar */
    function galPolar() {
      var card = $('#gcPolar'), grid = $('#polarGrid'), curve = $('#polarCurve'), pen = $('#polarPen');
      var CX = 130, CY = 85, R = 68;
      [R / 2, R].forEach(function (rr) { grid.appendChild(s('circle', { cx: CX, cy: CY, r: rr })); });
      for (var a = 0; a < 360; a += 30) {
        var q = a * Math.PI / 180;
        grid.appendChild(s('path', { d: 'M' + CX + ' ' + CY + 'L' + r1(CX + R * Math.cos(q)) + ' ' + r1(CY - R * Math.sin(q)) }));
      }
      [['0°', CX + R + 5, CY + 4, 'start'], ['90°', CX, CY - R - 5, 'middle'], ['180°', CX - R - 5, CY + 4, 'end'], ['270°', CX, CY + R + 13, 'middle']].forEach(function (l) {
        var t = s('text', { x: l[1], y: l[2], 'text-anchor': l[3] }); t.textContent = l[0]; grid.appendChild(t);
      });
      var Q = { k: 3, p: 0, a: 1 }, KS = [2, 3, 4, 5];
      function draw() {
        var T = Q.k % 2 ? Math.PI : 2 * Math.PI, n = Math.max(1, Math.round(400 * Q.p)), d = '', x = CX, y = CY;
        if (Q.p > 0) for (var j = 0; j <= n; j++) {
          var th = T * Q.p * j / n, rr = Math.cos(Q.k * th);
          x = CX + R * rr * Math.cos(th); y = CY - R * rr * Math.sin(th);
          d += (j ? 'L' : 'M') + r1(x) + ' ' + r1(y);
        }
        curve.setAttribute('d', d);
        curve.style.opacity = Q.a;
        pen.setAttribute('cx', r1(x)); pen.setAttribute('cy', r1(y));
        pen.style.opacity = Q.p > 0 && Q.p < 1 ? 1 : 0;
      }
      // x is the angle in radians; trig takes degrees, as everywhere in pgfplots
      function polarTex(k, flash) {
        tex($('#polarTex'), [['\\begin', '{polaraxis}[ymin=0, ymax=1]'], ['  \\addplot', '[thick, domain=0:6.2832, samples=360]'], ['', '    ({deg(x)}, {cos(deg(' + k + '*x))});'], ['\\end', '{polaraxis}']], flash);
      }
      var mark = pick(card, 'k', function (v) { run(+v); });
      // Drawing never stops under the pointer (a click must always draw);
      // pointing at the finished rose only keeps it up until the pointer leaves.
      var tl = null, visible = false, held = false, waiting = false;
      function sync() { if (tl) tl.paused(!visible || waiting); }
      function run(k) {
        if (tl) tl.kill();
        waiting = false;
        Q.k = k; mark(k);
        polarTex(k, tl !== null);
        if (!MOTION) { Q.p = 1; Q.a = 1; draw(); return; }
        Q.p = 0; Q.a = 1;
        tl = gsap.timeline({ onUpdate: draw, onComplete: function () { run(KS[(KS.indexOf(k) + 1) % KS.length]); } })
          .to(Q, { p: 1, duration: 2.6, ease: 'power1.inOut' })
          .to({}, { duration: 2.2 })
          .call(function () { if (held) { waiting = true; sync(); } })
          .to(Q, { a: 0, duration: 0.4, ease: 'power1.in' });
        sync();
      }
      hold(card, function (v) { held = v; if (!v && waiting) { waiting = false; sync(); } });
      if (!MOTION) { run(3); return; }
      polarTex(3, false);
      watch(card, function (v) { visible = v; if (v && !tl) run(3); sync(); });
    }

    /* -------------------------------------------------- horizontal bars */
    function galHbar() {
      var card = $('#gcHbar'), g = $('#hbarRows'), btn = $('#hbarSort');
      var D = [['Python', 42], ['Excel', 31], ['R', 23], ['MATLAB', 17], ['Julia', 9]];
      var X0 = 66, K = 3.9, ROW = 28, TOP = 14;
      var rows = D.map(function (d, i) {
        var gr = s('g', { class: 'gc__hrow' });
        var lab = s('text', { x: X0 - 7, y: 13, 'text-anchor': 'end' }); lab.textContent = d[0];
        var bar = s('rect', { class: 'gc__bar', x: X0, y: 0, height: 18, width: 0 });
        var num = s('text', { class: 'gc__num', x: X0 + 5, y: 13 });
        gr.appendChild(lab); gr.appendChild(bar); gr.appendChild(num); g.appendChild(gr);
        return { g: gr, bar: bar, num: num, st: { y: TOP + i * ROW, w: MOTION ? 0 : d[1] } };
      });
      function draw() {
        rows.forEach(function (r, i) {
          r.g.setAttribute('transform', 'translate(0,' + r1(r.st.y) + ')');
          r.bar.setAttribute('width', r1(r.st.w * K));
          r.num.setAttribute('x', r1(X0 + r.st.w * K + 5));
          r.num.textContent = r.st.w > 0.5 ? Math.round(r.st.w) : '';
        });
      }
      var byValue = true;
      function order() {
        var idx = D.map(function (d, i) { return i; });
        if (!byValue) idx.sort(function (a, b) { return D[a][0].localeCompare(D[b][0], 'en'); });
        return idx;
      }
      function writeTex(flash) {
        var o = order();
        tex($('#hbarTex'), [['\\begin', '{axis}[xbar=0pt, y dir=reverse, ytick={0,...,4},'], ['', '  yticklabels={' + o.map(function (i) { return D[i][0]; }).join(', ') + '}]'],
          ['  \\addplot', ' coordinates {' + o.map(function (i, n) { return '(' + D[i][1] + ',' + n + ')'; }).join(' ') + '};'], ['\\end', '{axis}']], flash);
      }
      btn.addEventListener('click', function () {
        byValue = !byValue;
        btn.setAttribute('aria-pressed', byValue ? 'true' : 'false');
        btn.textContent = byValue ? 'Sorted by value' : 'Sorted A to Z';
        var o = order(), pos = [];
        o.forEach(function (di, n) { pos[di] = TOP + n * ROW; });
        tw(rows.map(function (r) { return r.st; }), { y: function (i) { return pos[i]; }, duration: 0.7, ease: 'back.out(1.5)', stagger: 0.04, overwrite: 'auto' }, draw);
        writeTex(true);
      });
      draw(); writeTex(false);
      onSee(card, function () {
        tw(rows.map(function (r) { return r.st; }), { w: function (i) { return D[i][1]; }, duration: 1, ease: 'power3.out', stagger: 0.09, overwrite: 'auto' }, draw);
      });
    }

    /* ------------------------------------------------------- 3D surface */
    function galSurf() {
      var card = $('#gcSurf'), svg = $('#surfSvg'), g = $('#surfQuads');
      var N = 18, LO = -3, STEP = 6 / N, M = N + 1;
      var FN = [
        { f: function (x, y) { return Math.sin(x) * Math.cos(y); }, pgf: 'sin(deg(x))*cos(deg(y))' },
        { f: function (x, y) { return Math.exp(-(x * x + y * y) / 2); }, pgf: 'exp(-(x^2+y^2)/2)' },
        { f: function (x, y) { return (x * x - y * y) / 9; }, pgf: '(x^2-y^2)/9' }
      ];
      var Zf = new Float64Array(M * M), Zt = new Float64Array(M * M), Z = new Float64Array(M * M);
      var PX = new Float64Array(M * M), PY = new Float64Array(M * M), PD = new Float64Array(M * M);
      function fill(arr, f) { for (var i = 0; i < M; i++) for (var j = 0; j < M; j++) arr[i * M + j] = f(LO + i * STEP, LO + j * STEP); }
      fill(Zt, FN[0].f); Zf.set(Zt);
      var V = { yaw: -0.65, tilt: 0.55, rise: MOTION ? 0 : 1, m: 1, spin: 0 };
      var els = [], order = [], depth = new Float64Array(N * N);
      for (var q = 0; q < N * N; q++) { var p = s('path'); g.appendChild(p); els.push(p); order.push(q); }
      // ink-blue → amber → cream, like a quiet pgfplots colormap
      var STOPS = [[47, 54, 64], [122, 79, 16], [217, 164, 65], [250, 233, 196]];
      function col(t, shade) {
        t = Math.max(0, Math.min(1, t)) * (STOPS.length - 1);
        var i = Math.min(STOPS.length - 2, Math.floor(t)), f = t - i, a = STOPS[i], b = STOPS[i + 1];
        return 'rgb(' + Math.round((a[0] + (b[0] - a[0]) * f) * shade) + ',' + Math.round((a[1] + (b[1] - a[1]) * f) * shade) + ',' + Math.round((a[2] + (b[2] - a[2]) * f) * shade) + ')';
      }
      function draw() {
        var ca = Math.cos(V.yaw), sa = Math.sin(V.yaw), st = Math.sin(V.tilt), ct = Math.cos(V.tilt);
        var zs = 1.5 * V.rise, k = Math.min(46, 140 / (4.25 * st + 1.5 * ct));
        for (var n = 0; n < M * M; n++) {
          var i = (n / M) | 0, j = n % M, x = LO + i * STEP, y = LO + j * STEP;
          var z = Zf[n] + (Zt[n] - Zf[n]) * V.m; Z[n] = z;
          var xr = x * ca - y * sa, yr = x * sa + y * ca;
          PX[n] = 270 + k * xr; PY[n] = 152 - k * yr * st - k * zs * z * ct; PD[n] = -yr * ct + zs * z * st;
        }
        for (var c = 0; c < N * N; c++) {
          var a0 = ((c / N) | 0) * M + c % N;
          depth[c] = PD[a0] + PD[a0 + 1] + PD[a0 + M] + PD[a0 + M + 1];
        }
        order.sort(function (a, b) { return depth[a] - depth[b]; });
        for (var e = 0; e < order.length; e++) {
          var cq = order[e], b0 = ((cq / N) | 0) * M + cq % N, b1 = b0 + M, b2 = b0 + M + 1, b3 = b0 + 1;
          var zc = (Z[b0] + Z[b1] + Z[b2] + Z[b3]) / 4;
          var gx = (Z[b1] + Z[b2] - Z[b0] - Z[b3]) / (2 * STEP) * zs, gy = (Z[b3] + Z[b2] - Z[b0] - Z[b1]) / (2 * STEP) * zs;
          var lit = (-0.45 * gx + 0.35 * gy + 0.82) / Math.sqrt(gx * gx + gy * gy + 1);
          els[e].setAttribute('d', 'M' + r1(PX[b0]) + ' ' + r1(PY[b0]) + 'L' + r1(PX[b1]) + ' ' + r1(PY[b1]) + 'L' + r1(PX[b2]) + ' ' + r1(PY[b2]) + 'L' + r1(PX[b3]) + ' ' + r1(PY[b3]) + 'Z');
          els[e].setAttribute('fill', col((zc + 1) / 2, 0.62 + 0.42 * Math.max(0, lit)));
        }
        var az = Math.round(V.yaw * 180 / Math.PI) % 360; if (az > 180) az -= 360; if (az <= -180) az += 360;
        var el = Math.round(V.tilt * 180 / Math.PI);
        if (az !== lastAz || el !== lastEl) { lastAz = az; lastEl = el; azEl.textContent = az; elEl.textContent = el; }
      }
      var lastAz = null, lastEl = null, azEl = h('span'), elEl = h('span'), cur = 0;
      function writeTex(flash) {
        var pre = $('#surfTex');
        tex(pre, [['\\begin', '{axis}[view={'], ['  \\addplot3', '[surf, shader=faceted, samples=25, domain=-3:3, y domain=-3:3]'], ['', '    {' + FN[cur].pgf + '};'], ['\\end', '{axis}']], flash);
        var first = pre.firstChild;
        first.appendChild(azEl); first.appendChild(document.createTextNode('}{')); first.appendChild(elEl); first.appendChild(document.createTextNode('}]'));
      }
      writeTex(false);

      pick(card, 'surf', function (v) {
        cur = +v;
        for (var n = 0; n < M * M; n++) Zf[n] = Zf[n] + (Zt[n] - Zf[n]) * V.m;
        fill(Zt, FN[cur].f); V.m = 0;
        tw(V, { m: 1, duration: 1.1, ease: 'power3.inOut', overwrite: 'auto' }, MOTION ? null : draw);
        writeTex(true);
      });

      // turn it: drag (with a little momentum) or arrow keys
      var drag = null, spinTw = null, visible = false, held = false;
      function clampTilt(t) { return Math.max(0.12, Math.min(1.05, t)); }
      svg.addEventListener('pointerdown', function (e) {
        drag = { x: e.clientX, y: e.clientY, v: 0 };
        try { svg.setPointerCapture(e.pointerId); } catch (err) {}
        if (spinTw) spinTw.kill();
        V.spin = 0;
      });
      svg.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY; drag.v = dx * 0.011;
        V.yaw += dx * 0.011; V.tilt = clampTilt(V.tilt + dy * 0.008);
        if (!MOTION) draw();
      });
      function up() {
        if (!drag) return;
        if (MOTION) { V.spin = Math.max(-0.15, Math.min(0.15, drag.v)); spinTw = gsap.to(V, { spin: 0, duration: 1.6, ease: 'power2.out' }); }
        drag = null;
      }
      svg.addEventListener('pointerup', up);
      svg.addEventListener('pointercancel', up);
      svg.addEventListener('keydown', function (e) {
        var dy = 0, dx = 0;
        if (e.key === 'ArrowLeft') dx = -0.25; else if (e.key === 'ArrowRight') dx = 0.25;
        else if (e.key === 'ArrowUp') dy = -0.12; else if (e.key === 'ArrowDown') dy = 0.12;
        else return;
        e.preventDefault();
        var to = { yaw: V.yaw + dx, tilt: clampTilt(V.tilt + dy) };
        if (MOTION) gsap.to(V, { yaw: to.yaw, tilt: to.tilt, duration: 0.45, ease: 'power3.out', overwrite: 'auto' });
        else { V.yaw = to.yaw; V.tilt = to.tilt; draw(); }
      });
      svg.addEventListener('focus', function () { held = true; });
      svg.addEventListener('blur', function () { held = false; });
      hold(card, function (v) { held = v; });

      draw();
      if (!MOTION) return;
      // spins slowly on its own while on screen, unless you're pointing at it or turning it
      function tick(time, dt) {
        if (!held && !drag) V.yaw += 0.00028 * dt;
        V.yaw += V.spin * dt / 16;
        draw();
      }
      var on = false;
      watch(card, function (v) {
        visible = v;
        if (v && !on) { gsap.ticker.add(tick); on = true; }
        if (!v && on) { gsap.ticker.remove(tick); on = false; }
      });
      onSee(card, function () { gsap.to(V, { rise: 1, duration: 1.8, ease: 'elastic.out(1, 0.55)' }); });
    }

    /* --------------------------------------------------------- log axis */
    function galLog() {
      var card = $('#gcLog'), grid = $('#logGrid'), ticks = $('#logTicks'), line = $('#logLine'), gP = $('#logPts');
      var X0 = 40, BASE = 140, H = 122;
      function X(t) { return X0 + 20.5 * t; }
      function lin(n) { return BASE - H * n / 12000; }
      function lg(n) { return BASE - H * (Math.log(n) / Math.LN10 - 1) / 3.2; }
      var gLin = s('g'), gLog = s('g'), tLin = s('g'), tLog = s('g');
      grid.appendChild(gLin); grid.appendChild(gLog); ticks.appendChild(tLin); ticks.appendChild(tLog);
      function yTick(gg, tg, y, label) {
        gg.appendChild(s('path', { d: 'M' + X0 + ' ' + r1(y) + 'H250' }));
        tg.appendChild(s('path', { d: 'M' + (X0 - 4) + ' ' + r1(y) + 'h4' }));
        var t = s('text', { x: X0 - 7, y: r1(y + 4), 'text-anchor': 'end' }); t.textContent = label; tg.appendChild(t);
      }
      [[4000, '4k'], [8000, '8k'], [12000, '12k']].forEach(function (v) { yTick(gLin, tLin, lin(v[0]), v[1]); });
      [[10, '10'], [100, '10²'], [1000, '10³'], [10000, '10⁴']].forEach(function (v) { yTick(gLog, tLog, lg(v[0]), v[1]); });
      for (var t = 0; t <= 10; t += 2) {
        ticks.appendChild(s('path', { d: 'M' + X(t) + ' ' + BASE + 'v4' }));
        var tt = s('text', { x: X(t), y: BASE + 16, 'text-anchor': 'middle' }); tt.textContent = t; ticks.appendChild(tt);
      }
      var dots = [];
      for (var k = 0; k <= 10; k++) { var c = s('circle', { class: 'gc__dot', r: 3, cx: X(k), cy: BASE }); gP.appendChild(c); dots.push(c); }
      var L = { m: 1, d: MOTION ? 0 : 1 };
      function draw() {
        var pts = [], reach = L.d * 10;
        for (var k = 0; k <= 10; k++) {
          var n = 10 * Math.pow(2, k), y = lin(n) + (lg(n) - lin(n)) * L.m;
          dots[k].setAttribute('cy', r1(y));
          dots[k].style.opacity = k <= reach + 1e-6 ? 1 : 0;
          if (k <= reach) pts.push(r1(X(k)) + ',' + r1(y));
          else if (k - 1 < reach) {                // the last stretch, part drawn
            var f = reach - (k - 1), np = 10 * Math.pow(2, k - 1), yp = lin(np) + (lg(np) - lin(np)) * L.m;
            pts.push(r1(X(k - 1 + f)) + ',' + r1(yp + (y - yp) * f));
          }
        }
        line.setAttribute('points', pts.join(' '));
        gLin.style.opacity = tLin.style.opacity = 1 - L.m;
        gLog.style.opacity = tLog.style.opacity = L.m;
      }
      function writeTex(log, flash) {
        tex($('#logTex'), [['\\begin', '{axis}[' + (log ? 'ymode=log, ' : '') + 'xlabel={$t$ (h)}]'], ['  \\addplot', '+[mark=*, domain=0:10, samples=11]'], ['', '    {10*2^x};'], ['\\end', '{axis}']], flash);
      }
      pick(card, 'ymode', function (v) {
        tw(L, { m: v === 'log' ? 1 : 0, duration: 1.1, ease: 'power3.inOut', overwrite: 'auto' }, draw);
        writeTex(v === 'log', true);
      });
      draw(); writeTex(true, false);
      onSee(card, function () { tw(L, { d: 1, duration: 1.8, ease: 'power1.inOut' }, draw); });
    }

    /* ------------------------------------------------------ filled area */
    function galArea() {
      var card = $('#gcArea'), svg = $('#areaSvg'), range = $('#areaRange'), out = $('#areaOut');
      var fillEl = $('#areaFill'), bound = $('#areaBound'), val = $('#areaVal'), ticks = $('#areaTicks');
      var X0 = 24, BASE = 140;
      function X(x) { return X0 + 22.2 * x; }
      function Y(y) { return BASE - 150 * y; }
      function f(x) { return x * Math.exp(-x / 2); }
      function I(b) { return 4 - (2 * b + 4) * Math.exp(-b / 2); }
      function curvePts(a, b, n) {
        var d = '';
        for (var k = 0; k <= n; k++) { var x = a + (b - a) * k / n; d += 'L' + r1(X(x)) + ' ' + r1(Y(f(x))); }
        return d;
      }
      $('#areaCurve').setAttribute('d', 'M' + curvePts(0, 10, 160).slice(1));
      for (var t = 0; t <= 10; t += 2) {
        ticks.appendChild(s('path', { d: 'M' + r1(X(t)) + ' ' + BASE + 'v4' }));
        var tt = s('text', { x: r1(X(t)), y: BASE + 16, 'text-anchor': 'middle' }); tt.textContent = t; ticks.appendChild(tt);
      }
      ticks.appendChild(s('path', { d: 'M' + (X0 - 4) + ' ' + Y(0.5) + 'h4' }));
      var yl = s('text', { x: X0 - 7, y: Y(0.5) + 4, 'text-anchor': 'end' }); yl.textContent = '.5'; ticks.appendChild(yl);
      /* ∫ from 0 to b of f dx = …, set as maths: the limits as real scripts,
         the variables italic, the sign and the digits upright */
      var valNum = (function () {
        val.textContent = '';
        function ts(text, attrs) { var t = s('tspan', attrs || {}); t.textContent = text; val.appendChild(t); return t; }
        ts('∫');
        ts('0', { dy: 4, 'font-size': 8.5 });
        ts('b', { dy: -11, dx: -4, 'font-size': 8.5, class: 'it' });
        ts('f', { dy: 7, dx: 3, class: 'it' });
        ts(' d');
        ts('x', { class: 'it' });
        ts(' = ');
        return ts('');
      })();
      var A = { b: MOTION ? 0 : 5 }, lastB = null;
      function draw() {
        var b = Math.max(0, Math.min(10, A.b));
        fillEl.setAttribute('d', b > 0.01 ? 'M' + X(0) + ' ' + BASE + curvePts(0, b, Math.max(2, Math.round(b * 16))) + 'L' + r1(X(b)) + ' ' + BASE + 'Z' : '');
        bound.setAttribute('d', 'M' + r1(X(b)) + ' ' + BASE + 'V' + r1(Y(f(b))));
        valNum.textContent = I(b).toFixed(2);
        var bs = b.toFixed(1);
        if (bs !== lastB) {
          lastB = bs; out.textContent = bs;
          if (document.activeElement !== range) range.value = bs;
          tex($('#areaTex'), [['  \\addplot', '[draw=none, fill=ptblue, fill opacity=0.2, domain=0:' + bs + ']'], ['', '    {x*exp(-x/2)} \\closedcycle;'], ['  \\addplot', '[thick, domain=0:10] {x*exp(-x/2)};']]);
        }
      }
      var intro = null;
      var to = MOTION ? gsap.quickTo(A, 'b', { duration: 0.35, ease: 'power3.out', onUpdate: draw }) : function (v) { A.b = v; draw(); };
      function set(v) { if (intro) { intro.kill(); intro = null; } to(Math.max(0.2, Math.min(10, v))); }
      function fromPointer(e) { set((vbX(svg, e, 260) - X0) / 22.2); }
      var down = false;
      svg.addEventListener('pointerdown', function (e) { down = true; fromPointer(e); });
      svg.addEventListener('pointermove', function (e) { if (down || e.pointerType === 'mouse') fromPointer(e); });
      window.addEventListener('pointerup', function () { down = false; });
      range.addEventListener('input', function () { set(+range.value); });
      draw();
      onSee(card, function () { if (MOTION) intro = gsap.to(A, { b: 5, duration: 1.6, ease: 'power2.inOut', onUpdate: draw }); });
    }
  }

  /* =====================================================================
     data — Table 1 becomes Figure 1; pick a chart type, fit the model
     ===================================================================== */
  function setupData() {
    var svg = $('.data__svg');
    if (!svg) return;
    var DATA = [[0, 80], [2, 67], [4, 57], [6, 48], [8, 43], [10, 37]];
    function X(t) { return 60 + 28 * t; }          // t = 0 sits clear of the axis, so its bar does too
    function Y(T) { return 190 - (T - 20) * (170 / 70); }
    function model(t, k) { return 20 + 60 * Math.exp(-t / k); }
    function rms(k) {
      var sum = 0;
      DATA.forEach(function (p) { var e = p[1] - model(p[0], k); sum += e * e; });
      return Math.sqrt(sum / DATA.length);
    }
    var BEST = 4, BEST_ERR = Infinity;
    for (var kk = 4; kk <= 14.001; kk += 0.5) { var e = rms(kk); if (e < BEST_ERR) { BEST_ERR = e; BEST = kk; } }

    var ticks = $('#dataTicks'), barsG = $('#dataBars'), ptsG = $('#dataPts');
    var line = $('#dataLine'), fit = $('#dataFit'), clip = $('#clipFitRect'), legend = $('#dataLegend');
    [[20, '20'], [40, '40'], [60, '60'], [80, '80']].forEach(function (p) {
      ticks.appendChild(s('path', { d: 'M44 ' + r1(Y(p[0])) + 'h-4' }));
      var t = s('text', { x: 36, y: r1(Y(p[0])) + 4, 'text-anchor': 'end' }); t.textContent = p[1]; ticks.appendChild(t);
    });
    for (var tx = 0; tx <= 10; tx += 2) {
      ticks.appendChild(s('path', { d: 'M' + r1(X(tx)) + ' 190v4' }));
      var lab = s('text', { x: r1(X(tx)), y: 206, 'text-anchor': 'middle' }); lab.textContent = tx; ticks.appendChild(lab);
    }
    var axisLab = s('text', { x: 200, y: 224, 'text-anchor': 'middle', 'font-style': 'italic' }); axisLab.textContent = 't (min)'; ticks.appendChild(axisLab);

    var bars = DATA.map(function (p) {
      var b = s('rect', { class: 'data__bar', x: r1(X(p[0]) - 9), width: 18, y: r1(Y(p[1])), height: r1(190 - Y(p[1])) });
      barsG.appendChild(b); return b;
    });
    var pts = DATA.map(function (p) {
      var c = s('circle', { class: 'data__pt', cx: r1(X(p[0])), cy: r1(Y(p[1])), r: 3.2 });
      ptsG.appendChild(c); return c;
    });
    line.setAttribute('points', DATA.map(function (p) { return r1(X(p[0])) + ',' + r1(Y(p[1])); }).join(' '));
    var lineLen = 0;
    try { lineLen = line.getTotalLength(); } catch (err) { lineLen = 400; }

    var rows = $$('#dataRows tr');
    var seg = $('#chartSeg'), thumb = seg.querySelector('.seg__thumb'), segBtns = $$('button', seg);
    var range = $('#kRange'), kOut = $('#kOut'), kWrap = $('#kWrap');
    var rmsBox = $('#rmsBox'), rmsVal = $('#rmsVal'), rmsNote = $('#rmsNote');
    var texBox = $('#dataTex'), capText = $('#dataCapText'), legendK = $('#legendK');
    var mode = 'fit', k = parseFloat(range.value), shownErr = { v: rms(k) };

    function kLabel(v) { return v % 1 ? v.toFixed(1) : String(v); }
    function fitPoints(kv) {
      var a = [];
      for (var t = 0; t <= 10.001; t += 0.25) a.push(r1(X(t)) + ',' + r1(Y(model(t, kv))));
      return a.join(' ');
    }
    function texLines() {
      var axis = mode === 'bar' ? '{axis}[ybar, xlabel=$t$ (min), ylabel=$T$ (°C)]' : '{axis}[xlabel=$t$ (min), ylabel=$T$ (°C)]';
      var L = [['\\begin', axis]];
      if (mode === 'fit') { L.push(['  \\addplot', '[only marks, mark=*] table {cooling.dat};']); L.push(['  \\addplot', '[domain=0:10] {20 + 60*exp(-x/' + kLabel(k) + ')};']); }
      if (mode === 'line') L.push(['  \\addplot', '[mark=*] table {cooling.dat};']);
      if (mode === 'bar') L.push(['  \\addplot', ' table {cooling.dat};']);
      L.push(['\\end', '{axis}']);
      return L;
    }
    function renderTex(flashLast) {
      texBox.textContent = '';
      var els = texLines().map(function (p) {
        var d = h('div');
        d.appendChild(h('span', 'k', p[0]));
        d.appendChild(document.createTextNode(p[1]));
        texBox.appendChild(d);
        return d;
      });
      if (MOTION && flashLast) {
        var target = els.slice(1, -1);
        gsap.fromTo(target, { backgroundColor: 'rgba(240,198,124,.35)' }, { backgroundColor: 'rgba(240,198,124,0)', duration: 0.8, ease: 'power2.out' });
      }
    }
    function updateFit(animateNum) {
      fit.setAttribute('points', fitPoints(k));
      kOut.textContent = kLabel(k) + ' min';
      legendK.textContent = kLabel(k);              // the legend's exponent is −t/k; only k changes
      var err = rms(k), best = Math.abs(k - BEST) < 0.01;
      rmsBox.classList.toggle('is-best', best);
      rmsNote.textContent = best ? 'Best fit for this data ✓' : 'Best near ' + kLabel(BEST) + ' min';
      // the measurement the model misses most lights up, in the table and the plot
      var worst = 0, worstE = -1;
      DATA.forEach(function (p, n) { var d = Math.abs(p[1] - model(p[0], k)); if (d > worstE) { worstE = d; worst = n; } });
      rows.forEach(function (r, n) { r.classList.toggle('is-hot', !best && n === worst && mode === 'fit'); });
      pts.forEach(function (c, n) { c.setAttribute('r', !best && n === worst && mode === 'fit' ? 5 : 3.2); });
      if (MOTION && animateNum) {
        gsap.to(shownErr, { v: err, duration: 0.4, ease: 'power2.out', overwrite: true, onUpdate: function () { rmsVal.textContent = shownErr.v.toFixed(1) + ' °C'; } });
      } else { shownErr.v = err; rmsVal.textContent = err.toFixed(1) + ' °C'; }
      if (best && MOTION && !rmsBox._pulsed) { rmsBox._pulsed = true; gsap.fromTo(rmsVal, { scale: 1.25 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' }); }
      if (!best) rmsBox._pulsed = false;
    }

    function moveThumb(now) {
      var b = segBtns.filter(function (x) { return x.getAttribute('data-mode') === mode; })[0];
      if (!b) return;
      if (!gsap) { seg.classList.add('is-static'); return; }
      gsap.to(thumb, { x: b.offsetLeft - 3, width: b.offsetWidth, duration: (now || !MOTION) ? 0 : 0.45, ease: 'power3.out', overwrite: 'auto' });
    }

    function show(next, first) {
      if (enter && enter.progress() < 1) enter.progress(1);   // a choice made mid-entrance wins over the entrance
      mode = next;
      segBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode)); });
      moveThumb(first);
      kWrap.classList.toggle('is-off', mode !== 'fit');
      range.disabled = mode !== 'fit';
      rmsBox.style.visibility = mode === 'fit' ? 'visible' : 'hidden';
      if (gsap) gsap.to(legend, { autoAlpha: mode === 'fit' ? 1 : 0, duration: (first || !MOTION) ? 0 : 0.3 });
      else legend.style.visibility = mode === 'fit' ? 'visible' : 'hidden';
      capText.textContent = { fit: 'Measured temperature and the fitted model.', line: 'Measured temperature over time.', bar: 'Temperature at each measurement.' }[mode];
      renderTex(!first);
      updateFit(false);
      if (!gsap) {                                   // no GSAP: jump straight to the chosen chart
        bars.forEach(function (b, n) {
          b.setAttribute('y', mode === 'bar' ? r1(Y(DATA[n][1])) : 190);
          b.setAttribute('height', mode === 'bar' ? r1(190 - Y(DATA[n][1])) : 0);
        });
        pts.forEach(function (c) { c.style.visibility = mode === 'bar' ? 'hidden' : 'visible'; });
        line.style.visibility = mode === 'line' ? 'visible' : 'hidden';
        clip.setAttribute('width', mode === 'fit' ? 320 : 0);
        return;
      }
      var d = first || !MOTION ? 0 : 1;

      // bars grow from the axis, or sink back into it
      gsap.to(bars, { attr: { y: function (n) { return mode === 'bar' ? r1(Y(DATA[n][1])) : 190; }, height: function (n) { return mode === 'bar' ? r1(190 - Y(DATA[n][1])) : 0; } },
        duration: 0.6 * d, ease: mode === 'bar' ? 'back.out(1.6)' : 'power2.in', stagger: 0.05 * d });
      // points pop for scatter and line, drop away for bars
      gsap.to(pts, { autoAlpha: mode === 'bar' ? 0 : 1, scale: mode === 'bar' ? 0 : 1, transformOrigin: '50% 50%', duration: 0.4 * d, ease: 'back.out(2)', stagger: 0.04 * d });
      // the line draws itself left to right
      gsap.killTweensOf(line);
      if (mode === 'line') {
        gsap.fromTo(line, { strokeDasharray: lineLen, strokeDashoffset: lineLen, autoAlpha: 1 }, { strokeDashoffset: 0, duration: 0.9 * d, ease: 'power2.inOut' });
      } else gsap.to(line, { autoAlpha: 0, duration: 0.25 * d });
      // the fitted curve wipes in (a quick change of mind must not leave an older wipe running)
      gsap.killTweensOf(clip);
      gsap.to(clip, { attr: { width: mode === 'fit' ? 320 : 0 }, duration: (mode === 'fit' ? 0.9 : 0.3) * d, ease: 'power2.inOut' });
    }

    segBtns.forEach(function (b) {
      b.addEventListener('click', function () { if (b.getAttribute('data-mode') !== mode) show(b.getAttribute('data-mode')); });
    });
    range.addEventListener('input', function () {
      k = parseFloat(range.value);
      updateFit(true);
      var last = texBox.children[2];
      if (last && mode === 'fit') last.lastChild.textContent = '[domain=0:10] {20 + 60*exp(-x/' + kLabel(k) + ')};';
    });
    window.addEventListener('resize', function () { moveThumb(true); });

    show('fit', true);
    if (!MOTION) { clip.setAttribute('width', 320); return; }

    // entrance: the table fills in, the points drop onto the axes, the fit wipes in
    gsap.set(clip, { attr: { width: 0 } });
    gsap.set(pts, { autoAlpha: 0 });
    gsap.set(rows, { opacity: 0 });
    var enter = gsap.timeline({ paused: true });
    enter.fromTo(rows, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out' })
      .fromTo(pts, { autoAlpha: 0, y: -40 }, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.08, ease: 'bounce.out' }, 0.25)
      .to(clip, { attr: { width: 320 }, duration: 1.1, ease: 'power2.inOut' }, 0.9)
      .fromTo(legend, { autoAlpha: 0 }, { autoAlpha: function () { return mode === 'fit' ? 1 : 0; }, duration: 0.4 }, 1.6);
    ST.create({ trigger: '.data__sheet', start: 'top 78%', once: true, onEnter: function () { enter.play(); } });
  }

  /* =====================================================================
     how it works — a line runs through the three steps as you scroll
     ===================================================================== */
  function setupHow() {
    var steps = $$('.how__step');
    var lineEl = $('#howLine');
    if (!lineEl) return;
    if (!MOTION) { steps.forEach(function (s2) { s2.classList.add('is-on'); }); root.classList.add('motion-off'); return; }
    gsap.fromTo(steps, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.15, clearProps: 'transform', scrollTrigger: { trigger: '#howSteps', start: 'top 82%', once: true } });
    var mm = gsap.matchMedia();
    function light(p) { steps.forEach(function (s2, n) { s2.classList.toggle('is-on', p >= n / (steps.length - 1) - 0.02); }); }
    mm.add('(min-width: 901px)', function () {
      gsap.fromTo(lineEl, { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#howSteps', start: 'top 75%', end: 'top 30%', scrub: 0.4, onUpdate: function (self) { light(self.progress); } } });
    });
    mm.add('(max-width: 900px)', function () {
      gsap.fromTo(lineEl, { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '#howSteps', start: 'top 70%', end: 'bottom 55%', scrub: 0.4, onUpdate: function (self) { light(self.progress); } } });
    });
  }

  /* =====================================================================
     templates — from PT.home.templates(), each with a sketch of its page
     ===================================================================== */
  function ln(cls, width) {
    var el = h('i', 'ln' + (cls ? ' ' + cls : ''));
    if (width) el.style.width = width;
    return el;
  }
  var SKETCH = {
    blank: function (p) {
      p.appendChild(ln('ln--title', '56%'));
      p.appendChild(ln('ln--sub', '30%'));
      var c = h('span', 'caret tpl__caret'); c.style.marginTop = '14px'; p.appendChild(c);
    },
    article: function (p) {
      p.appendChild(ln('ln--title', '60%')); p.appendChild(ln('ln--sub', '30%'));
      p.appendChild(ln('ln--c', '78%')); p.appendChild(ln('ln--c', '78%')); p.appendChild(ln('ln--c', '58%'));
      p.appendChild(ln('ln--head', '40%')); p.appendChild(ln('', '100%')); p.appendChild(ln('', '92%'));
      p.appendChild(h('span', 'tpl__math', 'a² + b² = c²'));
      p.appendChild(ln('', '100%')); p.appendChild(ln('', '70%'));
    },
    homework: function (p) {
      p.appendChild(h('span', 'tpl__label', 'Problem 1'));
      p.appendChild(ln('', '100%')); p.appendChild(ln('', '82%'));
      var sol = h('div', 'tpl__sol');
      var lab = h('span', 'tpl__label'); lab.appendChild(h('i', null, 'Solution.')); sol.appendChild(lab);
      sol.appendChild(ln('', '92%')); sol.appendChild(ln('', '66%'));
      p.appendChild(sol);
      p.appendChild(h('span', 'tpl__label', 'Problem 2'));
      p.appendChild(ln('', '100%')); p.appendChild(ln('', '74%'));
    },
    lab: function (p) {
      p.appendChild(ln('ln--head', '36%')); p.appendChild(ln('', '100%')); p.appendChild(ln('', '86%'));
      var tbl = h('div', 'tpl__tbl');
      ['t', 'x', 'σ', '0.0', '0.00', '0.01', '0.5', '1.22', '0.02'].forEach(function (c) { tbl.appendChild(h('span', null, c)); });
      p.appendChild(tbl);
      p.appendChild(ln('', '100%')); p.appendChild(ln('', '60%'));
    },
    data: function (p) {
      p.appendChild(ln('ln--head', '40%')); p.appendChild(ln('', '100%'));
      var g = s('svg', { viewBox: '0 0 120 64', class: 'tpl__mini', 'aria-hidden': 'true' });
      g.appendChild(s('path', { d: 'M8 4V58H116' }));
      g.appendChild(s('polyline', { class: 'fit', points: '8,10 22,22 36,31 50,38 64,44 78,48 92,51 106,53' }));
      [[8, 11], [36, 30], [64, 45], [92, 50]].forEach(function (c) { g.appendChild(s('circle', { cx: c[0], cy: c[1], r: 2 })); });
      p.appendChild(g);
      p.appendChild(ln('', '100%')); p.appendChild(ln('', '66%'));
    },
    gallery: function (p) {
      p.appendChild(ln('ln--head', '44%'));
      var g = s('svg', { viewBox: '0 0 120 64', class: 'tpl__mini', 'aria-hidden': 'true' });
      g.appendChild(s('path', { class: 'pie', d: 'M28 32L28 8A24 24 0 0 1 50.8 39.4Z' }));
      g.appendChild(s('path', { d: 'M28 32L50.8 39.4A24 24 0 1 1 28 8' }));
      g.appendChild(s('path', { d: 'M66 58V8M66 58H118' }));
      [[70, 40], [80, 22], [90, 12], [100, 26], [110, 44]].forEach(function (b) { g.appendChild(s('rect', { x: b[0], y: b[1], width: 8, height: 58 - b[1] })); });
      p.appendChild(g);
      p.appendChild(ln('', '100%')); p.appendChild(ln('', '72%'));
    },
    notes: function (p) {
      p.appendChild(ln('ln--head', '44%')); p.appendChild(ln('', '100%'));
      var th = h('span', 'tpl__label', 'Theorem 1. '); th.appendChild(h('i', null, 'Every bounded…')); p.appendChild(th);
      p.appendChild(ln('', '92%')); p.appendChild(ln('', '58%'));
      var pr = h('span', 'tpl__label'); pr.appendChild(h('i', null, 'Proof.')); p.appendChild(pr);
      p.appendChild(ln('', '100%'));
      var q = h('div', 'tpl__qed'); q.appendChild(ln('', '')); q.appendChild(h('b')); p.appendChild(q);
    }
  };

  function setupTemplates() {
    var grid = $('#tplGrid');
    if (!grid || !PT.home) return;
    var list = PT.home.templates();
    if (!list.length) return;
    grid.textContent = '';
    list.forEach(function (t) {
      var a = h('a', 'tpl');
      a.href = t.href;
      var sheet = h('div', 'tpl__sheet');
      sheet.setAttribute('aria-hidden', 'true');
      (SKETCH[t.id] || SKETCH.blank)(sheet);
      var open = h('span', 'tpl__open', 'Open ');
      var arrow = s('svg', { width: 12, height: 12, viewBox: '0 0 16 16' });
      arrow.appendChild(s('path', { d: 'M3 8h10M9 4l4 4-4 4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      open.appendChild(arrow);
      sheet.appendChild(open);
      a.appendChild(sheet);
      a.appendChild(h('span', 'tpl__name', t.name));
      if (t.desc) a.appendChild(h('span', 'tpl__desc', t.desc));
      grid.appendChild(a);
    });
    if (!MOTION) return;
    var cards = $$('.tpl', grid);
    gsap.set(cards, { opacity: 0 });                 // opacity, not visibility: the links stay reachable by Tab
    ST.batch(cards, {
      start: 'top 90%', once: true,
      onEnter: function (els) {
        gsap.fromTo(els, { opacity: 0, y: 50, rotate: function (n) { return n % 2 ? 2 : -2; } },
          { opacity: 1, y: 0, rotate: 0, duration: 0.85, ease: 'power3.out', stagger: 0.1, clearProps: 'transform' });
        els.forEach(function (card, n) {   // then each page "writes" its lines
          gsap.fromTo($$('.ln, .tpl__label, .tpl__math, .tpl__tbl, .tpl__mini', card), { scaleX: 0, autoAlpha: 0 },
            { scaleX: 1, autoAlpha: 1, transformOrigin: '0 50%', duration: 0.35, ease: 'power2.out', stagger: 0.045, delay: 0.3 + n * 0.1 });
        });
      }
    });
  }

  /* =====================================================================
     recent — your own documents, only when there are some
     ===================================================================== */
  function ago(ms) {
    var diff = (ms - Date.now()) / 1000;
    var units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    try {
      var fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });   // the page is in English
      for (var n = 0; n < units.length; n++) {
        if (Math.abs(diff) >= units[n][1]) return 'Edited ' + fmt.format(Math.round(diff / units[n][1]), units[n][0]);
      }
      return 'Edited just now';
    } catch (e) { return 'Edited ' + new Date(ms).toLocaleDateString('en'); }
  }
  function setupRecent() {
    if (!PT.home) return;
    PT.home.recent(3).then(function (docs) {
      if (!docs.length) return;
      var list = $('#recentList'), sec = $('#recent');
      docs.forEach(function (d) {
        var a = h('a', 'doc-card');
        a.href = d.href;
        var icon = h('span', 'doc-card__icon'); icon.setAttribute('aria-hidden', 'true');
        icon.appendChild(h('i')); icon.appendChild(h('i')); icon.appendChild(h('i'));
        var text = h('span', 'doc-card__text');
        text.appendChild(h('span', 'doc-card__title', d.title));
        if (d.updated) text.appendChild(h('span', 'doc-card__when', ago(d.updated)));
        var arrow = s('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': 'true' });
        arrow.appendChild(s('path', { d: 'M3 8h10M9 4l4 4-4 4' }));
        a.appendChild(icon); a.appendChild(text); a.appendChild(arrow);
        list.appendChild(a);
      });
      sec.hidden = false;
      if (MOTION) {
        gsap.fromTo(list.children, { opacity: 0, y: 24 }, {
          opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.08, clearProps: 'transform',
          scrollTrigger: { trigger: list, start: 'top 92%', once: true }
        });
      }
      if (window.ScrollTrigger) ST.refresh();        // the section pushed everything below it down
    });
  }

  /* =====================================================================
     privacy, desktop, footer
     ===================================================================== */
  function setupPrivacy() {
    var sec = $('#privacy'), glow = $('.privacy__glow');
    if (FINE && sec && glow) {
      sec.addEventListener('mousemove', function (e) {
        var r = sec.getBoundingClientRect();
        glow.style.setProperty('--gx', (e.clientX - r.left) + 'px');
        glow.style.setProperty('--gy', (e.clientY - r.top) + 'px');
      });
    }
    if (!MOTION) return;
    $$('.draw').forEach(function (svg) {
      var parts = $$('path, circle', svg);
      gsap.fromTo(parts, { strokeDasharray: 1, strokeDashoffset: 1 }, {
        strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.18,
        scrollTrigger: { trigger: svg, start: 'top 88%', once: true }
      });
    });
  }

  function setupDesktop() {
    var ua = navigator.userAgent || '';
    var os = /Windows/i.test(ua) ? 'windows' : /Mac/i.test(ua) && !/iPhone|iPad/i.test(ua) ? 'mac' : /Linux|X11/i.test(ua) && !/Android/i.test(ua) ? 'linux' : null;
    if (os) {
      var mine = $('.os__item[data-os="' + os + '"]');
      if (mine) mine.classList.add('is-yours');
    }
    if (!MOTION) return;
    gsap.fromTo('.os__item', { opacity: 0, y: 20, scale: 0.94 }, {
      opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.8)', stagger: 0.08, clearProps: 'transform',
      scrollTrigger: { trigger: '#osList', start: 'top 88%', once: true }
    });
  }

  function setupFooter() {
    var top = $('#toTop');
    if (top) top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
      var brand = $('.nav .brand');
      if (brand) brand.focus({ preventScroll: true });
    });
  }

  /* =====================================================================
     start
     ===================================================================== */
  try { setupTry(); } catch (e) { if (window.console) console.error(e); }   // the editor's math engine is a separate file: never let it stop the page
  setupFooter();

  if (!gsap || !ST) {                         // no GSAP: a static, complete page — every demo in its finished state
    root.classList.add('no-js');
    $$('.how__step').forEach(function (st) { st.classList.add('is-on'); });
    setupHero(false);
    setupPlot();
    setupGallery();
    setupData();
    setupTemplates();
    setupDesktop();
    setupRecent();
    return;
  }

  setupPlot();
  setupGallery();
  setupNav();
  setupButtons();
  setupData();
  setupTemplates();
  setupDesktop();
  setupHow();
  setupPrivacy();
  setupRecent();

  if (MOTION) {
    setupReveals();
    var heroTl = setupHero(false);
    heroEntrance(function () { if (heroTl && heroTl.start) heroTl.start(); });
  } else {
    setupHero(false);
  }
  root.classList.add('motion-ready');

  // fonts change line lengths, so measure again once they are in
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ST.refresh(); });
  window.addEventListener('load', function () { ST.refresh(); });
})();
