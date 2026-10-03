# PaperTeX

A LaTeX editor with no LaTeX in it. You write on the page — headings, equations,
figures, tables, citations — and the `.tex` source is generated from what you
did. There is no compile step and no source pane to type into: the document
model is the truth, LaTeX is the output.

## Run it

Double-click **`start-papertex.cmd`**. It serves the folder and opens the page.

Opening `papertex.html` straight off disk also works for writing, exporting and
printing — but **not for Compile PDF**. The compiler runs in a Web Worker, and
no browser will start one on a `file://` page, whose origin is `null`. That is
a browser rule with no workaround; serving the folder is the fix. A published
site is served over https, so it never arises there.

## Desktop app

```bash
npm install
npm run desktop
```

Electron, with a native menu, real Save dialogs and no browser restrictions.
Worth having for three reasons the browser build cannot match:

- **Compiling just works.** The window is served over an `app://` origin, not
  `file://`, so the compiler's Web Worker starts normally.
- **Export writes a folder.** One dialog puts the `.tex` and every figure side
  by side, so `\includegraphics` resolves — no per-image downloads, no
  extension allowlist, a real `.tex` rather than `.tex.txt`.
- **It can work offline.** Run `npm run fetch-texlive` once (~220 MB) and the
  app compiles with no network at all; it detects `engine/texlive/` and uses it
  in preference to the CDN.

`npm run dist` builds an installer with electron-builder (NSIS and portable on
Windows, dmg on macOS, AppImage on Linux), using the PaperTeX icon in
`desktop/`. electron-builder is not a dependency yet — install it once with
`npm install --save-dev electron-builder`. If `engine/texlive/` is present it
goes into the installer (about 220 MB more) and the installed app compiles
fully offline. An unsigned Windows installer makes SmartScreen warn on first
run; sign it before handing it out widely.

To publish the web version, see [DEPLOY.md](DEPLOY.md): `npm run build:web`
assembles a ready-to-upload `dist/web/`.

The renderer gets no Node access: `contextIsolation` is on, `nodeIntegration`
is off, and `desktop/preload.js` exposes exactly six operations — save, export,
open, reveal, engine-assets and menu events. Nothing else crosses the bridge.

To work on the source instead:

```bash
python -m http.server 8777 --directory .
```

then open `http://localhost:8777/index.html` and run `node build.js` to
regenerate the bundle.

`http://localhost:8777/tools/mathcheck.html` sets a list of formulas with
PaperTeX beside KaTeX, in display and inline style; in its console,
`compare('display')` and `compare('inline')` list every glyph whose position
differs from KaTeX's by more than a few hundredths of an em. Run it after
touching the math layout in `js/math.js`.

## How it works

| | |
|---|---|
| `js/math.js` | The formula engine: a tree model, a WYSIWYG renderer with its own caret and keyboard handling, LaTeX serialisation, and a small LaTeX parser used only for pasting. |
| `js/doc.js` | The document model (blocks) and the on-paper editor — numbering, block menus, inline formulas, tables, figures, lists. |
| `js/latex.js` | Turns the model into a `.tex` file, collecting the packages it actually needs. |
| `js/symbols.js` | Symbol and structure tables driving the palette and the `\command` autocomplete. |
| `js/app.js` | Chrome: palettes, LaTeX pane, outline, settings, undo, storage, export. |

Formulas are never stored as strings. Every equation is a tree of nodes
(`frac`, `scr`, `sqrt`, `big`, `paren`, `mat`, …), which is what the caret moves
through and what gets serialised. That is why `↑`/`↓` step between numerator and
denominator, and why `Backspace` at the front of a denominator dissolves the
fraction instead of deleting a brace.

## Writing

- `/` on an empty line — block menu (section, equation, figure, table, list, theorem, code, bibliography, raw LaTeX)
- `$` mid-sentence — inline formula, editable again by clicking it
- `Ctrl+Enter` — display equation below the current block
- Select text — bold, italic, code, cross-reference, or *make this a formula*

- Paste or drag an image anywhere — it becomes a figure with a unique file name

### Inside a formula, type the name of what you want

`int` becomes an integral with the caret waiting in its lower limit; `sum`,
`prod`, `lim`, `sqrt`, `frac`, `matrix`, `cases`, `vec`, `hat` likewise.
`alpha` becomes α, `inf` becomes ∞, `partial` ∂, `in` ∈. `sin` becomes an
upright function name. `->` `<=` `>=` `!=` `+-` become → ≤ ≥ ≠ ±.

