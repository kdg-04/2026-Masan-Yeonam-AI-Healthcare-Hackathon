#!/usr/bin/env python3
"""데모용 로컬 서버 (설치할 것 없음, 오프라인 OK)

    cd demo
    python3 tools/serve.py          # http://127.0.0.1:8000/index.html  (이 노트북에서만)
    python3 tools/serve.py 8000 --lan   # 같은 와이파이의 휴대폰에서도 접속 (http://<노트북 IP>:8000/app.html)

`python3 -m http.server` 대신 쓰는 이유
- 연결 대기열이 5개뿐이라 분할 모드(두 화면이 파일 50여 개를 한꺼번에 요청)에서 요청이 버려져
  "데이터를 불러오지 못했어요 / Failed to fetch"로 앱이 멈췄다 → 대기열 128, 요청마다 스레드
- 브라우저가 예전 JS·CSS를 캐시해 고친 코드가 안 보였다 → Cache-Control: no-store
- /app, /device 처럼 .html 없이 써도 열리게
"""
import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # demo/


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # 연결 재사용 (Content-Length를 보내므로 안전)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def translate_path(self, path):
        local = super().translate_path(path)
        if not os.path.exists(local) and os.path.exists(local + ".html"):
            return local + ".html"
        return local

    def log_message(self, fmt, *args):  # 실패만 보여 준다
        if len(args) > 1 and str(args[1])[:1] in "45":
            super().log_message(fmt, *args)


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True
    allow_reuse_address = True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8000
    host = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
    with Server((host, port), functools.partial(Handler, directory=ROOT)) as httpd:
        print(f"PUMIX 데모 서버: http://127.0.0.1:{port}/index.html  (시연 화면)  ·  app.html  ·  device.html", flush=True)
        if host == "0.0.0.0":
            print("같은 와이파이의 휴대폰: http://<노트북 IP>:%d/app.html?room=<방 코드>" % port, flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
