/* PaperTeX home page — runs in <head>, before anything paints.

   Marks the page as animated (html.motion) so css/landing.css can hold the
   reveal targets back until js/landing.js animates them in. Visitors who
   ask for reduced motion never get the class, so nothing is held back.
   If landing.js has not taken over (html.motion-ready) within 2.5 s — a
   blocked or failed script — the class comes off and everything shows. */
(function () {
  'use strict';
  var root = document.documentElement;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch (e) { return; }
  root.classList.add('motion');
  setTimeout(function () {
    if (!root.classList.contains('motion-ready')) root.classList.remove('motion');
  }, 2500);
})();
