#!/usr/bin/env python3
"""
RECARO R7 Seat Experience — local dev server.

Serves the static web app AND proxies /ollama/* requests to a local
Ollama instance (default http://localhost:11434). Proxying keeps the
browser calls same-origin, so there are no CORS issues.

Usage:
    python server.py                # serves on http://localhost:8000
    python server.py 8080           # custom port
    OLLAMA_HOST=... python server.py
"""
import os
import sys
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

ROOT = os.path.dirname(os.path.abspath(__file__))
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
SERVER_HOST = os.environ.get("SERVER_HOST", "127.0.0.1")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "text/javascript; charset=utf-8",
    ".mjs":  "text/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4":  "video/mp4",
    ".webm": "video/webm",
    ".woff2": "font/woff2",
    ".ico":  "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # Quieter, prettier logging
        sys.stderr.write("  %s\n" % (fmt % args))

    # ---- Ollama proxy ----------------------------------------------------
    def _proxy_ollama(self):
        # Map /ollama/api/chat -> {OLLAMA_HOST}/api/chat
        target = OLLAMA_HOST + self.path[len("/ollama"):]
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(
            target, data=body, method=self.command,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.URLError as e:
            msg = json.dumps({"error": "ollama_unreachable", "detail": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def do_POST(self):
        if self.path.startswith("/ollama/"):
            self._proxy_ollama()
        elif self.path.startswith("/save/"):
            self._save_capture()
        else:
            self.send_error(404)

    # ---- Dev-only: save a base64 PNG capture (for WebGL inspection) -------
    def _save_capture(self):
        import base64
        name = os.path.basename(self.path[len("/save/"):]) or "capture.png"
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b""
        try:
            if body[:5] == b"data:":
                body = body.split(b",", 1)[1]
            png = base64.b64decode(body)
            out = os.path.join(ROOT, "assets", "_caps")
            os.makedirs(out, exist_ok=True)
            with open(os.path.join(out, name), "wb") as f:
                f.write(png)
            self.send_response(200)
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"ok")
        except Exception as e:  # noqa
            self.send_error(500, str(e))

    # ---- Static files ----------------------------------------------------
    def do_GET(self):
        if self.path.startswith("/ollama/"):
            self._proxy_ollama()
            return

        path = self.path.split("?", 1)[0]
        if path == "/":
            path = "/index.html"
        # prevent path traversal
        safe = os.path.normpath(path).lstrip("\\/").replace("\\", "/")
        full = os.path.join(ROOT, safe)
        if not os.path.abspath(full).startswith(ROOT) or not os.path.isfile(full):
            self.send_error(404)
            return

        ext = os.path.splitext(full)[1].lower()
        ctype = MIME.get(ext, "application/octet-stream")
        try:
            with open(full, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            self.wfile.write(data)
        except BrokenPipeError:
            pass


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    httpd = ThreadingHTTPServer((SERVER_HOST, port), partial(Handler))
    print("\n  RECARO R7  -  Seat Experience")
    print("  -----------------------------")
    print(f"  Open:    http://localhost:{port}")
    print(f"  Ollama:  {OLLAMA_HOST}  (proxied at /ollama)")
    print("  Ctrl+C to stop.\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")


if __name__ == "__main__":
    main()
