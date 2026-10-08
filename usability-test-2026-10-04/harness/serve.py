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
         8821, 8822, 8823, 8824]
HIDDEN = '/' + os.path.basename(LAB) + '/'    # the answers, served on 8800 only


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript',
                      '.mjs': 'text/javascript', '.json': 'application/json'}

    def lab(self):
        return self.server.server_port == 8800 and self.path.startswith('/__lab/')

    def send_head(self):
        if self.server.server_port != 8800 and self.path.startswith(HIDDEN):
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
        if sub not in ('test-document', 'results'):
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
    h = functools.partial(Handler, directory=SITE)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), h).serve_forever()


for p in PORTS[1:]:
    threading.Thread(target=run, args=(p,), daemon=True).start()
print('serving', SITE, 'on', PORTS, flush=True)
run(PORTS[0])
