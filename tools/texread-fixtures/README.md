# .tex files for the reader

`js/texread.js` reads a `.tex` file into a PaperTeX document (**Open → a .tex file**).

- `handwritten.tex` is a paper PaperTeX did not write. It uses what people write by hand: `amsart`, custom theorem names, `\newcommand`, `\[ \]` and `$$`, `split`, `\nonumber`, nested and description lists, a ruled table with `\multicolumn`, `listings`, `verbatim`, `\verb`, `siunitx`, accents, `\input` and a hand-made bibliography.
- The usability tests' results (`usability-test-2026-10-04/results/*.tex`) are what PaperTeX writes.

`npm run check:texread` reads all of them in Node and checks the blocks that come back.

A full round trip needs the page, because the LaTeX writer and the compiler run there. Open `papertex.html` and run this in the console for each file:

```js
const r = PT.texread.read(await (await fetch(url)).text());
const tex = PT.latex.build(r.doc);           // compare with the original
const pdf = await PT.compile.run(tex, r.doc); // pdf.pdf, or pdf.error
```

On 2026-10-17 all 19 files read back. The document bodies of 13 of the 18 PaperTeX files came back identical. The other five differ only where the old file had a bug that the writer has since fixed, or in equivalent spellings.

17 of the 18 compiled. `round4-B2` did not: its own LaTeX is broken (`\right \right)`) and never compiled. `handwritten.tex` needs `listings`, which the engine's TeX Live does not have.
