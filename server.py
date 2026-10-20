# Server locale per provare il gioco, anche dal telefono sulla stessa rete Wi-Fi.
# Come `python -m http.server`, ma dice al browser di non tenere copie dei file:
# così ogni ricarica mostra sempre l'ultima versione.
#
# Uso: python server.py   (poi apri http://<IP del computer>:8000)

import http.server
import socket

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def local_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return "127.0.0.1"


if __name__ == "__main__":
    print(f"Gioco su http://localhost:{PORT} e, dal telefono, http://{local_ip()}:{PORT}")
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), NoCacheHandler).serve_forever()
