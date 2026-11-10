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
keep that storage permanently and reminds people to keep a copy, but:

- clearing site data deletes documents;
- **Safari removes a site's storage after 7 days without a visit.**

Say this plainly on the site (the About page does), and point people to
**Document → Keep a copy**: a backup folder (Chromium browsers), all documents
as one .zip (every browser), and — if you set it up below — their own Dropbox.

### Dropbox backup (optional)

Off by default. It needs a Dropbox app registered on **your** Dropbox account;
users then connect their own Dropbox, and the page writes to it directly (OAuth
with PKCE: no app secret, no server). Nothing below is done for you.

1. Sign in at <https://www.dropbox.com/developers/apps> (a free Basic account
   is enough) and press **Create app**.
2. Choose **Scoped access**, then **App folder** (the app sees one folder,
   `Apps/<app name>`, and nothing else in a user's Dropbox). Name it — names
   must be unique on Dropbox, so `PaperTeX` may be taken; the page never
   names the folder, so any name works.
3. On the **Permissions** tab tick `files.metadata.read`, `files.content.read`
   and `files.content.write`, and press **Submit**.
4. On the **Settings** tab:
   - **OAuth 2 → Redirect URIs**: add the editor's exact address, e.g.
     `https://ayz345.github.io/papertex/app.html` (and, for trying it
     locally, `http://localhost:8000/app.html`). The page always sends
     `…/app.html` in the folder it runs from.
   - **Allow public clients (Implicit Grant & PKCE)**: *Allow*.
   - Leave the **App secret** alone. It is never used, and must never be put
     in the page.
   - Optionally: an icon, a description, and the privacy-policy address
     `https://ayz345.github.io/papertex/about.html#privacy`.
5. Copy the **App key** into `app.html`:
   `<meta name="papertex-dropbox" content="YOUR_APP_KEY">` — that is the
   single setting. `tools/build-web.js` then also allows
   `https://api.dropboxapi.com` and `https://content.dropboxapi.com` in the
   page's `connect-src`. (With the value empty they are left out of the live
   site, and no Dropbox button appears.)
6. In `about.html`, Privacy, un-comment the *Back up to Dropbox* item, so
   the page says what the site now does. Rebuild and publish as usual. **Document → Keep a copy** now shows
   *Back up to Dropbox…*.
7. A new Dropbox app is in *development* status: up to 500 Dropbox users can
   connect. Before that, use **Apply for production** on the app's page.

Users can disconnect from the page (**Stop**, which also revokes the
token) or at <https://www.dropbox.com/account/connected_apps>. The refresh
token stays in the user's browser (IndexedDB) and is sent only to Dropbox.

## 5. Before launch — not covered by the build

Already done: the MIT licence (`LICENSE`), with third-party licences in
`dist/web/LICENSES/`; the privacy section on the About page; the favicon; the
link-preview picture; and the 404 page.

Still to do by hand:

- After uploading: open the live site, press **Make PDF** once, and paste the
  address into a link-preview checker to see the picture.
- The link-preview picture is drawn from `tools/og-card.html`. After changing
  that file, run `npm run og-image`.
