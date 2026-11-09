/* PaperTeX — the home page's behaviour.

   The page is one fixed stage (index.html, css/landing.css) and it does not
   scroll. There are three kinds of place:

     'open'   the opening. Pull the handle along its arc to the end and the
              map appears.
     'hub'    the map: five arrows 72 degrees apart. Four lead to rooms, the
              fifth to the editor.
     a room   'eq', 'ch', 'da', 'pdf': a page in focus, with marks on it that
              open the LaTeX behind that spot.

   The map and the rooms lie on one plane; a room sits off in its arrow's
   direction, and going there slides the plane under the window. This file
   keeps where you are in custom properties on .stage, which the stylesheet
   turns into all the movement:
     --p        the opening's handle, 0 at the start of the arc, 1 at its end
     --cx --cy  where the window is on the plane (0 0 is the map)
     --px --py  a small lean towards the arrow under the pointer

   No libraries. Nothing here is needed to reach the editor: every link on
   the page is a plain link. */
(function () {
  'use strict';
  var REDUCE = false;
  try { REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

  var stage = $('.stage');
  if (!stage) return;
  var open = $('#open'), rooms = $$('.room'), view = '', busy = false, openT;
  function set(name, v) { stage.style.setProperty(name, v); }
  /* a direction given in degrees, anticlockwise from the right, as screen x and y */
  function vec(deg) { var r = deg * Math.PI / 180; return { x: Math.cos(r), y: -Math.sin(r) }; }

  /* ---- the figure on the function page ---- */
  (function () {
    var w = '', e = '', e2 = '';
    for (var i = 0; i <= 235; i++) {
      var x = i / 235 * 12, px = 30 + i * 2, env = Math.exp(-x / 4);
      w += (i ? 'L' : 'M') + px + ' ' + (110 - Math.sin(2 * x) * env * 90).toFixed(1);
      e += (i ? 'L' : 'M') + px + ' ' + (110 - env * 90).toFixed(1);
      e2 += (i ? 'L' : 'M') + px + ' ' + (110 + env * 90).toFixed(1);
    }
    $('#wave').setAttribute('d', w);
    $('#env').setAttribute('d', e + e2);
  })();

  /* ---- the background: a title page, then a copy of every sheet ---- */
  (function () {
    var far = $('#far');
    var tp = document.createElement('div');
    tp.className = 'sheet title-pg';
    var b = document.createElement('b'); b.textContent = 'Write the paper, not the code.';
    var s = document.createElement('span'); s.textContent = 'PaperTeX';
    tp.appendChild(b); tp.appendChild(s); far.appendChild(tp);
    $$('.room .sheet').forEach(function (sheet) {
      var c = sheet.cloneNode(true);
      c.removeAttribute('aria-label');
      $$('.hot, .code', c).forEach(function (n) { n.remove(); });
      $$('[id]', c).forEach(function (n) { n.removeAttribute('id'); });
      far.appendChild(c);
    });
    var blank = document.createElement('div'); blank.className = 'sheet'; far.appendChild(blank);
  })();

  /* ---- put every room, arrow and ray in its direction ---- */
  var where = { hub: { x: 0, y: 0 } };
  rooms.forEach(function (r) {
    if (r.dataset.a === undefined) return;
    var a = +r.dataset.a, v = vec(a);
    where[r.dataset.r] = v;
    r.style.setProperty('--x', v.x.toFixed(4)); r.style.setProperty('--y', v.y.toFixed(4));
    /* its way back points at the map */
    r.style.setProperty('--rot', (-(a + 180)) + 'deg');
  });
  var rays = $('#rays'), NS = 'http://www.w3.org/2000/svg', rayOf = {}, notchOf = {};
  function shape(tag, cls, attrs) {
    var n = document.createElementNS(NS, tag);
    if (cls) n.setAttribute('class', cls);
    for (var key in attrs) n.setAttribute(key, attrs[key]);
    rays.appendChild(n); return n;
  }
  /* the compass round the words: a ring and a toothed rim */
  shape('circle', 'rose', { r: 118 });
  shape('circle', 'rose-teeth', { r: 125 });
  $$('.dir').forEach(function (d, n) {
    var a = +d.dataset.a, v = vec(a);
    d.style.setProperty('--n', n);
    d.style.setProperty('--x', v.x.toFixed(4)); d.style.setProperty('--y', v.y.toFixed(4));
    d.style.setProperty('--rot', (-a) + 'deg');
    /* a notch on the ring at this bearing, and the ray out to the node */
    notchOf[d.dataset.to] = shape('path', 'notch', { d: 'M' + (v.x * 111).toFixed(1) + ' ' + (v.y * 111).toFixed(1) + 'L' + (v.x * 125).toFixed(1) + ' ' + (v.y * 125).toFixed(1) });
    rayOf[d.dataset.to] = shape('line', '', { x1: (v.x * 138).toFixed(1), y1: (v.y * 138).toFixed(1), x2: (v.x * 212).toFixed(1), y2: (v.y * 212).toFixed(1) });
  });
  where.go = vec(0);

  /* ---- the marks at the edge: every place, in order ---- */
  var ORDER = ['open', 'hub', 'eq', 'ch', 'da', 'pdf'], pager = $('#pager'), marks = {};
  ORDER.forEach(function (id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', id === 'open' ? 'Opening' : id === 'hub' ? 'Map' : $('.room[data-r="' + id + '"]').getAttribute('aria-label'));
    b.addEventListener('click', function () { if (id === 'open') toOpen(); else go(id); });
    pager.appendChild(b); marks[id] = b;
  });

  function closeHots(root) { $$('.hot', root).forEach(function (h) { h.setAttribute('aria-expanded', 'false'); }); }

  /* ---- be at a place ---- */
  function show(id) {
    /* where you came from: the map comes in slowly only out of the opening */
    stage.dataset.from = view;
    view = id;
    stage.dataset.v = id;
    var at = where[id] || where.hub;
    set('--cx', at.x.toFixed(4)); set('--cy', at.y.toFixed(4)); set('--px', 0); set('--py', 0);
    open.inert = id !== 'open';
    rooms.forEach(function (r) { var on = r.dataset.r === id; r.classList.toggle('on', on); r.inert = !on; });
    ORDER.forEach(function (k) { marks[k].setAttribute('aria-current', String(k === id)); });
    closeHots(document);
    /* a page's first mark opens by itself, so the idea is seen without a click */
    clearTimeout(openT);
    openT = setTimeout(function () {
      var h = $('.room.on .hot');
      if (h && view === id) h.setAttribute('aria-expanded', 'true');
    }, REDUCE ? 0 : 2300);
  }
  /* go to the map or a room: the plane slides */
  function go(id) {
    if (busy || id === view) return;
    if (view === 'open') { leaveOpen(id); return; }
    show(id);
  }
  /* the fifth arrow: start off to the right, then open the editor */
  function toEditor(href) {
    if (busy) return;
    busy = true;
    set('--cx', where.go.x); set('--cy', where.go.y); set('--px', 0); set('--py', 0);
    setTimeout(function () { window.location.href = href; }, REDUCE ? 0 : 620);
  }

  /* ---- the opening's handle ---- */
  var svg = $('#invite'), arc = $('#arc'), handle = $('#handle');
  var L = arc.getTotalLength(), pts = [], t = 0, held = false, moved = false, raf = 0, want = null;
  for (var k = 0; k <= 80; k++) { var q = arc.getPointAtLength(L * k / 80); pts.push([q.x, q.y]); }
  function place(v) {
    t = Math.max(0, Math.min(1, v));
    var p = arc.getPointAtLength(L * t);
    handle.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
    set('--p', t.toFixed(3));
  }
  function nearest(x, y) {
    var m = svg.getScreenCTM();
    if (!m) return t;
    var p = new DOMPoint(x, y).matrixTransform(m.inverse()), best = 0, bd = Infinity;
    for (var j = 0; j < pts.length; j++) {
      var d = (pts[j][0] - p.x) * (pts[j][0] - p.x) + (pts[j][1] - p.y) * (pts[j][1] - p.y);
      if (d < bd) { bd = d; best = j; }
    }
    return best / 80;
  }
  /* --p moved by the script, frame by frame, with the CSS transitions held
     off so the two do not fight (.scrub) */
  function glide(to, then) {
    cancelAnimationFrame(raf);
    var finish = function () { if (finish.done) return; finish.done = true; raf = 0; place(to); stage.classList.remove('scrub'); if (then) then(); };
    if (REDUCE) { finish(); return; }
    stage.classList.add('scrub');
    var from = t, t0 = performance.now(), ms = Math.max(40, Math.abs(to - from) * 1250);
    (function step(now) {
      if (finish.done) return;
      var u = Math.min(1, (now - t0) / ms), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      place(from + (to - from) * e);
      if (u < 1) raf = requestAnimationFrame(step); else finish();
    })(t0);
    /* a tab in the background runs no animation frames: finish anyway */
    setTimeout(finish, ms + 400);
  }
  /* out of the opening: the handle runs to the end of its arc, the ring there
     fills, and the map (or the room asked for) takes over */
  function leaveOpen(id) {
    if (busy) return;
    busy = true;
    glide(1, function () {
      /* straight on, so the opening fades out as the map fades in */
      /* --p stays at 1 while you are away: the handle is put back only when
         the opening is shown again, so nothing moves behind the map */
      show(id || 'hub'); busy = false;
    });
  }
  function toOpen() {
    if (busy || view === 'open') return;
    place(0);
    show('open');
  }

  handle.addEventListener('pointerdown', function (ev) {
    if (busy) return;
    held = true; moved = false; cancelAnimationFrame(raf); raf = 0;
    stage.classList.add('scrub');
    try { handle.setPointerCapture(ev.pointerId); } catch (e) {}
    ev.preventDefault();
  });
  handle.addEventListener('pointermove', function (ev) {
    if (!held) return;
    moved = true; want = [ev.clientX, ev.clientY];
    /* at most one move a frame */
    if (!raf) raf = requestAnimationFrame(function () { raf = 0; if (held && want) place(nearest(want[0], want[1])); });
  });
  function release() {
    if (!held) return;
    held = false;
    if (want) place(nearest(want[0], want[1]));
    want = null;
    if (t > 0.5) leaveOpen('hub'); else glide(0);
  }
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
  handle.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); leaveOpen('hub'); } });
  /* a plain click on the handle moves on too */
  handle.addEventListener('click', function () { if (!moved) leaveOpen('hub'); });

  /* ---- the five arrows ---- */
  var hub = $('.hub'), dirs = $$('.dir'), mid = $('.hub__mid'), midH = $('h2', mid), midP = $('p', mid), tellT;
  var HOME = ['Let’s have', 'a look', 'Four ways show what it does. The fifth takes you to the page.'];
  var SAYS = { eq: ['Type its', 'name', 'Words become symbols.'], ch: ['Type a', 'function', 'It draws itself.'], da: ['Paste your', 'data', 'Chart it, fit a model.'], pdf: ['Get the', 'real PDF', 'Typeset in your browser.'], go: ['Start', 'writing', 'Free. No account.'] };
  function write(w) {
    midH.textContent = ''; midH.appendChild(document.createTextNode(w[0])); midH.appendChild(document.createElement('br')); midH.appendChild(document.createTextNode(w[1] + ' '));
    var sl = document.createElement('i'); sl.textContent = '/'; midH.appendChild(sl); midP.textContent = w[2];
  }
  function tell(d) {
    var w = d ? SAYS[d.dataset.to] : HOME;
    clearTimeout(tellT);
    if (REDUCE) { write(w); return; }
    mid.classList.add('swap');
    tellT = setTimeout(function () { write(w); mid.classList.remove('swap'); }, 150);
  }
  /* a ring to burst out of each node when it is fired */
  $$('.node').forEach(function (n) { var c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'n-pulse'); c.setAttribute('r', 22); n.appendChild(c); });
  function fire(el) { el.classList.remove('fired'); void el.offsetWidth; el.classList.add('fired'); setTimeout(function () { el.classList.remove('fired'); }, 600); }
  $$('.dir').forEach(function (d) {
    var to = d.dataset.to, v = where[to];
    /* pointing at an arrow leans the window that way, and lights its ray */
    function lean(on) {
      if (view !== 'hub' || busy) return;
      set('--px', on ? (v.x * 0.022).toFixed(4) : 0); set('--py', on ? (v.y * 0.022).toFixed(4) : 0);
      if (rayOf[to]) rayOf[to].classList.toggle('lit', on);
      if (notchOf[to]) notchOf[to].classList.toggle('lit', on);
      d.classList.toggle('aim', on); hub.classList.toggle('aiming', on);
      /* the words in the middle name where this way goes */
      tell(on ? d : null);
    }
    d.addEventListener('pointerenter', function () { lean(true); });
    d.addEventListener('pointerleave', function () { lean(false); });
    d.addEventListener('focus', function () { lean(true); });
    d.addEventListener('blur', function () { lean(false); });
    d.addEventListener('click', function (ev) {
      if (busy) { ev.preventDefault(); return; }
      fire(d);
      if (to === 'go') { ev.preventDefault(); toEditor(d.getAttribute('href')); return; }
      /* a beat for the burst to be seen, then off */
      setTimeout(function () { lean(false); calm(); go(to); }, REDUCE ? 0 : 170);
    });
  });
  $$('.back').forEach(function (b) { b.addEventListener('click', function () { fire(b); setTimeout(function () { go('hub'); }, REDUCE ? 0 : 170); }); });

  /* the nodes feel the pointer: each swells as it comes near, and within
     reach is pulled towards it */
  var mv = null, mraf = 0;
  function calm() { dirs.forEach(function (d) { d.style.setProperty('--near', 0); d.style.setProperty('--mx', '0px'); d.style.setProperty('--my', '0px'); }); }
  hub.addEventListener('pointermove', function (ev) {
    if (ev.pointerType === 'touch' || REDUCE) return;
    mv = [ev.clientX, ev.clientY];
    if (mraf) return;
    mraf = requestAnimationFrame(function () {
      mraf = 0;
      if (view !== 'hub' || !mv) return;
      dirs.forEach(function (d) {
        var r = d.getBoundingClientRect(), dx = mv[0] - (r.left + r.width / 2), dy = mv[1] - (r.top + r.height / 2), dist = Math.sqrt(dx * dx + dy * dy);
        var near = Math.max(0, 1 - dist / 300), pull = dist < 130 ? 0.34 : 0;
        d.style.setProperty('--near', near.toFixed(3));
        d.style.setProperty('--mx', (dx * pull).toFixed(1) + 'px'); d.style.setProperty('--my', (dy * pull).toFixed(1) + 'px');
      });
    });
  });
  hub.addEventListener('pointerleave', calm);

  /* Escape closes an open mark, or goes back to the map. A turn of the wheel
     on the opening does nothing but make the handle pulse. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if ($('.hot[aria-expanded="true"]')) closeHots(document);
    else if (view !== 'open' && view !== 'hub') go('hub');
  });
  var nudgeT;
  function nudge() {
    if (held || busy || view !== 'open') return;
    stage.classList.remove('nudge'); void stage.offsetWidth; stage.classList.add('nudge');
    clearTimeout(nudgeT); nudgeT = setTimeout(function () { stage.classList.remove('nudge'); }, 750);
  }
  window.addEventListener('wheel', nudge, { passive: true });
  window.addEventListener('touchmove', function (e) { if (!e.target.closest || !e.target.closest('.handle')) nudge(); }, { passive: true });

  /* ---- the LaTeX behind a mark ---- */
  $$('.room .hot').forEach(function (h) {
    h.addEventListener('click', function () {
      var was = h.getAttribute('aria-expanded') === 'true';
      closeHots(h.parentNode);
      h.setAttribute('aria-expanded', String(!was));
    });
  });

  /* ---- a returning visitor continues where they left off ---- */
  if (window.PT && PT.home) {
    PT.home.recent(1).then(function (docs) {
      var goBtn = $('#go');
      if (!docs.length || !goBtn) return;
      goBtn.textContent = 'Continue “' + docs[0].title + '” →';
      goBtn.href = docs[0].href;
    });
  }

  place(0);
  show('open');
})();
