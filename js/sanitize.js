/* PaperTeX — the gate rich text passes through.

   A document is data: it comes back from local storage, from a project file
   someone sent you, from an undo snapshot. Its paragraphs are stored as HTML,
   and HTML from a file must never reach the page as-is — an <img onerror>
   in a shared project would run as soon as it was opened. So everything that
   becomes markup goes through clean() first, which keeps exactly what the
   editor itself produces and nothing else:

     b strong i em u s strike code tt sup sub mark br div p   — no attributes
     a            — href only, and only http(s), mailto or #anchor
     span.imath   — a formula: its tree (data-m) only, re-drawn on render
     span.xref    — a reference: kind and label only
     span.ftnote  — a footnote: its text only

   Unknown elements are unwrapped (their text kept); elements that carry code
   or load things — script, style, iframe, img, svg, form controls … — are
   removed with their contents. Parsing happens in a separate, inert document,
   where nothing loads and nothing runs. */
(function () {
  'use strict';

  var KEEP = {
    b: 1, strong: 1, i: 1, em: 1, u: 1, s: 1, strike: 1, code: 1, tt: 1,
    sup: 1, sub: 1, mark: 1, br: 1, div: 1, p: 1, a: 1, span: 1
  };
  var DROP = {
    script: 1, style: 1, iframe: 1, frame: 1, frameset: 1, object: 1, embed: 1,
    applet: 1, link: 1, meta: 1, base: 1, title: 1, template: 1, noscript: 1,
    svg: 1, math: 1, img: 1, picture: 1, video: 1, audio: 1, source: 1, track: 1,
    canvas: 1, form: 1, input: 1, button: 1, textarea: 1, select: 1, option: 1,
    portal: 1, slot: 1
  };
  var XREF_KINDS = { ref: 1, eqref: 1, pageref: 1, cite: 1 };
  var EMPTY_ROW = '{"t":"row","k":[]}';

  function parse(html) {
    return new DOMParser().parseFromString('<!DOCTYPE html><body>' + (html || ''), 'text/html').body;
  }

  /* only links that go somewhere ordinary */
  function safeHref(v) {
    v = String(v || '').trim();
    return /^(https?:\/\/|mailto:|#)/i.test(v) ? v : '';
  }
  /* a label or citation key goes into \ref{…}: nothing that ends the group */
  function safeLabel(v) {
    return String(v || '').replace(/[{}\\%#$^&~\u0000-\u001f]/g, '').slice(0, 200);
  }
  function safeTree(v) {
    try {
      var t = JSON.parse(v);
      if (t && t.t === 'row' && Array.isArray(t.k)) return JSON.stringify(t);
    } catch (e) { /* fall through */ }
    return EMPTY_ROW;
  }

  function cleanNode(el, doc) {
    var kids = [].slice.call(el.childNodes);
    kids.forEach(function (n) {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1) { n.remove(); return; }
      var tag = n.tagName.toLowerCase();
      if (DROP[tag]) { n.remove(); return; }
      if (!KEEP[tag]) {
        cleanNode(n, doc);
        while (n.firstChild) el.insertBefore(n.firstChild, n);
        n.remove();
        return;
      }
      var cls = ' ' + (n.getAttribute('class') || '') + ' ';
      var keep = {};
      if (tag === 'a') {
        var href = safeHref(n.getAttribute('href'));
        if (href) keep.href = href;
      } else if (tag === 'span' && cls.indexOf(' imath ') >= 0) {
        keep['class'] = 'imath';
        keep.contenteditable = 'false';
        keep['data-m'] = safeTree(n.getAttribute('data-m'));
        n.textContent = '';           /* the renderer draws it again from the tree */
      } else if (tag === 'span' && cls.indexOf(' xref ') >= 0) {
        var kind = n.getAttribute('data-kind');
        keep['class'] = 'xref';
        keep.contenteditable = 'false';
        keep['data-kind'] = XREF_KINDS[kind] ? kind : 'ref';
        keep['data-label'] = safeLabel(n.getAttribute('data-label'));
        n.textContent = n.textContent;  /* text only */
      } else if (tag === 'span' && cls.indexOf(' ftnote ') >= 0) {
        keep['class'] = 'ftnote';
        keep['data-text'] = String(n.getAttribute('data-text') || '').slice(0, 5000);
        n.textContent = n.textContent;
      } else if (tag === 'span') {
        /* a plain span is styling the browser left behind: keep its text */
        cleanNode(n, doc);
        while (n.firstChild) el.insertBefore(n.firstChild, n);
        n.remove();
        return;
      }
      [].slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
      Object.keys(keep).forEach(function (k) { n.setAttribute(k, keep[k]); });
      if (tag !== 'span' || !keep['class']) cleanNode(n, doc);
    });
  }

  function clean(html) {
    if (!html) return '';
    var body = parse(html);
    cleanNode(body, body.ownerDocument);
    return body.innerHTML;
  }

  /* Pasted or dropped images are stored as data URLs; anything else — a
     remote address that would report who opened the file, a javascript: URL
     — is refused. */
  function safeImageSrc(v) {
    v = String(v || '');
    return /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/i.test(v) ? v : '';
  }

  window.PT = window.PT || {};
  window.PT.sanitize = {
    clean: clean,
    /* an inert, cleaned tree to read from (the LaTeX writer walks it) */
    parse: function (html) { return parse(clean(html)); },
    href: safeHref,
    label: safeLabel,
    imageSrc: safeImageSrc
  };
})();
