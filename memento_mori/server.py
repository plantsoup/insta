"""
memento_mori/server.py

High-performance Web Application Server for Memento Mori.
Supports:
- Viewing Instagram Archive
- Dedicated Digital Signage Mode (Portrait & Landscape)
- HTTP Range Requests for smooth MP4 video playback on TVs/monitors
- Web-based setup/upload/build wizard when exports need processing
"""

import os
import sys
import json
import mimetypes
import argparse
import threading
import traceback
from pathlib import Path
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import urllib.parse
import re

# Ensure common MIME types are registered properly
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/heic", ".heic")
mimetypes.add_type("video/mp4", ".mp4")
mimetypes.add_type("video/webm", ".webm")
mimetypes.add_type("application/json", ".json")

# Global build state for background processing
BUILD_STATE = {
    "is_building": False,
    "progress": 0,
    "status": "idle",
    "logs": [],
    "error": None
}
BUILD_LOCK = threading.Lock()


class MementoMoriHandler(SimpleHTTPRequestHandler):
    """Custom HTTP Request Handler supporting Range Requests and Web App APIs."""

    def __init__(self, *args, output_dir="./output", workspace_dir=".", **kwargs):
        self.output_dir = Path(output_dir).resolve()
        self.workspace_dir = Path(workspace_dir).resolve()
        super().__init__(*args, directory=str(self.output_dir), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path.rstrip("/")

        # API Endpoints
        if clean_path == "/api/status":
            self._handle_api_status()
            return
        elif clean_path == "/api/posts":
            self._handle_api_posts()
            return
        elif clean_path == "/api/stories":
            self._handle_api_stories()
            return

        # Friendly route aliases
        if clean_path == "" or clean_path == "/":
            if not (self.output_dir / "index.html").exists():
                self._serve_setup_page()
                return
            self.path = "/index.html"
        elif clean_path == "/signage":
            self.path = "/signage.html"
        elif clean_path == "/stories":
            self.path = "/stories.html"
        elif clean_path == "/setup":
            self._serve_setup_page()
            return

        # Serve static file with Range Request support
        file_path_req = urllib.parse.urlparse(self.path).path
        self._serve_file_with_range(file_path_req)

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path.rstrip("/")

        if clean_path in ["", "/"]:
            self.path = "/index.html"
        elif clean_path == "/signage":
            self.path = "/signage.html"
        elif clean_path == "/stories":
            self.path = "/stories.html"

        file_path_req = urllib.parse.urlparse(self.path).path
        file_path = self._resolve_path(file_path_req)
        if file_path and file_path.exists() and not file_path.is_dir():
            file_size = file_path.stat().st_size
            ctype = self.guess_type(str(file_path)) or "application/octet-stream"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
        else:
            self.send_error(HTTPStatus.NOT_FOUND, f"File not found: {self.path}")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path.rstrip("/")

        if clean_path == "/api/build":
            self._handle_api_build()
        elif clean_path == "/api/upload":
            self._handle_api_upload()
        else:
            self.send_error(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def _serve_file_with_range(self, req_path):
        """Serve files with full HTTP Range Request support for smooth media streaming."""
        file_path = self._resolve_path(req_path)

        if file_path is None or not file_path.exists() or file_path.is_dir():
            # If requesting index or signage and file missing, try setup page
            if req_path in ["/", "/index.html", "/signage.html"] and not (self.output_dir / "index.html").exists():
                self._serve_setup_page()
                return
            self.send_error(HTTPStatus.NOT_FOUND, f"File not found: {req_path}")
            return

        file_size = file_path.stat().st_size
        ctype = self.guess_type(str(file_path)) or "application/octet-stream"

        range_header = self.headers.get("Range")
        if range_header:
            # Parse Range: bytes=start-end
            try:
                ranges = range_header.strip().split("=")[1].split("-")
                start = int(ranges[0]) if ranges[0] else 0
                end = int(ranges[1]) if ranges[1] else file_size - 1

                if start >= file_size or end >= file_size or start > end:
                    self.send_error(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                    return

                length = end - start + 1
                self.send_response(HTTPStatus.PARTIAL_CONTENT)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()

                with open(file_path, "rb") as f:
                    f.seek(start)
                    self._copy_chunked(f, length)
                return
            except (ValueError, IndexError):
                pass  # Fall through to full response if range header unparseable

        # Full content response
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(file_size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.end_headers()

        with open(file_path, "rb") as f:
            self._copy_chunked(f, file_size)

    def _copy_chunked(self, f, length, chunk_size=64 * 1024):
        remaining = length
        while remaining > 0:
            to_read = min(remaining, chunk_size)
            chunk = f.read(to_read)
            if not chunk:
                break
            try:
                self.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break
            remaining -= len(chunk)

    def _resolve_path(self, req_path):
        clean_path = urllib.parse.unquote(req_path.lstrip("/"))
        resolved = (self.output_dir / clean_path).resolve()
        # Security: protect against directory traversal
        try:
            resolved.relative_to(self.output_dir)
            return resolved
        except ValueError:
            return None

    def _handle_api_status(self):
        detected_archive = None
        for path in self.workspace_dir.glob("*.zip"):
            detected_archive = path.name
            break

        index_exists = (self.output_dir / "index.html").exists()
        signage_exists = (self.output_dir / "signage.html").exists()

        post_count = 0
        story_count = 0
        if index_exists:
            try:
                # Count media items or read simple stats
                posts_dir = self.output_dir / "media" / "posts"
                if posts_dir.exists():
                    post_count = len(list(posts_dir.glob("*.*")))
                stories_dir = self.output_dir / "media" / "stories"
                if stories_dir.exists():
                    story_count = len(list(stories_dir.glob("*.*")))
            except Exception:
                pass

        with BUILD_LOCK:
            build_copy = dict(BUILD_STATE)

        data = {
            "ready": index_exists,
            "has_signage": signage_exists,
            "post_count": post_count,
            "story_count": story_count,
            "output_dir": str(self.output_dir),
            "workspace_dir": str(self.workspace_dir),
            "detected_archive": detected_archive,
            "build": build_copy
        }

        self._send_json(data)

    def _handle_api_posts(self):
        """Extract and serve posts JSON directly from output."""
        index_file = self.output_dir / "index.html"
        if not index_file.exists():
            self._send_json({}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            content = index_file.read_text(encoding="utf-8")
            start_marker = "window.postData = "
            if start_marker in content:
                start_idx = content.find(start_marker) + len(start_marker)
                end_idx = content.find(";\n", start_idx)
                if end_idx == -1:
                    end_idx = content.find(";", start_idx)
                json_str = content[start_idx:end_idx].strip()
                self._send_json_raw(json_str)
                return
        except Exception as e:
            print(f"Error reading posts data: {e}")

        self._send_json({})

    def _handle_api_stories(self):
        """Extract and serve stories JSON directly from output."""
        index_file = self.output_dir / "index.html"
        if not index_file.exists():
            self._send_json({}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            content = index_file.read_text(encoding="utf-8")
            start_marker = "window.storiesData = "
            if start_marker in content:
                start_idx = content.find(start_marker) + len(start_marker)
                end_idx = content.find(";\n", start_idx)
                if end_idx == -1:
                    end_idx = content.find(";", start_idx)
                json_str = content[start_idx:end_idx].strip()
                self._send_json_raw(json_str)
                return
        except Exception as e:
            print(f"Error reading stories data: {e}")

        self._send_json({})

    def _handle_api_build(self):
        """Trigger background build process."""
        with BUILD_LOCK:
            if BUILD_STATE["is_building"]:
                self._send_json({"error": "Build is already in progress"}, status=HTTPStatus.CONFLICT)
                return
            BUILD_STATE["is_building"] = True
            BUILD_STATE["progress"] = 5
            BUILD_STATE["status"] = "Starting build pipeline..."
            BUILD_STATE["logs"] = ["Build triggered via Web API."]
            BUILD_STATE["error"] = None

        thread = threading.Thread(target=self._run_build_worker, daemon=True)
        thread.start()

        self._send_json({"message": "Build started", "status": "running"})

    def _handle_api_upload(self):
        """Upload Instagram zip archive without external dependencies."""
        ctype = self.headers.get("content-type", "")
        if "multipart/form-data" not in ctype or "boundary=" not in ctype:
            self._send_json({"error": "Expected multipart/form-data with boundary"}, status=HTTPStatus.BAD_REQUEST)
            return

        try:
            boundary = ctype.split("boundary=")[1].strip()
            if boundary.startswith('"') and boundary.endswith('"'):
                boundary = boundary[1:-1]
            boundary_bytes = boundary.encode("latin-1")
            content_length = int(self.headers.get("content-length", 0))

            raw_body = self.rfile.read(content_length)
            parts = raw_body.split(b"--" + boundary_bytes)

            saved_filename = None
            for part in parts:
                if b"filename=" in part:
                    header_part, _, file_data = part.partition(b"\r\n\r\n")
                    # Clean trailing CRLF and boundary dashes
                    if file_data.endswith(b"\r\n"):
                        file_data = file_data[:-2]
                    elif file_data.endswith(b"\r\n--"):
                        file_data = file_data[:-4]

                    header_str = header_part.decode("latin-1", errors="ignore")
                    m = re.search(r'filename="([^"]+)"', header_str)
                    filename = Path(m.group(1)).name if m else "instagram-export.zip"

                    upload_target = self.workspace_dir / filename
                    with open(upload_target, "wb") as f:
                        f.write(file_data)
                    saved_filename = filename
                    break

            if saved_filename:
                self._send_json({"message": f"Successfully uploaded {saved_filename}", "filename": saved_filename})
            else:
                self._send_json({"error": "No file content detected in upload"}, status=HTTPStatus.BAD_REQUEST)
        except Exception as e:
            self._send_json({"error": f"Upload failed: {str(e)}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def _run_build_worker(self):
        """Worker thread executing the Memento Mori processing pipeline."""
        try:
            def log(msg):
                with BUILD_LOCK:
                    BUILD_STATE["logs"].append(msg)
                    BUILD_STATE["status"] = msg
                print(f"[Build] {msg}")

            log("Locating Instagram archive...")
            from memento_mori.extractor import InstagramArchiveExtractor
            from memento_mori.loader import InstagramDataLoader
            from memento_mori.media import InstagramMediaProcessor
            from memento_mori.generator import InstagramSiteGenerator

            extractor = InstagramArchiveExtractor()
            archive = extractor.auto_detect_archive(search_dir=str(self.workspace_dir))
            if not archive:
                raise RuntimeError(f"No Instagram export ZIP found in {self.workspace_dir}")

            log(f"Extracting archive: {Path(archive).name}...")
            with BUILD_LOCK:
                BUILD_STATE["progress"] = 25
            extraction_dir = extractor.extract()

            log("Loading posts, stories, and profile metadata...")
            with BUILD_LOCK:
                BUILD_STATE["progress"] = 45
            loader = InstagramDataLoader(extraction_dir, extractor.file_mapper)
            data = loader.load_all_data()

            log("Processing and optimizing media (WebP / thumbnails)...")
            with BUILD_LOCK:
                BUILD_STATE["progress"] = 65
            media_processor = InstagramMediaProcessor(
                extraction_dir, self.output_dir, thread_count=4, quality=75, max_dimension=1920
            )
            media_result = media_processor.process_media_files(
                data["posts"], data["profile"]["profile_picture"], data.get("stories", {})
            )
            data["posts"] = media_result["updated_post_data"]
            data["profile"]["profile_picture"] = media_result["shortened_profile"]
            if "stories" in data and media_result.get("updated_stories_data"):
                data["stories"] = media_result["updated_stories_data"]

            log("Generating web application & digital signage pages...")
            with BUILD_LOCK:
                BUILD_STATE["progress"] = 90
            generator = InstagramSiteGenerator(data, self.output_dir)
            success = generator.generate()

            if not success:
                raise RuntimeError("Site generator failed to build HTML output.")

            with BUILD_LOCK:
                BUILD_STATE["is_building"] = False
                BUILD_STATE["progress"] = 100
                BUILD_STATE["status"] = "Completed successfully!"
                BUILD_STATE["logs"].append("Build completed successfully! Redirecting...")
            log("Build finished successfully.")

        except Exception as e:
            err_msg = str(e)
            traceback.print_exc()
            with BUILD_LOCK:
                BUILD_STATE["is_building"] = False
                BUILD_STATE["error"] = err_msg
                BUILD_STATE["status"] = f"Error: {err_msg}"
                BUILD_STATE["logs"].append(f"ERROR: {err_msg}")

    def _serve_setup_page(self):
        """Render setup wizard when no archive has been generated yet."""
        html = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Setup • Memento Mori Web App & Signage</title>
  <style>
    :root {
      --bg: #000;
      --card: #141414;
      --border: #262626;
      --accent: #0095f6;
      --gradient: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
      --text: #f5f5f5;
      --muted: #a8a8a8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .setup-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 20px;
      max-width: 580px;
      width: 100%;
      padding: 40px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.8);
      text-align: center;
    }
    .logo-glyph {
      width: 56px;
      height: 56px;
      margin-bottom: 20px;
      color: #fff;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.4px;
      margin-bottom: 10px;
    }
    p {
      color: var(--muted);
      font-size: 15px;
      line-height: 1.5;
      margin-bottom: 28px;
    }
    .status-box {
      background: #1c1c1c;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 24px;
      text-align: left;
      font-size: 14px;
    }
    .status-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .status-row:last-child { margin-bottom: 0; }
    .status-label { color: var(--muted); }
    .status-val { font-weight: 600; color: #fff; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 14px 24px;
      background: var(--accent);
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.15s;
      text-decoration: none;
    }
    .btn:hover { opacity: 0.92; transform: translateY(-1px); }
    .btn.btn-gradient { background: var(--gradient); }
    .progress-bar-wrap {
      width: 100%;
      height: 8px;
      background: #2a2a2a;
      border-radius: 4px;
      overflow: hidden;
      margin: 20px 0 12px;
    }
    .progress-bar-fill {
      width: 0%;
      height: 100%;
      background: var(--gradient);
      transition: width 0.3s ease;
    }
    .terminal-logs {
      background: #0a0a0a;
      border: 1px solid #222;
      border-radius: 10px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      color: #88ff88;
      max-height: 140px;
      overflow-y: auto;
      text-align: left;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="setup-card">
    <svg class="logo-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
    </svg>
    <h1>Memento Mori Web App</h1>
    <p>Transform your Instagram archive export into an interactive viewer &amp; digital signage system.</p>

    <div class="status-box" id="statusBox">
      <div class="status-row">
        <span class="status-label">Archive status:</span>
        <span class="status-val" id="archiveStatus">Checking...</span>
      </div>
      <div class="status-row">
        <span class="status-label">Output status:</span>
        <span class="status-val" id="outputStatus">Pending generation</span>
      </div>
    </div>

    <div id="actionArea">
      <button class="btn btn-gradient" id="buildBtn" onclick="startBuild()">
        🚀 Generate Viewer &amp; Signage
      </button>
    </div>

    <div id="progressArea" style="display:none;">
      <div class="progress-bar-wrap">
        <div class="progress-bar-fill" id="progressBar"></div>
      </div>
      <div id="progressText" style="font-size:13px; color:var(--muted);">Processing media...</div>
      <div class="terminal-logs" id="terminalLogs"></div>
    </div>
  </div>

  <script>
    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        const archiveEl = document.getElementById('archiveStatus');
        const outputEl = document.getElementById('outputStatus');
        const buildBtn = document.getElementById('buildBtn');

        if (data.detected_archive) {
          archiveEl.textContent = 'Found: ' + data.detected_archive;
          archiveEl.style.color = '#79c5ff';
        } else {
          archiveEl.textContent = 'Place a .zip export in the workspace directory';
          archiveEl.style.color = '#f59e0b';
        }

        if (data.ready) {
          outputEl.textContent = 'Generated (' + data.post_count + ' posts)';
          outputEl.style.color = '#10b981';
          window.location.href = '/';
          return;
        }

        if (data.build && data.build.is_building) {
          showProgress(data.build);
        }
      } catch(e) {
        console.error(e);
      }
    }

    async function startBuild() {
      document.getElementById('actionArea').style.display = 'none';
      document.getElementById('progressArea').style.display = 'block';

      try {
        const res = await fetch('/api/build', { method: 'POST' });
        const json = await res.json();
        pollBuild();
      } catch (err) {
        alert('Failed to trigger build: ' + err.message);
      }
    }

    function showProgress(build) {
      document.getElementById('actionArea').style.display = 'none';
      document.getElementById('progressArea').style.display = 'block';
      document.getElementById('progressBar').style.width = build.progress + '%';
      document.getElementById('progressText').textContent = build.status;

      const logsEl = document.getElementById('terminalLogs');
      logsEl.innerHTML = build.logs.map(l => '<div>> ' + l + '</div>').join('');
      logsEl.scrollTop = logsEl.scrollHeight;

      if (!build.is_building && build.progress === 100) {
        setTimeout(() => { window.location.href = '/'; }, 1200);
      }
    }

    function pollBuild() {
      const interval = setInterval(async () => {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (data.build) {
          showProgress(data.build);
          if (!data.build.is_building) {
            clearInterval(interval);
            if (data.ready) {
              window.location.href = '/';
            }
          }
        }
      }, 1000);
    }

    checkStatus();
  </script>
</body>
</html>"""
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(html.encode("utf-8"))))
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _send_json(self, data, status=HTTPStatus.OK):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_json_raw(self, json_string, status=HTTPStatus.OK):
        body = json_string.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Clean logging
        sys.stderr.write(f"[HTTP] {self.address_string()} - {format % args}\n")


def run_server(host="0.0.0.0", port=8080, output_dir="./output", workspace_dir=".", auto_build=False):
    """Start the Memento Mori Web Application Server."""
    out_path = Path(output_dir).resolve()
    ws_path = Path(workspace_dir).resolve()

    out_path.mkdir(parents=True, exist_ok=True)

    # Check if auto-build requested when output is empty
    if auto_build and not (out_path / "index.html").exists():
        print(f"Auto-build enabled: checking for Instagram archives in {ws_path}...")
        try:
            from memento_mori.extractor import InstagramArchiveExtractor
            from memento_mori.loader import InstagramDataLoader
            from memento_mori.media import InstagramMediaProcessor
            from memento_mori.generator import InstagramSiteGenerator

            extractor = InstagramArchiveExtractor()
            archive = extractor.auto_detect_archive(search_dir=str(ws_path))
            if archive:
                print(f"Detected archive: {archive}. Starting initial generation...")
                extraction_dir = extractor.extract()
                loader = InstagramDataLoader(extraction_dir, extractor.file_mapper)
                data = loader.load_all_data()
                processor = InstagramMediaProcessor(extraction_dir, out_path, thread_count=4)
                media_res = processor.process_media_files(
                    data["posts"], data["profile"]["profile_picture"], data.get("stories", {})
                )
                data["posts"] = media_res["updated_post_data"]
                data["profile"]["profile_picture"] = media_res["shortened_profile"]
                if "stories" in data and media_res.get("updated_stories_data"):
                    data["stories"] = media_res["updated_stories_data"]
                generator = InstagramSiteGenerator(data, out_path)
                generator.generate()
                print("Auto-build complete! Website ready.")
        except Exception as e:
            print(f"Auto-build skipped: {e}")

    handler_factory = lambda *args, **kwargs: MementoMoriHandler(
        *args, output_dir=out_path, workspace_dir=ws_path, **kwargs
    )

    server = ThreadingHTTPServer((host, port), handler_factory)

    display_host = "localhost" if host in ["0.0.0.0", "127.0.0.1"] else host
    print("\n" + "=" * 64)
    print("  🚀 MEMENTO MORI WEB APP & DIGITAL SIGNAGE SERVER")
    print("=" * 64)
    print(f"  • Web App Gallery:    http://{display_host}:{port}/")
    print(f"  • Digital Signage:    http://{display_host}:{port}/signage")
    print(f"  • Stories View:       http://{display_host}:{port}/stories")
    print(f"  • Serving Output:     {out_path}")
    print(f"  • Workspace Dir:      {ws_path}")
    print("  • Monitor Modes:      Auto-Detect, Force Portrait (9:16), Force Landscape (16:9)")
    print("=" * 64 + "\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="Memento Mori Web App Server")
    parser.add_argument("--host", default=os.getenv("HOST", "0.0.0.0"), help="Host to bind to [default: 0.0.0.0]")
    parser.add_argument("--port", "-p", type=int, default=int(os.getenv("PORT", "8080")), help="Port to listen on [default: 8080]")
    parser.add_argument("--output", "-o", default=os.getenv("OUTPUT_DIR", "./output"), help="Output directory containing the generated viewer [default: ./output]")
    parser.add_argument("--workspace", "-w", default=os.getenv("WORKSPACE_DIR", "."), help="Workspace directory for exports and uploads [default: .]")
    parser.add_argument("--auto-build", action="store_true", help="Auto-build website if output directory is empty")

    args = parser.parse_args()
    run_server(
        host=args.host,
        port=args.port,
        output_dir=args.output,
        workspace_dir=args.workspace,
        auto_build=args.auto_build
    )


if __name__ == "__main__":
    main()
