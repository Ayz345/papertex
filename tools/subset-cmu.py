"""Cut CMU Serif down to the characters the KaTeX Computer Modern faces lack.

For each face (regular, bold, italic): every code point in the wanted
ranges that CMU draws and the matching KaTeX face does not. The result is
a WOFF2 per face plus fonts/CMU-ranges.json, whose unicode-range lists let
tools/genfonts.js add the faces to the "PaperTeX" family without ever
replacing a glyph KaTeX already draws.

Run:  pip install fonttools brotli
      python tools/subset-cmu.py <folder with cmunrm.otf, cmunbx.otf, cmunti.otf>
      node tools/genfonts.js
The OTF files come from CTAN, fonts/cm-unicode/fonts/otf/.
"""
import json, os, sys
from fontTools.ttLib import TTFont
from fontTools import subset

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
HERE = next((a for a in sys.argv[1:] if not a.startswith('--')), '.')   # where cmunrm.otf, cmunbx.otf, cmunti.otf are
WITH_CYRILLIC = '--cyrillic' in sys.argv

WANT = [
    (0x00A0, 0x024F),   # Latin-1 Supplement, Latin Extended-A and -B: ç ğ ı ş ö ü é ß …
    (0x02B0, 0x036F),   # spacing modifiers and combining accents
    (0x0370, 0x03FF),   # Greek
    (0x1E00, 0x1EFF),   # Latin Extended Additional (Vietnamese …)
    (0x2000, 0x206F),   # general punctuation: dashes, quotes, ‰, ′, •, …
    (0x20A0, 0x20CF),   # currency: € …
    (0x2100, 0x214F),   # letterlike: ™ № ℃ …
    (0x2190, 0x21FF),   # arrows
    (0x2200, 0x22FF),   # mathematical operators: ≠ ∉ ∴ …
    (0x2300, 0x23FF),   # miscellaneous technical
    (0x25A0, 0x25FF),   # geometric shapes: □ ■ ○ …
    (0x2700, 0x27BF),   # dingbats: ✓ ✗ …
    (0xFB00, 0xFB06),   # ﬁ ﬂ ligatures
]
if WITH_CYRILLIC:
    WANT.append((0x0400, 0x04FF))

FACES = [
    ('cmunrm.otf', 'KaTeX_Main-Regular.woff2', 'CMU-Serif-Regular-ext.woff2'),
    ('cmunbx.otf', 'KaTeX_Main-Bold.woff2', 'CMU-Serif-Bold-ext.woff2'),
    ('cmunti.otf', 'KaTeX_Main-Italic.woff2', 'CMU-Serif-Italic-ext.woff2'),
]


def cmap_of(path):
    return set(TTFont(path).getBestCmap().keys())


def ranges(cps):
    out, cps = [], sorted(cps)
    start = prev = cps[0]
    for c in cps[1:]:
        if c == prev + 1:
            prev = c
            continue
        out.append((start, prev))
        start = prev = c
    out.append((start, prev))
    return ', '.join('U+%04X' % a if a == b else 'U+%04X-%04X' % (a, b) for a, b in out)


result = {}
for src, katex, dst in FACES:
    have = cmap_of(os.path.join(ROOT, 'fonts', katex))
    cmu = cmap_of(os.path.join(HERE, src))
    wanted = {c for a, b in WANT for c in range(a, b + 1)}
    take = sorted((wanted & cmu) - have)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['kern', 'liga', 'mark', 'mkmk', 'ccmp', 'locl']
    opts.name_IDs = ['*']          # keep the copyright and licence notices
    opts.name_languages = ['*']
    opts.notdef_outline = True
    opts.hinting = False
    font = TTFont(os.path.join(HERE, src))
    s = subset.Subsetter(opts)
    s.populate(unicodes=take)
    s.subset(font)
    out = os.path.join(ROOT, 'fonts', dst)
    font.flavor = 'woff2'
    font.save(out)
    result[dst] = ranges(take)
    print('%-30s %4d glyphs  %6.1f kB' % (dst, len(take), os.path.getsize(out) / 1024))

with open(os.path.join(ROOT, 'fonts', 'CMU-ranges.json'), 'w', encoding='utf-8') as fh:
    json.dump(result, fh, indent=2)
print('ranges written')
for k in ['ç', 'ğ', 'ı', 'ş', 'ö', 'ü', 'Ç', 'Ğ', 'İ', 'Ş', 'Ö', 'Ü', 'é', 'ß', '≠', '∉', '∴', '□', '✓', '€', 'α']:
    print(k, 'katex' if ord(k) in cmap_of(os.path.join(ROOT, 'fonts', 'KaTeX_Main-Regular.woff2')) else
          ('cmu' if ord(k) in cmap_of(os.path.join(ROOT, 'fonts', 'CMU-Serif-Regular-ext.woff2')) else 'MISSING'), end='  ')
print()
