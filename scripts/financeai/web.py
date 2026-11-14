"""Serve the embedded FinanceAI build and forward only its public API."""
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
from urllib.parse import urlsplit

PORTAL = "http://127.0.0.1:3007"
WEB_HOST = "127.0.0.1:8194"
API_PORT = 8195
ORIGINS = {company: f"https://finance-{company}.arkom.test" for company in ("alfa", "beta")}
API_ROUTE = re.compile(r"/api/(alfa|beta)(/v1(?:/[A-Za-z0-9_-]+)+)")
ASSET = re.compile(r"/assets/([A-Za-z0-9_.-]+)")
CONTENT_TYPES = {".js": "text/javascript", ".css": "text/css", ".html": "text/html"}


def server(directory):
    class FinanceWeb(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Queries can contain application identifiers.

        def security_headers(self):
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy",
                             f"default-src 'self'; frame-ancestors {PORTAL}; "
                             "script-src 'self'; style-src 'self' 'unsafe-inline'; "
                             "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; "
                             "form-action 'none'; base-uri 'none'; object-src 'none'")

        def serve(self):
            if self.headers.get("Host") != WEB_HOST:
                self.send_error(403)
                return
            url = urlsplit(self.path)
            if url.scheme or url.netloc or url.fragment:
                self.send_error(404)
                return
            match = API_ROUTE.fullmatch(url.path)
            if match:
                self.proxy(ORIGINS[match[1]], match[2] + ("?" + url.query if url.query else ""))
                return
            if self.command not in ("GET", "HEAD"):
                self.send_error(405)
                return
            asset = ASSET.fullmatch(url.path)
            path = directory / "index.html" if url.path == "/" else (
                directory / "assets" / asset[1] if asset else None)
            if url.path == "/__arkom/ready":
                data, mime = b"FinanceAI", "text/plain"
            elif path and path.is_file() and path.suffix in CONTENT_TYPES:
                data, mime = path.read_bytes(), CONTENT_TYPES[path.suffix]
            else:
                self.send_error(404)
                return
            self.send_response(200)
            self.security_headers()
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if self.command == "GET":
                self.wfile.write(data)

        def proxy(self, origin, target):
            browser_origin = self.headers.get("Origin")
            if ((browser_origin and browser_origin != "http://" + WEB_HOST)
                    or self.headers.get("Sec-Fetch-Site") in ("cross-site", "same-site")
                    or self.headers.get("Transfer-Encoding")):
                self.send_error(403)
                return
            path = target.split("?", 1)[0]
            # Arkom owns account/installation assignments in this local integration.
            if path.startswith(("/v1/pilot/", "/v1/webhooks/")) or (
                    self.command != "GET" and path.startswith(("/v1/members", "/v1/installations"))):
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if not 0 <= length <= 32768:
                self.send_error(413)
                return
            data = self.rfile.read(length) if length else None
            headers = {"Origin": origin}
            for header in ("Authorization", "Content-Type", "Idempotency-Key"):
                if self.headers.get(header):
                    headers[header] = self.headers[header]
            connection = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=20)
            try:
                connection.request(self.command, target, body=data, headers=headers)
                response = connection.getresponse()
                content = response.read((8 << 20) + 1)
                if len(content) > 8 << 20 or 300 <= response.status < 400:
                    raise ValueError("FinanceAI response outside local contract")
                status = response.status
                selected = {name: response.getheader(name) for name in (
                    "Content-Type", "Content-Disposition", "Retry-After")}
            except (OSError, http.client.HTTPException, ValueError):
                self.send_error(503)
                return
            finally:
                connection.close()
            self.send_response(status)
            self.security_headers()
            for name, value in selected.items():
                if value is not None:
                    self.send_header(name, value)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(content)

        do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = serve

    host, port = WEB_HOST.split(":")
    return ThreadingHTTPServer((host, int(port)), FinanceWeb)
