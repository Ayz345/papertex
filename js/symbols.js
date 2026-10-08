/* PaperTeX — symbol + structure tables.
   Each item: {tex, d(isplay), cls, build?, label?}
   build values are handled by math.js insertBuild(). */
(function () {
  var G = [];

  function grp(name, icon, items) { G.push({ name: name, icon: icon, items: items }); }
  function s(tex, d, cls) { return { tex: tex, d: d, cls: cls || 'op' }; }
  function b(build, d, label) { return { build: build, d: d, label: label || build }; }
  function bb(L) { return { tex: '\\mathbb{' + L + '}', d: L, cls: 'upr', f: 'bb' }; }
  function cal(L) { return { tex: '\\mathcal{' + L + '}', d: L, cls: 'upr', f: 'cal' }; }

  grp('Fractions & roots', '∑', [
    b('frac', '<span class="pv-frac"><i>a</i><i>b</i></span>', 'Fraction  /'),
    b('sup', '<span class="pv">x<sup>2</sup></span>', 'Superscript  ^'),
    b('sub', '<span class="pv">x<sub>i</sub></span>', 'Subscript  _'),
    b('subsup', '<span class="pv">x<sub>i</sub><sup>2</sup></span>', 'Sub + superscript'),
    b('sqrt', '<span class="pv">√<span class="ovl">x</span></span>', 'Square root'),
    b('nthroot', '<span class="pv"><sup>n</sup>√<span class="ovl">x</span></span>', 'nth root'),
    b('paren', '<span class="pv">(&nbsp;)</span>', 'Parentheses'),
    b('brack', '<span class="pv">[&nbsp;]</span>', 'Brackets'),
    b('brace', '<span class="pv">{&nbsp;}</span>', 'Braces'),
    b('abs', '<span class="pv">|&nbsp;x&nbsp;|</span>', 'Absolute value'),
    b('norm', '<span class="pv">‖x‖</span>', 'Norm'),
    b('angle', '<span class="pv">⟨&nbsp;⟩</span>', 'Angle brackets'),
    b('sum', '<span class="pv">∑</span>', 'Sum with limits'),
    b('prod', '<span class="pv">∏</span>', 'Product'),
    b('int', '<span class="pv">∫</span>', 'Integral'),
    b('iint', '<span class="pv">∬</span>', 'Double integral'),
    b('oint', '<span class="pv">∮</span>', 'Integral around a closed loop'),
    b('lim', '<span class="pv">lim</span>', 'Limit'),
    b('bigcup', '<span class="pv">⋃</span>', 'Big union'),
    b('bigcap', '<span class="pv">⋂</span>', 'Big intersection'),
    b('matrix2', '<span class="pv">(▦)</span>', '2×2 matrix'),
    b('matrix3', '<span class="pv">(▦)</span>', '3×3 matrix'),
    b('cases', '<span class="pv">{▤</span>', 'Cases'),
    b('binom', '<span class="pv">(<sup>n</sup><sub>k</sub>)</span>', 'Binomial: n choose k'),
    b('text', '<span class="pv-t">Abc</span>', 'Text inside math'),
    b('deriv', '<span class="pv-frac"><i>d</i><i>dx</i></span>', 'Derivative d/dx'),
    b('pderiv', '<span class="pv-frac"><i>∂</i><i>∂x</i></span>', 'Partial ∂/∂x')
  ]);

  grp('Greek', 'α', [
    s('\\alpha', 'α', 'var'), s('\\beta', 'β', 'var'), s('\\gamma', 'γ', 'var'),
    s('\\delta', 'δ', 'var'), s('\\epsilon', 'ϵ', 'var'), s('\\varepsilon', 'ε', 'var'),
    s('\\zeta', 'ζ', 'var'), s('\\eta', 'η', 'var'), s('\\theta', 'θ', 'var'),
    s('\\vartheta', 'ϑ', 'var'), s('\\iota', 'ι', 'var'), s('\\kappa', 'κ', 'var'),
    s('\\lambda', 'λ', 'var'), s('\\mu', 'μ', 'var'), s('\\nu', 'ν', 'var'),
    s('\\xi', 'ξ', 'var'), s('\\pi', 'π', 'var'), s('\\varpi', 'ϖ', 'var'),
    s('\\rho', 'ρ', 'var'), s('\\varrho', 'ϱ', 'var'), s('\\sigma', 'σ', 'var'),
    s('\\varsigma', 'ς', 'var'), s('\\tau', 'τ', 'var'), s('\\upsilon', 'υ', 'var'),
    s('\\phi', 'ϕ', 'var'), s('\\varphi', 'φ', 'var'), s('\\chi', 'χ', 'var'),
    s('\\psi', 'ψ', 'var'), s('\\omega', 'ω', 'var'),
    s('\\Gamma', 'Γ', 'upr'), s('\\Delta', 'Δ', 'upr'), s('\\Theta', 'Θ', 'upr'),
    s('\\Lambda', 'Λ', 'upr'), s('\\Xi', 'Ξ', 'upr'), s('\\Pi', 'Π', 'upr'),
    s('\\Sigma', 'Σ', 'upr'), s('\\Upsilon', 'Υ', 'upr'), s('\\Phi', 'Φ', 'upr'),
    s('\\Psi', 'Ψ', 'upr'), s('\\Omega', 'Ω', 'upr')
  ]);

  grp('Operators', '±', [
    s('+', '+', 'bin'), s('-', '−', 'bin'), s('\\pm', '±', 'bin'), s('\\mp', '∓', 'bin'),
    s('\\times', '×', 'bin'), s('\\div', '÷', 'bin'), s('\\cdot', '⋅', 'bin'),
    s('\\ast', '∗', 'bin'), s('\\star', '⋆', 'bin'), s('\\circ', '∘', 'bin'),
    s('\\bullet', '∙', 'bin'), s('\\oplus', '⊕', 'bin'), s('\\ominus', '⊖', 'bin'),
    s('\\otimes', '⊗', 'bin'), s('\\oslash', '⊘', 'bin'), s('\\odot', '⊙', 'bin'),
    s('\\wedge', '∧', 'bin'), s('\\vee', '∨', 'bin'), s('\\cap', '∩', 'bin'),
    s('\\cup', '∪', 'bin'), s('\\setminus', '∖', 'bin'), s('\\dagger', '†', 'bin'),
    s('\\nabla', '∇', 'upr'), s('\\partial', '∂', 'var'), s('\\infty', '∞', 'upr'),
    s('\\prime', '′', 'upr'), s('\\hbar', 'ℏ', 'var'), s('\\ell', 'ℓ', 'var')
  ]);

  grp('Compare', '≈', [
    s('=', '=', 'rel'), s('\\neq', '≠', 'rel'), s('\\equiv', '≡', 'rel'),
    s('\\approx', '≈', 'rel'), s('\\sim', '∼', 'rel'), s('\\simeq', '≃', 'rel'),
    s('\\cong', '≅', 'rel'), s('\\propto', '∝', 'rel'),
    s('<', '<', 'rel'), s('>', '>', 'rel'), s('\\leq', '≤', 'rel'), s('\\geq', '≥', 'rel'),
    s('\\ll', '≪', 'rel'), s('\\gg', '≫', 'rel'),
    s('\\subset', '⊂', 'rel'), s('\\supset', '⊃', 'rel'),
    s('\\subseteq', '⊆', 'rel'), s('\\supseteq', '⊇', 'rel'),
    s('\\in', '∈', 'rel'), s('\\notin', '∉', 'rel'), s('\\ni', '∋', 'rel'),
    s('\\perp', '⊥', 'rel'), s('\\parallel', '∥', 'rel'), s('\\mid', '∣', 'rel'),
    s('\\models', '⊨', 'rel'), s('\\vdash', '⊢', 'rel'), s('\\doteq', '≐', 'rel')
  ]);

  grp('Arrows', '→', [
    s('\\to', '→', 'rel'), s('\\gets', '←', 'rel'), s('\\leftrightarrow', '↔', 'rel'),
    s('\\Rightarrow', '⇒', 'rel'), s('\\Leftarrow', '⇐', 'rel'), s('\\Leftrightarrow', '⇔', 'rel'),
    s('\\mapsto', '↦', 'rel'), s('\\longrightarrow', '⟶', 'rel'), s('\\longleftarrow', '⟵', 'rel'),
    s('\\uparrow', '↑', 'rel'), s('\\downarrow', '↓', 'rel'), s('\\updownarrow', '↕', 'rel'),
    s('\\nearrow', '↗', 'rel'), s('\\searrow', '↘', 'rel'), s('\\rightharpoonup', '⇀', 'rel'),
    s('\\hookrightarrow', '↪', 'rel'), s('\\rightrightarrows', '⇉', 'rel')
  ]);

  grp('Sets & logic', '∀', [
    s('\\forall', '∀', 'upr'), s('\\exists', '∃', 'upr'), s('\\nexists', '∄', 'upr'),
    s('\\neg', '¬', 'upr'), s('\\emptyset', '∅', 'upr'), s('\\varnothing', '∅', 'upr'),
    /* Blackboard-bold and calligraphic letters sit at ASCII positions in the
       AMS and Caligraphic faces, so carry the plain letter plus a font tag. */
    bb('R'), bb('N'), bb('Z'), bb('Q'), bb('C'), bb('P'), bb('E'),
    cal('L'), cal('F'), cal('O'), cal('H'),
    s('\\aleph', 'ℵ', 'upr'), s('\\top', '⊤', 'upr'), s('\\bot', '⊥', 'upr'),
    s('\\therefore', '∴', 'rel'), s('\\because', '∵', 'rel')
  ]);

  grp('Functions', 'ƒ', [
    s('\\sin', 'sin', 'fn'), s('\\cos', 'cos', 'fn'), s('\\tan', 'tan', 'fn'),
    s('\\csc', 'csc', 'fn'), s('\\sec', 'sec', 'fn'), s('\\cot', 'cot', 'fn'),
    s('\\arcsin', 'arcsin', 'fn'), s('\\arccos', 'arccos', 'fn'), s('\\arctan', 'arctan', 'fn'),
    s('\\sinh', 'sinh', 'fn'), s('\\cosh', 'cosh', 'fn'), s('\\tanh', 'tanh', 'fn'),
    s('\\log', 'log', 'fn'), s('\\ln', 'ln', 'fn'), s('\\exp', 'exp', 'fn'),
    s('\\min', 'min', 'fn'), s('\\max', 'max', 'fn'), s('\\inf', 'inf', 'fn'),
    s('\\sup', 'sup', 'fn'), s('\\arg', 'arg', 'fn'), s('\\deg', 'deg', 'fn'),
    s('\\det', 'det', 'fn'), s('\\dim', 'dim', 'fn'), s('\\ker', 'ker', 'fn'),
    s('\\gcd', 'gcd', 'fn'), s('\\Pr', 'Pr', 'fn'), s('\\bmod', 'mod', 'fn')
  ]);

  grp('Hats & bold', 'x̂', [
    b('hat', '<span class="pv">x̂</span>', 'Hat'),
    b('bar', '<span class="pv">x̄</span>', 'Bar / mean'),
    b('vec', '<span class="pv">x⃗</span>', 'Vector'),
    b('tilde', '<span class="pv">x̃</span>', 'Tilde'),
    b('dot', '<span class="pv">ẋ</span>', 'Dot'),
    b('ddot', '<span class="pv">ẍ</span>', 'Double dot'),
    b('widehat', '<span class="pv">^ ̄</span>', 'Wide hat'),
    b('overline', '<span class="pv"><span class="ovl">ab</span></span>', 'Overline'),
    b('underline', '<span class="pv"><u>ab</u></span>', 'Underline'),
    b('boldsym', '<span class="pv"><b><i>x</i></b></span>', 'Bold symbol')
  ]);

  grp('Misc', '⋯', [
    s('\\ldots', '…', 'upr'), s('\\cdots', '⋯', 'upr'), s('\\vdots', '⋮', 'upr'),
    s('\\ddots', '⋱', 'upr'), s('\\angle', '∠', 'upr'), s('\\triangle', '△', 'upr'),
    s('\\square', '□', 'upr'), s('\\blacksquare', '■', 'upr'), s('\\checkmark', '✓', 'upr'),
    s('\\langle', '⟨', 'upr'), s('\\rangle', '⟩', 'upr'),
    s('\\lceil', '⌈', 'upr'), s('\\rceil', '⌉', 'upr'),
    s('\\lfloor', '⌊', 'upr'), s('\\rfloor', '⌋', 'upr'),
    s('\\%', '%', 'upr'), s('\\&', '&', 'upr'), s('\\#', '#', 'upr'),
    s('\\$', '$', 'upr'), s('\\degree', '°', 'upr'), s('\\circledast', '⊛', 'bin'),
    s('\\quad', ' ', 'spc'), s('\\,', ' ', 'spc'), s('\\;', ' ', 'spc')
  ]);

  /* command name -> item, for the "\" typed-command autocomplete */
  var byCmd = {};
  G.forEach(function (g) {
    g.items.forEach(function (it) {
      if (it.tex) {
        var m = /^\\([A-Za-z]+)/.exec(it.tex);
        if (m && !byCmd[m[1]]) byCmd[m[1]] = it;
      }
    });
  });
  /* structures reachable by typing a command */
  var buildCmds = {
    frac: 'frac', dfrac: 'frac', sqrt: 'sqrt', root: 'nthroot', sum: 'sum', prod: 'prod',
    int: 'int', iint: 'iint', oint: 'oint', lim: 'lim', bigcup: 'bigcup', bigcap: 'bigcap',
    text: 'text', binom: 'binom', cases: 'cases', matrix: 'matrix2', pmatrix: 'matrix2',
    bmatrix: 'matrix2', hat: 'hat', bar: 'bar', vec: 'vec', tilde: 'tilde', dot: 'dot',
    ddot: 'ddot', widehat: 'widehat', overline: 'overline', underline: 'underline',
    boldsymbol: 'boldsym', left: 'paren', abs: 'abs', norm: 'norm',
    mathbf: 'mathbf', bm: 'boldsym', mathrm: 'text', textrm: 'text', tfrac: 'frac'
  };

  window.PT = window.PT || {};
  window.PT.symbols = { groups: G, byCmd: byCmd, buildCmds: buildCmds };
})();
