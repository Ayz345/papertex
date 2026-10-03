# Publishing PaperTeX as a website

PaperTeX is a static site: one HTML file plus the compiler's files. There is
no server to run and nothing is uploaded by users — documents stay in their
browser. What needs care is **where the LaTeX engine comes from**.

## 1. Get TeX Live onto infrastructure you control

Compile PDF needs a WebAssembly build of TeX Live: `busytex.wasm` (~29 MB),
`busytex.js`, and ~190 MB of package bundles. Out of the box they come from
`cdn.siglum.org`. **Do not launch on that.** The previous generation of
browser LaTeX (SwiftLaTeX) became unusable when its package server went away;
every site depending on it broke the same day.

```bash
npm run fetch-texlive        # downloads them into engine/texlive/ (once, ~220 MB)
```

## 2. Build

Pick one:

| your host | build with | notes |
|---|---|---|
| allows files over 25 MB (Netlify, a VPS, S3 + CDN) | `npm run build:web -- --with-texlive` | everything on one origin; simplest |
| caps file size (Cloudflare Pages: 25 MB per file) | `npm run build:web -- --engine=https://assets.example.com/tl2025` | put `engine/texlive/*` on object storage (R2, S3, B2) at that URL |
| just trying it out | `npm run build:web` | uses the public CDN — never for launch |

The result is `dist/web/`. Check it locally before uploading:

```bash
python -m http.server 8790 --directory dist/web
```

then open <http://localhost:8790>, write something, press **Compile PDF**.

## 3. Upload `dist/web/`

Any static host works. The build writes `_headers`, which Netlify and
Cloudflare Pages apply automatically. On another host, set the same headers in
its configuration — at least the `Content-Security-Policy` (the page carries a
copy in a `<meta>` tag, but `frame-ancestors` only works as a header) and
`Content-Type: application/wasm` for `.wasm` files.

The site **must be served over HTTPS** (every serious host does this): the
compiler's worker and the storage APIs require a secure origin.

### If TeX Live is on a separate asset host

That host must:

- send `Access-Control-Allow-Origin: https://your-site.example` on every file
  under the engine path (the compiler fetches them from the page and from a
  worker);
- serve `.wasm` as `application/wasm`;
- keep the files at stable URLs — they are cached for a year
  (`immutable`); when you update TeX Live, use a new directory such as
  `/tl2026/` and rebuild with the new `--engine` URL.

## 4. What users' data depends on

Documents are kept in the browser's IndexedDB. The app asks the browser to
keep that storage permanently and reminds people to save project files, but:

- clearing site data deletes documents;
- **Safari removes a site's storage after 7 days without a visit.**

Say this plainly on the site (an About or FAQ page), and point people to
**Save project** for anything that matters.

## 5. Before launch — not covered by the build

- A licence for PaperTeX itself (there is none yet). The fonts (KaTeX, MIT)
  and the engine (`@siglum/engine`, MIT) are credited in `dist/web/LICENSES/`;
  TeX Live packages keep their own licences inside the bundles.
- A short privacy note: nothing is uploaded; the only third-party request is
  the engine host above, and only when someone compiles.
- A favicon and link-preview metadata in `index.html`.
