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

Every launch build takes the site's address with `--site=`. It adds canonical
links, the link-preview picture (`img/og-card.png`) and `sitemap.xml`. If the
site lives under a path, such as a GitHub project page, give the full address
including that path.

Pick one:

| your host | build with | notes |
|---|---|---|
| allows files of 60 MB (Netlify, a VPS, S3 + CDN, GitHub Pages) | `npm run build:web -- --with-texlive --site=https://your.site` | everything on one origin; simplest |
| caps file size (Cloudflare Pages: 25 MB per file) | `npm run build:web -- --engine=https://assets.your.site/tl2025 --site=https://your.site` | put `engine/texlive/*` on object storage (R2, S3, B2) at that URL |
| just trying it out | `npm run build:web` | uses the public CDN — never for launch |

The largest TeX Live files are `bundles/cm-super.data.gz` (57 MB),
`bundles/pgf-tikz.data.gz` (31 MB) and `busytex.wasm` (29 MB). The build lists
every file over 25 MB.

Then check the build:

```bash
npm run check:launch
```

It fails, and says what to do, if the build is older than the sources, uses the
public CDN, has no site address, or the About page still has boxes for you to
write. Then try it locally:

```bash
python -m http.server 8790 --directory dist/web
```

Open <http://localhost:8790/app.html>, write something and press **Make PDF**.

## 3. Upload `dist/web/`

Any static host works. The build writes `_headers`, which Netlify and
Cloudflare Pages apply automatically. On another host, set the same headers in
its configuration — at least the `Content-Security-Policy` (the page carries a
copy in a `<meta>` tag, but `frame-ancestors` only works as a header) and
`Content-Type: application/wasm` for `.wasm` files. Hosts serve `404.html` by
that name for addresses that don't exist.

Host notes:

- **Netlify:** drag `dist/web/` onto the dashboard's deploy area, or run
  `netlify deploy --dir dist/web --prod`. It reads `_headers` and serves
  `/app` for `app.html`.
- **Cloudflare Pages + R2:** upload `dist/web/` without `engine/texlive/`
  (build with `--engine`, and the folder is left out). Make an R2 bucket with a
  public custom domain, upload `engine/texlive/*` under `/tl2025/`, and add a
  CORS rule that allows `GET` from your site's origin.
- **GitHub Pages:** it ignores `_headers`. The CSP still applies from the
  `<meta>` tag, except `frame-ancestors`. The workflow in
  `.github/workflows/pages.yml` does the whole thing on every push to `main`:
  it downloads TeX Live (kept in the Actions cache, never committed), builds
  with `--with-texlive`, runs `check:launch` and uploads `dist/web/`. Turn it
  on once under Settings → Pages → Source: *GitHub Actions*. A project page
  lives under a path, so the workflow builds with
  `--site=https://<user>.github.io/papertex`; change `SITE` there if the
  address changes.

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

Already done: the MIT licence (`LICENSE`), with third-party licences in
`dist/web/LICENSES/`; the privacy section on the About page; the favicon; the
link-preview picture; and the 404 page.

Still to do by hand:

- After uploading: open the live site, press **Make PDF** once, and paste the
  address into a link-preview checker to see the picture.
- The link-preview picture is drawn from `tools/og-card.html`. After changing
  that file, run `npm run og-image`.
