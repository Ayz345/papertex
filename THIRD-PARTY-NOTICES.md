# Third-party components

PaperTeX's own code is under the MIT licence in [LICENSE](LICENSE). The parts
below come from other projects and keep their own licences.

| where | what | licence |
|---|---|---|
| `fonts/KaTeX_*` | Computer Modern faces from KaTeX | MIT — [fonts/LICENSE-KaTeX.txt](fonts/LICENSE-KaTeX.txt) |
| `fonts/CMU-Serif-*` | CMU Serif, cut down to the letters KaTeX lacks | SIL Open Font License — [fonts/LICENSE-CMU.txt](fonts/LICENSE-CMU.txt) |
| `engine/siglum.js`, `engine/siglum.worker.js` | [@siglum/engine](https://github.com/SiglumProject/siglum-engine): TeX Live compiled to WebAssembly | MIT — [engine/LICENSE-siglum.txt](engine/LICENSE-siglum.txt) |
| `engine/texmf/` | LaTeX packages from TeX Live | each under the licence stated inside the file, mostly the LaTeX Project Public License |

The website build copies these licence files into `dist/web/LICENSES/`.
