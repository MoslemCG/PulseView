#!/usr/bin/env python3
"""Local UI-only preview. All measurements are clearly marked simulated.
No server is started by the Windows executable; WebView2 maps packaged assets.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, fmt, *args):
        if '200' not in str(args):
            super().log_message(fmt, *args)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1] / 'ui'
    handler = partial(Handler, directory=str(root))
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    print(f'PulseView DEMO: http://127.0.0.1:{args.port}/?preset=builtin-overview', flush=True)
    print('Press Ctrl+C to stop. Browser preview does not read real hardware.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
