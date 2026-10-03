/* PaperTeX — the home page's behaviour and motion (index.html).

   Needs, in order: js/vendor/gsap.min.js, js/vendor/ScrollTrigger.min.js,
   js/store.js, js/templates.js, js/home.js. Every part degrades: without
   GSAP the page is static but complete; with prefers-reduced-motion the
   demos show their finished state and nothing moves on its own.

   Parts, top to bottom:
     convert / renderMath   the formula rules used by "Try it" and the plot
     reveals                split headings, fade-ups, hero entrance
     nav                    stuck state, scroll progress, current section
     buttons                ripple on press, magnetic primary buttons
     hero                   the Gaussian integral typing itself
     try                    live formula box, examples typed in, copy
     plot                   a function typed and drawn as you scroll
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
          if (used.indexOf(c) >= 0 && !(c === '^' && tex[tex.length - 1] === "'")) { tex.push('{}'); used = ''; }
          used += c;
          var up = c === '^';
          var g = group(lv + 1, sh + (up ? (lv === 0 ? 11 : 7) : (lv === 0 ? -7 : -4)), c);
          toks = toks.concat(g.toks);
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
        var c2 = str[i++], up2 = c2 === '^';
        var g2 = group(lv + 1, sh + (up2 ? 7 : -4), c2);
        var gap = used.indexOf(c2) >= 0 ? '{}' : '';
        used = gap ? c2 : used + c2;
        u = { toks: u.toks.concat(g2.toks), tex: u.tex + gap + c2 + wrap(g2.tex) };
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
          toks.push(tok(d, 'num', lv + 1, sh + (lv === 0 ? -7 : -4)));
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
     pop in, so typing "alph" → "alpha" makes the α arrive, not the line. */
  function renderMath(box, toks, prev, base, animate) {
    var SIZES = [1, 0.7, 0.5];
    var first = 0;
    while (first < toks.length && prev && prev[first] &&
           prev[first].text === toks[first].text && prev[first].kind === toks[first].kind &&
           prev[first].lv === toks[first].lv && prev[first].over === toks[first].over) first++;
    box.textContent = '';
    var fresh = [];
    toks.forEach(function (t, n) {
      var el = h('span', 't t--' + t.kind + (t.over ? ' t--over' : ''), t.text);
      var size = base * SIZES[Math.min(t.lv, 2)] * (t.kind === 'big' ? 1.05 : 1);
      el.style.fontSize = r1(size) + 'px';
      el.style.verticalAlign = r1(t.sh * base / 30) + 'px';
      if (t.kind === 'op') el.style.padding = t.lv === 0 ? '0 .22em' : '0 .1em';
      if (t.kind === 'fn') el.style.paddingRight = '.14em';
      if (t.kind === 'big') el.style.padding = '0 .12em';
      box.appendChild(el);
      if (n >= first) fresh.push(el);
    });
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
    var tl = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: done });
    tl.fromTo(words, { yPercent: 120, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 1.05, stagger: 0.06 }, 0.1)
      .fromTo('[data-hero]', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.1 }, 0.35)
      .fromTo('[data-hero-sheet]', { autoAlpha: 0, y: 80, rotateX: 14, transformOrigin: '50% 100%' },
        { autoAlpha: 1, y: 0, rotateX: 0, duration: 1.2, ease: 'expo.out' }, 0.2)
      .fromTo('[data-hero-code]', { autoAlpha: 0, x: 70, z: 40 }, { autoAlpha: 1, x: 0, z: 40, duration: 1.1, ease: 'expo.out' }, 0.55)
      .fromTo('.hero__controls', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 1.1);
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
    var playBtn = $('#heroPlay'), playLabel = $('#heroPlayLabel'), replayBtn = $('#heroReplay');

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
      $('.hero__controls').style.display = 'none';
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
      .to([intG, body, rest], { autoAlpha: 0, y: -6, duration: 0.35, stagger: 0.05 }, 11.4)
      .set([intG, body, rest], { y: 0 }, 11.9)
      .to({}, { duration: 0.1 }, 11.9);

    // Plays only once started (after the entrance), never while paused by the
    // visitor or scrolled away. Pause also stops the blinking caret and pulses.
    var started = false, userPaused = false, offscreen = false;
    var demoEl = $('#heroDemo');
    function sync() {
      tl.paused(!started || userPaused || offscreen);
      demoEl.classList.toggle('is-paused', userPaused);
      if (userPaused) playBtn.setAttribute('data-paused', '');
      else playBtn.removeAttribute('data-paused');
      playLabel.textContent = userPaused ? 'Play' : 'Pause';
    }
    playBtn.addEventListener('click', function () { started = true; userPaused = !userPaused; sync(); });
    replayBtn.addEventListener('click', function () { started = true; userPaused = false; tl.restart(); sync(); });

    if (!MOTION) {                                   // reduced motion: the finished equation, play on request
      tl.seek('done', false);
      started = true;
      userPaused = true;
      sync();
      return tl;
    }
    ST.create({
      trigger: demoEl, start: 'top bottom', end: 'bottom top',
      onToggle: function (self) { offscreen = !self.isActive; sync(); }
    });
    reset();
    gsap.set(hidden0, { autoAlpha: 0 });
    gsap.set(rad, { '--bar': 0 });
    tl.start = function () { started = true; if (!userPaused) tl.restart(); sync(); };
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
    gsap.to(['.hero__code', '.hero__controls'], { y: 70, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__sheet', { y: -30, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    return tl;
  }

  /* =====================================================================
     try it — type, or pick an example and watch it typed in
     ===================================================================== */
  function setupTry() {
    var input = $('#tryInput'), out = $('#tryOut'), texEl = $('#tryTex');
    var copyBtn = $('#tryCopy'), clearBtn = $('#tryClear');
    if (!input) return;
    var prev = null, auto = null;

    function update(animate) {
      var res = convert(input.value);
      if (!res.toks.length) {
        out.textContent = '';
        var ph = h('span', 'placeholder', 'Start typing — try ');
        ph.appendChild(h('code', null, 'sum a_n <= 1'));
        out.appendChild(ph);
        prev = [];
      } else {
        prev = renderMath(out, res.toks, prev, 32, animate);
      }
      if (texEl.textContent !== (res.tex || ' ')) {
        texEl.textContent = res.tex || ' ';
        texEl.classList.remove('flash');
        void texEl.offsetWidth;
        texEl.classList.add('flash');
      }
    }
    function stopAuto() {
      if (auto) { auto.kill(); auto = null; }
      $$('.chip.is-on').forEach(function (c) { c.classList.remove('is-on'); });
    }

    input.addEventListener('input', function () { stopAuto(); update(true); });
    clearBtn.addEventListener('click', function () {
      stopAuto();
      var old = Array.prototype.slice.call(out.children);
      input.value = '';                              // emptied now, so typing during the fade is kept
      if (MOTION && old.length) {
        gsap.to(old, { autoAlpha: 0, y: -12, scale: 0.6, duration: 0.25, stagger: 0.015, ease: 'power2.in', onComplete: function () { if (!input.value) update(false); } });
      } else update(false);
      input.focus();
    });

    $$('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var text = chip.getAttribute('data-ex');
        stopAuto();
        chip.classList.add('is-on');
        if (!MOTION) { input.value = text; update(false); chip.classList.remove('is-on'); return; }
        var from = input.value, del = { n: from.length }, add = { n: 0 };
        auto = gsap.timeline({ onComplete: function () { chip.classList.remove('is-on'); auto = null; } });
        auto.to(del, {
          n: 0, duration: Math.min(0.45, from.length * 0.018), ease: 'none',
          onUpdate: function () { var v = from.slice(0, Math.round(del.n)); if (v !== input.value) { input.value = v; update(false); } }
        }).to(add, {
          n: text.length, duration: text.length * 0.05, ease: 'none',
          onUpdate: function () { var v = text.slice(0, Math.round(add.n)); if (v !== input.value) { input.value = v; update(true); } }
        });
      });
    });

    copyBtn.addEventListener('click', function () {
      var label = copyBtn.querySelector('span'), status = $('#tryStatus');
      function done(ok) {
        label.textContent = ok ? 'Copied ✓' : 'Select & copy';
        copyBtn.classList.toggle('is-done', ok);
        if (status) status.textContent = ok ? 'LaTeX copied to the clipboard' : 'Copy failed; the LaTeX is selected, press Ctrl+C';
        // the label bounces, not the button, so the button's own hover and press keep working
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

    update(false);
  }

  /* =====================================================================
     plot — a Function plot typed and drawn as you scroll
     ===================================================================== */
  function setupPlot() {
    var stage = $('#plotStage');
    if (!stage) return;
    var curve = $('#fpCurve'), env = $('#fpEnv'), envNeg = $('#fpEnvNeg'), pen = $('#fpPen');
    var clipC = $('#clipCurveRect'), clipE = $('#clipEnvRect');
    var row1 = $('#fpRow1'), row2 = $('#fpRow2'), text1 = $('#fpText1'), text2 = $('#fpText2');
    var mathBox = $('#fpMath'), texBox = $('#plotTex'), cap = $('#plotCapText');
    var steps = $$('#plotSteps li');

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
    function wave(m) { return function (x) { return Math.sin(2 * x) * (1 - m + m * Math.exp(-x / 4)); }; }

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
    env.setAttribute('d', path(function (x) { return Math.exp(-x / 4); }));
    envNeg.setAttribute('d', path(function (x) { return -Math.exp(-x / 4); }));

    var S1A = 'sin(2x)', S1 = 'sin(2x) * e^(-x/4)', S2 = '+-e^(-x/4)';
    var TEX = [
      ['\\begin', '{axis}[domain=0:12, samples=200]'],
      null,
      ['\\end', '{axis}']
    ];
    var PLOTS = {
      1: [['  \\addplot', '[thick] {sin(deg(2*x))};']],
      2: [['  \\addplot', '[thick] {sin(deg(2*x))*exp(-x/4)};']],
      3: [['  \\addplot', '[thick] {sin(deg(2*x))*exp(-x/4)};'], ['  \\addplot', '[dashed] {exp(-x/4)};'], ['  \\addplot', '[dashed] {-exp(-x/4)};']]
    };
    var CAPS = ['y = sin 2x, typed as you scroll.', 'y = sin 2x on 0 ≤ x ≤ 12.', 'A damped wave, y = sin 2x · e^(−x/4).', 'The damped wave and its envelope ±e^(−x/4).'];

    var last = { t1: null, t2: null, m: null, tex: null, step: null, math: null };
    var mathPrev = null;
    function line(cmd, rest, fresh) {
      var div = h('div', fresh ? 'fresh' : null);
      div.appendChild(h('span', 'k', cmd));
      div.appendChild(document.createTextNode(rest));
      return div;
    }
    function setTex(n) {
      texBox.textContent = '';
      texBox.appendChild(line(TEX[0][0], TEX[0][1]));
      var adds = [];
      (PLOTS[n] || []).forEach(function (p, k) {
        var el = line(p[0], p[1], true);
        texBox.appendChild(el);
        if (n === 3 ? k > 0 : true) adds.push(el);
      });
      texBox.appendChild(line(TEX[2][0], TEX[2][1]));
      if (MOTION && adds.length) gsap.fromTo(adds, { backgroundColor: 'rgba(240,198,124,.35)', x: -8 }, { backgroundColor: 'rgba(240,198,124,0)', x: 0, duration: 0.9, ease: 'power2.out', stagger: 0.1 });
      cap.textContent = CAPS[n];
    }

    var P = { c1: 0, d1: 0, c2: 0, m: 0, d2: 0 };
    function render(animate) {
      var t1 = S1.slice(0, Math.round(P.c1)), t2 = S2.slice(0, Math.round(P.c2));
      if (t1 !== last.t1) { text1.textContent = t1; last.t1 = t1; }
      if (t2 !== last.t2) { text2.textContent = t2; last.t2 = t2; }
      var onRow2 = P.c2 > 0;
      row1.classList.toggle('is-active', !onRow2);
      row2.classList.toggle('is-active', onRow2);
      row2.classList.toggle('fp__row--off', !onRow2);

      var shown = onRow2 ? t2 : t1;
      if (shown !== last.math) {
        last.math = shown;
        if (!shown) { mathBox.textContent = ''; mathPrev = []; }
        else mathPrev = renderMath(mathBox, convert('y = ' + shown).toks, mathPrev, 26, animate);
      }

      if (P.m !== last.m) { curve.setAttribute('d', path(wave(P.m))); last.m = P.m; }
      clipC.setAttribute('width', P.d1 >= 1 ? 520 : X0 + (X1 - X0) * P.d1);
      clipE.setAttribute('width', P.d2 >= 1 ? 520 : X0 + (X1 - X0) * P.d2);

      var drawing = (P.d1 > 0 && P.d1 < 1) ? [P.d1, wave(P.m)] : (P.d2 > 0 && P.d2 < 1) ? [P.d2, function (x) { return Math.exp(-x / 4); }] : null;
      if (drawing) {
        var x = XMAX * drawing[0];
        pen.setAttribute('cx', r1(X(x)));
        pen.setAttribute('cy', r1(Y(drawing[1](x))));
        pen.style.opacity = 1;
      } else pen.style.opacity = 0;

      var tex = P.d2 > 0 ? 3 : P.m > 0 ? 2 : P.d1 > 0 ? 1 : 0;
      if (tex !== last.tex) { last.tex = tex; setTex(tex); }
      var step = P.c2 > 0 ? 2 : P.c1 > S1A.length ? 1 : 0;
      if (step !== last.step) {
        last.step = step;
        steps.forEach(function (li, k) { li.classList.toggle('is-on', k === step); });
      }
    }

    if (!MOTION) {                                   // reduced motion or no GSAP: the finished figure
      P.c1 = S1.length; P.d1 = 1; P.m = 1; P.c2 = S2.length; P.d2 = 1;
      render(false);
      return;
    }

    var tl = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: function () { render(true); } });
    tl.to(P, { c1: S1A.length, duration: 1 })
      .to(P, { d1: 1, duration: 1.3 })
      .to(P, { c1: S1.length, duration: 1.4 }, '+=0.2')
      .to(P, { m: 1, duration: 1.3, ease: 'power1.inOut' })
      .to(P, { c2: S2.length, duration: 1.1 }, '+=0.2')
      .to(P, { d2: 1, duration: 1.2 })
      .to({}, { duration: 0.6 });

    render(false);

    // Pinned only where the two columns sit side by side and the stage fits the
    // screen. refreshPriority keeps the pin measured first whenever matchMedia
    // re-creates it, so every trigger below it accounts for its 2600px.
    var mm = gsap.matchMedia();
    mm.add('(min-width: 1024px) and (min-height: 640px)', function () {
      ST.create({ trigger: stage, start: 'top 64px', end: '+=2600', pin: true, scrub: 0.6, animation: tl, anticipatePin: 1, refreshPriority: 1 });
    });
    // narrower or shorter: the chart sits right under the typing box, and the
    // drawing follows the chart itself through the screen
    mm.add('not all and (min-width: 1024px) and (min-height: 640px)', function () {   // the exact complement: no gap at fractional sizes
      ST.create({ trigger: '.plot__paper', start: 'top 80%', end: 'top 25%', scrub: 0.6, animation: tl, refreshPriority: 1 });
    });
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
      legendK.textContent = '−t/' + kLabel(k);
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
  setupTry();
  setupFooter();

  if (!gsap || !ST) {                         // no GSAP: a static, complete page — every demo in its finished state
    root.classList.add('no-js');
    $$('.how__step').forEach(function (st) { st.classList.add('is-on'); });
    setupHero(false);
    setupPlot();
    setupData();
    setupTemplates();
    setupDesktop();
    setupRecent();
    return;
  }

  // the pinned section first: every trigger below it is measured after its spacer
  setupPlot();
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