A word converts as soon as it can no longer grow into a longer one — `sum`
fires immediately, `sin` waits for the next keystroke because `sinh` exists.
**Backspace straight afterwards puts the letters back**, so `p·i` is still
reachable when you did not mean π. The whole behaviour can be switched off
under Document → Formulas.

A digit straight after a letter becomes an index — `x1` gives x₁, `a12` gives
a₁₂, `alpha3` gives α₃ — except inside a subscript, where `x_n` followed by `1`
stays `x_{n1}`. The caret goes into such an index so you can see where the
next digit lands, but only digits continue it: anything else steps back out
first, so `x1+x2` and `x1, x2` need no extra keys, and `x1^2` gives x₁².
`ü` is a second superscript key, for layouts where `^` is a dead key needing
two presses; the dead key itself is understood too.

### Moving around a formula

`Enter` (or `Space`) means *done with this part*: it moves to the next part of
whatever you are in, and after the last one, out behind it. So `int`, `0`,
`Enter`, `1`, `Enter` leaves you writing the integrand of ∫₀¹; in a fraction it
goes numerator → denominator → after the fraction; in an exponent it steps
back down to the line. An operator whose lower limit you leave empty is taken
to want no limits, and `Enter` skips straight past them. Only on the line
itself does `Enter` start a new equation line — and on an empty last line it
ends the equation and returns to the text.

`↑` and `↓` go to what is drawn above or below the caret. On the line, `↑`
enters the exponent, upper limit or numerator next to the caret and `↓` the
index, lower limit or denominator; inside, they move between the two parts,
and from an exponent `↓` comes back to the line. The caret keeps its place
across the page. `Tab` steps through every slot strictly in order, empty ones
included (`Shift+Tab` back), and `^` / `_` still jump between the limits.

The rest: `/` fraction · `^` `_` scripts · `(` `[` `|` auto-growing delimiters ·
`\name` the long way round · `Esc` returns to the text.

## Keyboard shortcuts

Every command, block type and palette symbol can have keys of your own, and so
can any LaTeX snippet — `\mathbb{R}`, `\frac{d}{dx}`, `\int_{0}^{\infty}` —
under **? Shortcuts → customize** or **Document → Keyboard**. An empty `{}` in
a snippet is a slot the caret lands in. Shortcuts are kept in local storage,
separately from the document, so they survive restarts; the desktop menu
shows whichever keys are current.

## Typeface

The page sets in real Computer Modern — the faces are embedded in the file, so
the preview matches what `article` will compile to rather than approximating it
with Times. They come from KaTeX (MIT, see `fonts/LICENSE-KaTeX.txt`);
`node tools/genfonts.js` regenerates `css/fonts.css` from `fonts/`.

## Output

**Export .tex** writes the source; if the document has figures, the image files
are downloaded alongside it — keep them in the same folder as the `.tex` so
`\includegraphics` resolves. **Print / PDF** prints the page as shown, which is
useful for a quick look but is *not* a LaTeX-typeset PDF — run the `.tex`
through your own engine (pdflatex, tectonic, Overleaf) for that.

**Compile PDF** typesets the document with real LaTeX — TeX Live 2025 built to
WebAssembly ([@siglum/engine](https://github.com/SiglumProject/siglum-engine),
MIT) — running in your browser. Nothing is uploaded: the engine is fetched as
static files and cached. A cold first compile takes a few seconds while the
wasm downloads; after that it is around a second. The result opens in a viewer
with **Save PDF**.

Figures are handed to the compiler alongside the source, so `\includegraphics`
resolves. See [engine/README.md](engine/README.md) for self-hosting the wasm
and TeX Live bundles — which you should do before launching anything — and for
the packages that need a CTAN proxy.

**Save** stores the project as JSON so you can keep editing later; the current
document also autosaves to the browser.

### Running inside a sandboxed viewer

Published as an Artifact, the page is sandboxed, and two things the browser
normally allows are withheld: it may only save a short list of file extensions
(`.tex` is not among them, so the source arrives as `.tex.txt` — delete the
suffix), and it cannot open a print dialog. Print falls back to opening, or
handing over, a self-contained printable copy that prints itself.

`papertex.html` opened from your own disk has neither limitation: real `.tex`
downloads and a normal print dialog.

## Limits worth knowing

- The on-screen page approximates LaTeX's layout — it is a faithful preview of
  structure, not of line breaking or float placement.
- Page-break guides are drawn at page height; real pagination happens in LaTeX.
- Pasting LaTeX into a formula understands the common constructs, not the whole
  language. Anything unrecognised is kept verbatim, and the *Raw LaTeX* block is
  there as a deliberate escape hatch.
