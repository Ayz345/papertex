"""Test server for the first-time-user test.

Serves the PaperTeX folder on several ports at once, one origin per tester,
so each tester gets its own localStorage and its own saved documents.

Port 8800 also exposes this report folder at /__lab/ (other ports 404 it) and accepts
POST /__lab/save?name=...&dir=test-document|results, which
harness/make.html uses to compile the test PDF with PaperTeX's own engine.

    python usability-test-2026-10-04/harness/serve.py
    then open http://localhost:8800/__lab/harness/make.html to rebuild the PDF
    and give testers fresh ports: round 1 used 8801-8804, round 2 8811-8814
"""
import functools, http.server, os, sys, threading, urllib.parse

LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # the report folder
SITE = os.path.dirname(LAB)                                          # the PaperTeX folder
# 8800 is the organiser's; 8801-8804, 8811-8814 and 8821-8824 hold rounds
# 1, 2 and 3 (kept for scoring) -- a tester must never reuse a port, or it
# starts with another tester's documents and no intro.
PORTS = [8800, 8801, 8802, 8803, 8804, 8811, 8812, 8813, 8814,
         8821, 8822, 8823, 8824, 8831, 8832, 8833, 8834, 8835, 8836]
# Round 4 tests a fixed snapshot (a commit extracted with git archive), so
# another session's edits in progress don't leak into the run:
#   serve.py --snapshot <folder>   serves <folder> on 8831-8836
SNAPSHOT_PORTS = {8831, 8832, 8833, 8834, 8835, 8836}
# --snapshot-ports A-B: other ports for the snapshot (round 5: 8851-8856)
if '--snapshot-ports' in sys.argv:
    a, b = sys.argv[sys.argv.index('--snapshot-ports') + 1].split('-')
    SNAPSHOT_PORTS = set(range(int(a), int(b) + 1))
SNAPSHOT = None
if '--snapshot' in sys.argv:
    SNAPSHOT = os.path.abspath(sys.argv[sys.argv.index('--snapshot') + 1])
# --only-snapshot: serve just the organiser port and the snapshot ports, for
# when another instance already holds the older ones. --org-port N moves the
# organiser port (the one that exposes /__lab/ and the answers).
ORG = 8800
if '--org-port' in sys.argv:
    ORG = int(sys.argv[sys.argv.index('--org-port') + 1])
if '--only-snapshot' in sys.argv:
    PORTS = [ORG] + sorted(SNAPSHOT_PORTS)
HIDDEN = '/' + os.path.basename(LAB) + '/'    # the answers, served on 8800 only


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript',
                      '.mjs': 'text/javascript', '.json': 'application/json'}

    def lab(self):
        return self.server.server_port == ORG and self.path.startswith('/__lab/')

    def send_head(self):
        if self.server.server_port != ORG and self.path.startswith(HIDDEN):
            self.send_error(404); return None
        return super().send_head()

    def translate_path(self, path):
        if self.lab():
            rel = urllib.parse.unquote(urllib.parse.urlsplit(path).path[len('/__lab/'):])
            return os.path.join(LAB, os.path.normpath(rel).lstrip('\\/'))
        return super().translate_path(path)

    def do_POST(self):
        # every port takes uploads on its own origin: the editor's CSP
        # (connect-src 'self', form-action 'none') blocks posting elsewhere,
        # and the organiser archives each tester's document from its origin
        if not self.path.startswith('/__lab/save'):
            self.send_error(404); return
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        name = os.path.basename(q.get('name', ['out.bin'])[0])
        sub = q.get('dir', ['test-document'])[0]
        if sub not in ('test-document', 'results', 'round5/results', 'round5/target'):
            self.send_error(400); return
        os.makedirs(os.path.join(LAB, sub), exist_ok=True)
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        with open(os.path.join(LAB, sub, name), 'wb') as f:
            f.write(body)
        self.send_response(200); self.send_header('Content-Length', '2'); self.end_headers()
        self.wfile.write(b'ok')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        if self.command == 'POST' or (args and str(args[1])[0] in '45'):
            sys.stderr.write('[%d] %s\n' % (self.server.server_port, fmt % args))


def run(port):
    # in --only-snapshot mode the organiser port shows the snapshot too
    snap = SNAPSHOT and (port in SNAPSHOT_PORTS or ('--only-snapshot' in sys.argv and port == ORG))
    root = SNAPSHOT if snap else SITE
    h = functools.partial(Handler, directory=root)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), h).serve_forever()


for p in PORTS[1:]:
    threading.Thread(target=run, args=(p,), daemon=True).start()
print('serving', SITE, 'on', PORTS, '; snapshot', SNAPSHOT, 'on', sorted(SNAPSHOT_PORTS) if SNAPSHOT else '-', flush=True)
run(PORTS[0])
