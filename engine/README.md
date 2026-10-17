# engine/

The in-browser LaTeX compiler. Not needed to write or export `.tex` — only to
press **Compile PDF**.

| file | what it is |
|---|---|
| `siglum.js` | `@siglum/engine` (MIT) bundled to a browser global, built by `tools/bundle-engine.js` |
| `siglum.worker.js` | its compile worker, passed as `workerUrl` |
| `texmf/*.sty` | packages PaperTeX emits that the engine's TeX Live subset omits |
| `LICENSE-siglum.txt` | the engine's MIT licence |

`papertex.html` looks for this folder beside itself. Move the two together, or
change the paths in `js/compile.js`.

## The wasm and TeX Live bundles

Not vendored here — ~29 MB + ~190 MB. By default they are fetched from
`cdn.siglum.org` and cached by the browser.

**For anything you launch, self-host them.** The previous generation of
browser LaTeX engines (SwiftLaTeX) is unusable today for exactly this reason:
its package server went away and took every deployment with it.

```bash
curl -LO https://cdn.siglum.org/tl2025/busytex.wasm
curl -LO https://cdn.siglum.org/tl2025/busytex.js
curl -LO https://cdn.siglum.org/tl2025/siglum-bundles-v0.1.0.tar.gz
tar -xzf siglum-bundles-v0.1.0.tar.gz -C public/
```

Then point `CFG.wasm` and `CFG.bundles` in `js/compile.js` at your own copies.

## Packages beyond the bundled set

`texmf/pkg/` holds about 220 everyday packages the bundles lack, from TeX Live 2024's archives: listings, cleveref, enumitem, float, multirow, physics, algorithmicx, titlesec, mhchem and others, with their dependencies. `manifest.json` lists them. A compile receives only the files of the packages its document loads (`js/compile.js`, `packageFiles`). Rebuild the folder with `npm run fetch-packages`. A package that needs fonts the engine lacks, biber or shell escape (biblatex, minted, stmaryrd …) can't be added this way; the tool lists those.

The text below describes the first, smaller fix.

The bundles carry ~710 packages: `article`, `amsmath`, `amssymb`, `amsthm`,
`graphicx`, `geometry`, `hyperref`, `lmodern` and friends. `booktabs`,
`setspace`, `ulem` and `soul` are not among them, so PaperTeX ships those in
`texmf/` and hands them to the compiler with the document.

Anything else — `listings`, babel language files such as `ngerman.ldf`, tikz —
needs a CTAN proxy. Run one and set `CFG.ctanProxy` in `js/compile.js`; see the
`@siglum/engine` docs. Without it, a document using them still **exports** a
perfectly good `.tex`; it just cannot be typeset in the browser.
