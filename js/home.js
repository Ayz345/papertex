/* PaperTeX — what the home page needs to know, without loading the editor.

   Load after js/store.js and js/templates.js:

     PT.home.recent(limit)  → Promise of [{ id, title, updated, href }], the
                              documents kept in this browser, newest first
                              (empty when there are none, or no storage)
     PT.home.templates()    → [{ id, name, icon, desc, href }], the starting
                              points the editor offers under New
     PT.home.links          → { editor, about } addresses to link to

   Every href opens the editor on that document or template (app.html#doc=…
   and app.html#new=…; see followLink in js/app.js). Nothing here edits a
   document. Opening the store does one write of its own, once: it moves a
   document saved by the old localStorage version into IndexedDB. */
(function () {
  'use strict';
  var PT = window.PT = window.PT || {};
  var EDITOR = 'app.html';

  function recent(limit) {
    if (!PT.store) return Promise.resolve([]);
    return PT.store.open().then(function () { return PT.store.list(); }).then(function (docs) {
      return docs
        .filter(function (d) { return d && d.id; })
        .sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); })
        .slice(0, limit || 6)
        .map(function (d) {
          return {
            id: d.id,
            title: String(d.title || '').trim() || 'Untitled document',
            updated: d.updated || 0,
            href: EDITOR + '#doc=' + encodeURIComponent(d.id)
          };
        });
    }).catch(function () { return []; });
  }

  function templates() {
    return (PT.templates || []).map(function (t) {
      return { id: t.id, name: t.name, icon: t.icon, desc: t.desc, href: EDITOR + '#new=' + t.id };
    });
  }

  PT.home = { recent: recent, templates: templates, links: { editor: EDITOR, about: 'about.html' } };
})();
