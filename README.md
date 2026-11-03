# Memento Mori - Instagram Archive Viewer & Digital Signage

<img align="right" width="300" hspace="20" src="preview.gif" alt="Memento Mori Interface Preview">

**Memento Mori** is a tool that converts your Instagram data export into a beautiful, standalone archive viewer and digital signage web application that resembles the dark-mode Instagram interface. The name "Memento Mori" (Latin for "remember that you will die") reflects the ephemeral nature of our digital content.

If you find a bug that you're able to fix please create a pull request, otherwise [create an issue with helpful info](#troubleshooting--reporting-issues).

## Quick Start

### 1. Run as a Web App (Recommended)
Place your Instagram JSON-format ZIP export(s) into this project folder and run:
```bash
docker compose up
```
The server automatically detects your archive, builds the optimized site if `output/` is empty, and starts serving on **[http://localhost:8080](http://localhost:8080)**:
- **Archive Viewer**: Browse posts and stories at **[http://localhost:8080](http://localhost:8080)**
- **Digital Signage Mode**: Launch kiosk/frame mode at **[http://localhost:8080/signage](http://localhost:8080/signage)** (or click **Digital Signage** in the header)
- **Stories Viewer**: Browse vertical stories at **[http://localhost:8080/stories](http://localhost:8080/stories)**
- **Web Setup Wizard**: Visit **[http://localhost:8080/setup](http://localhost:8080/setup)** to check status or trigger a build from the browser

### 2. Run with Python CLI / Server directly
```bash
# Start the Web App & Digital Signage server (with optional auto-build)
python -m memento_mori.server --port 8080 --auto-build
# or via the main CLI:
python -m memento_mori.cli serve --port 8080 --auto-build

# Or build standalone static HTML files only
python -m memento_mori.cli build
```

## ⚠️ IMPORTANT SECURITY WARNING ⚠️

**DO NOT** share your raw Instagram export online! It contains sensitive personal data:

- Phone numbers
- Precise location data
- Personal messages
- Email addresses
- Other private account data

Only share the generated `output/` folder after processing with this tool.

## How It Works
Memento Mori extracts and merges your Instagram JSON data export(s), repairs text encoding and file extension issues, converts images and video frames into optimized WebP assets and thumbnails, and generates a fast, standalone website (`index.html`, `stories.html`, and `signage.html`) that can be served by the built-in web application server, hosted on any static web host, or browsed offline.

## Key Features

### 🌐 Self-Hosted Web App Server
- **Built-In Multi-Threaded Server**: Serves your archive and signage display with clean URL routes (`/`, `/signage`, `/stories`, `/setup`).
- **Auto-Build on Startup (`--auto-build`)**: Automatically detects, extracts, and builds your Instagram export when the container or server starts if `output/` has not been generated yet.
- **Interactive Web Setup Wizard**: When no generated site is found, visiting `/` opens a dark-mode setup UI showing archive detection status, a one-click build trigger, real-time progress bar, and live streaming build logs.
- **HTTP Range Request Streaming**: Full `206 Partial Content` (`Accept-Ranges: bytes`) support for smooth MP4/WebM video scrubbing, seeking, and playback across desktop browsers, mobile devices, and smart TVs.
- **Built-In REST API & Archive Upload**: JSON endpoints for server/build status (`/api/status`), dynamic post and story feeds (`/api/posts`, `/api/stories`), background build execution (`POST /api/build`), and zero-dependency `.zip` export uploads (`POST /api/upload`).

### 🖥️ Portrait & Landscape Digital Signage
Purpose-built kiosk and digital photo frame mode for wall-mounted vertical displays (9:16) and landscape TVs/monitors (16:9):
- **Smart Orientation Engine**: Auto-detects screen aspect ratio on resize, or manually locks to **Portrait (9:16)** or **Landscape (16:9)**.
- **Adaptive Content Layouts**: Automatically distinguishes vertical/tall media (stories and portrait photos/videos) from wide media—displaying full-bleed showcases, vertical metadata cards, or dual-panel split screens with sidebars on landscape monitors.
- **Dynamic Ambient Lighting**: Soft, color-matched blurred backdrop derived from the current photo or story thumbnail eliminates harsh black letterboxing bars.
- **Cinematic Ken Burns Effect**: Alternating subtle pan-and-zoom motion on photos for a living digital frame feel.
- **Smart Video & Carousel Playback**: Videos play through their natural duration with optional audio and auto-advance on completion; multi-item carousel posts step through every slide with dot indicators before advancing to the next post.
- **Auto-Hiding Glassmorphic HUD & Stealth Mode**: Playback controls, slide counter, orientation switcher, mute toggle, fullscreen button, and settings drawer automatically fade out along with the mouse cursor after 3.5 seconds of inactivity.
- **Screen Wake Lock API**: Automatically requests a display Wake Lock (and re-acquires it on visibility changes) to prevent monitors, tablets, and smart TVs from sleeping.
- **Live Clock & Date Widget**: Toggleable top-bar digital clock and date display.
- **Persistent Settings Drawer & Deep-Linking**: Customize orientation, slide duration (`5s`–`30s`), content filter (`All`, `Posts`, `Stories`, `Photos`, `Videos`), play order (`Shuffle`, `Newest`, `Oldest`), metadata overlay (`Full`, `Minimal`, `Off`), and visual toggles—saved automatically to `localStorage` or controlled via URL query parameters.

### 📸 Redesigned Dark-Mode Archive & Stories Viewer
- **Modern Dark Mode Interface**: Authentic dark-mode Instagram aesthetic with dynamic profile branding, archive date-range header pill, gradient story ring around the profile avatar, and `POSTS` / `STORIES` / `SIGNAGE` navigation tabs.
- **Interactive Grid Badges & Hover Overlays**: Grid thumbnails feature top-right SVG badges for **Video** and **Carousel** posts, plus hover overlays displaying likes, comments, or media counts.
- **Rich Post Detail Modal**:
  - Multi-media carousel navigation with next/previous controls, pagination dots, and keyboard support (`ArrowLeft`, `ArrowRight`, `Escape`).
  - Highlighted `@mentions` and `#hashtags` in captions, plus post engagement metrics (likes, comments, views/impressions) and formatted timestamps.
  - **Launch in Signage Button**: Click the monitor icon inside any post modal to launch Digital Signage starting directly on that post (`signage.html?post=<timestamp>`).
  - **Shareable Deep Links**: Opening posts and stepping through carousel images dynamically updates the URL (`?post=<timestamp>&image=<index>`) for easy bookmarking and sharing.
- **Dedicated Stories Viewer (`stories.html`)**:
  - Browse stories in a 9:16 vertical thumbnail grid or full-screen interactive viewer.
  - Animated progress bar with 10-second auto-progression for photos and duration-aware video playback (looping short clips or playing longer videos in full).
  - Includes a **Pause / Resume** control, smooth slide-transition animations, circular wrap-around navigation, and URL deep-linking (`?story=<timestamp>`).
- **Sorting & Filtering**: Dynamically sort the post grid by **Newest**, **Oldest**, **Multi-Photo**, **Videos**, **Photos**, **Random**, or engagement metrics (**Most Likes**, **Most Comments**, **Most Views** when insights data is present).

### ⚙️ Resilient Data & Media Pipeline
- **Multi-Archive Auto-Detection & Merging**: Automatically detects and merges multi-part Instagram `.zip` exports in chronological order.
- **Schema-Resilient & Content-Based Discovery**: Supports legacy and 2026+ Instagram JSON schemas (Unix and ISO-8601 timestamps, nested `personal_information`, and `label_values` location formats) with automatic **content-sniffing fallback** that locates profile and post JSON files by structure even when Instagram renames export folders.
- **HTML Export Detection & Diagnostics**: Automatically detects unsupported HTML-format exports and prints clear instructions and archive diagnostics.
- **Text Encoding & MIME Extension Repair**: Repairs double-encoded UTF-8 / Mojibake text (emojis, smart quotes, accents) using `ftfy`, and inspects file headers with `libmagic` (`python-magic`) to fix misnamed media files (such as `.heic` files that are actually JPEGs) without altering original source files.
- **Parallel Media Optimization**: Multi-threaded WebP image conversion (preserving originals if WebP is larger), OpenCV video frame thumbnail extraction, `292x292` square post thumbnails, `270x480` (9:16) vertical story thumbnails, and lazy loading after the first 30 items.

## How to Use Memento Mori

### 1. Request Your Instagram Data
1. In the Instagram app or website, go to **Settings > Accounts Center > Your information and permissions > Download your information** (or **Export your information**).
2. Request a download in **JSON** format (HTML format is not supported).
3. Place the downloaded ZIP file(s) directly into the project folder.

### 2. Preferred Method: Using Docker (Easiest)

Memento Mori is available as a pre-built multi-arch Docker image on Docker Hub (`plantsoup/insta:latest`).

```bash
# Start the Web App & Digital Signage server on http://localhost:8080
# (Auto-detects ZIP archives in workspace and auto-builds into ./output if empty)
docker compose up

# Run in the background (detached mode)
docker compose up -d

# Or run a one-off static build without starting the server
docker compose run --rm memento-mori build

# Or run directly with Docker CLI (Web App Server)
docker run --rm -p 8080:8080 \
  -v "$(pwd):/app/workspace" \
  -v "$(pwd)/output:/app/output" \
  plantsoup/insta:latest

# Run a static build with custom quality and output options
docker compose run --rm memento-mori build --output /app/output/my-site --quality 90

# Add Google Analytics tracking to generated pages
docker compose run --rm memento-mori build --gtag-id G-DX1ZWTC9NZ

# Rebuild the Docker image locally if making source modifications
docker compose build
```

### 3. Alternative Method: Direct Python Installation

If you prefer running natively without Docker:

```bash
# Install dependencies
pip install -r requirements.txt
# Or install the package (registers `memento-mori` and `memento-mori-server` commands)
pip install -e .

# Start the Web App & Digital Signage server (with auto-build)
python -m memento_mori.cli serve --port 8080 --auto-build
# or:
memento-mori-server --port 8080 --auto-build

# Or generate the static site only
python -m memento_mori.cli build
# or:
memento-mori build
```

### CLI Arguments (`memento_mori.cli` / `memento-mori`)

```text
Positional Arguments:
  {build,serve,server}     Action to perform: 'build' to generate static viewer,
                           'serve' to run the Web App [default: build]

Options:
  --serve                  Launch the Web App & Digital Signage server
  --port, -p INTEGER       Port for the web app server [default: 8080 or $PORT]
  --host TEXT              Host for the web app server [default: 0.0.0.0 or $HOST]
  --auto-build             Auto-build website if output directory is empty when running serve
  --input PATH             Path to Instagram data (ZIP or folder). If not specified, auto-detection is used.
  --output PATH            Output directory for generated website [default: ./output]
  --threads INTEGER        Number of parallel processing threads [default: CPU core count - 1]
  --search-dir PATH        Directory to search for exports when auto-detecting [default: current directory]
  --quality INTEGER        WebP conversion quality from 1 to 100 [default: 70]
  --max-dimension INTEGER  Maximum dimension for images in pixels [default: 1920]
  --thumbnail-size WxH     Size of thumbnails [default: 292x292]
  --no-auto-detect         Disable auto-detection (requires --input to be specified)
  --gtag-id ID             Google Analytics tag ID (e.g., 'G-XXXXXXXXXX') to inject tracking
  --verbose, -v            Enable verbose output for debugging
```

### Dedicated Server CLI Arguments (`memento_mori.server` / `memento-mori-server`)

```text
Options:
  --host TEXT              Host to bind to [default: 0.0.0.0 or $HOST]
  --port, -p INTEGER       Port to listen on [default: 8080 or $PORT]
  --output, -o PATH        Output directory containing the generated viewer [default: ./output or $OUTPUT_DIR]
  --workspace, -w PATH     Workspace directory for exports and uploads [default: . or $WORKSPACE_DIR]
  --auto-build             Auto-build website if output directory is empty
```

### Example Commands

```bash
# Auto-detect export in current directory and build static site
python -m memento_mori.cli

# Launch Web App server on port 9000 and auto-build if output is empty
python -m memento_mori.cli serve --port 9000 --auto-build

# Specify an explicit input archive and custom output directory
python -m memento_mori.cli build --input path/to/export.zip --output my-site

# Optimize conversion with custom threads and quality
python -m memento_mori.cli build --threads 8 --quality 85 --max-dimension 1600

# Specify custom search directory for auto-detection
python -m memento_mori.cli build --search-dir ~/Downloads

# Run in verbose mode for troubleshooting
python -m memento_mori.cli build --verbose
```

## Viewing Your Generated Site
1. **Web App Server**: Run `docker compose up` (or `python -m memento_mori.cli serve --auto-build`) and visit `http://localhost:8080`, `http://localhost:8080/stories`, or `http://localhost:8080/signage`.
2. **Static Browsing**: Open `output/index.html`, `output/stories.html`, or `output/signage.html` directly in your browser or serve `output/` with any static file server (`python3 -m http.server -d output`).
3. **Stories**: Click on the profile photo (with the gradient story ring) or the **STORIES** tab to launch the interactive Stories viewer.
4. **Digital Signage**: Click the **Digital Signage** button in the top header, the **SIGNAGE** navigation tab, or the monitor icon inside any post modal to start unattended presentation mode.
5. **Static Hosting**: Upload the generated `output/` directory to any static hosting provider (e.g., Cloudflare Pages, Netlify, GitHub Pages, S3, Nginx, Traefik).

## 🖥️ Digital Signage Mode

Digital Signage transforms any display into a living, ambient photo frame or kiosk:

- **Portrait Monitors (9:16)**: Perfectly scaled for vertical monitors, kiosks, or rotated screens with vertical media showcase and typographic metadata cards.
- **Landscape Displays (16:9 / TVs)**: Full-bleed landscape media, or dual-panel split screen showcasing portrait media alongside caption cards and ambient lighting.
- **Multi-Slide Carousels & Video Playback**: Automatically steps through every item in multi-photo/video posts and adapts slide timing to play full video durations before advancing.
- **Auto-Hiding Controls**: Mouse cursor and glassmorphic control HUD fade away after 3.5 seconds of inactivity.
- **Display Wake Lock**: Prevents monitors, tablets, and smart TVs from turning off or entering screensaver mode.

### Keyboard & Mouse Shortcuts

| Key / Input | Action |
| --- | --- |
| `Space` | Pause / Resume playback |
| `Right Arrow` / `L` | Next slide / carousel item |
| `Left Arrow` / `J` | Previous slide / carousel item |
| `F` or `Double-Click` | Toggle Fullscreen |
| `O` | Cycle screen orientation (`Auto` &rarr; `Landscape` &rarr; `Portrait`) |
| `M` | Toggle video audio (`Mute` / `Unmute`) |
| `K` | Toggle Ken Burns cinematic pan & zoom |
| `I` | Cycle metadata overlay (`Full` &rarr; `Minimal` &rarr; `Off`) |
| `S` | Open / close Settings drawer |
| `Esc` | Close settings / exit fullscreen / return to gallery viewer |

### Direct URL Parameters

Customize signage display via URL query parameters (ideal for kiosk or Raspberry Pi auto-launch):

| Parameter | Accepted Values | Description |
| --- | --- | --- |
| `orientation` | `auto`, `landscape`, `portrait` | Set or force display layout orientation |
| `filter` | `all`, `posts`, `stories`, `photos`, `videos` | Filter signage playlist by content or media type |
| `duration` / `interval` | Integer (seconds, e.g. `10`, `15`, `30`) | Slide display duration for photos |
| `order` | `shuffle`, `newest`, `oldest` | Playlist playback order |
| `post` | Unix timestamp (e.g. `1710000000`) | Start playback immediately at a specific post |

Examples:
- `http://localhost:8080/signage?orientation=portrait` (force 9:16 vertical monitor mode)
- `http://localhost:8080/signage?orientation=landscape&filter=photos&duration=15` (landscape photo frame, 15s per slide)
- `http://localhost:8080/signage?filter=stories&order=newest` (stories only, newest first)

### Web App API Endpoints

When running in server mode (`serve`), the following HTTP endpoints are available:

| Method & Path | Description |
| --- | --- |
| `GET /api/status` | Returns JSON with `ready` state, `detected_archive`, `post_count`, `story_count`, and live background `build` progress/logs |
| `GET /api/posts` | Returns processed posts JSON data |
| `GET /api/stories` | Returns processed stories JSON data |
| `POST /api/build` | Triggers an asynchronous background build of the detected archive in the workspace |
| `POST /api/upload` | Accepts a `multipart/form-data` `.zip` upload and saves it to the workspace directory |

## Troubleshooting & Reporting Issues
If you encounter an error:

1. Re-run with the `-v` (verbose) flag to get detailed diagnostic output:
   ```bash
   docker compose run --rm memento-mori build -v
   # or
   python -m memento_mori.cli build -v
   ```

2. When [opening a GitHub issue](https://github.com/plantsoup/insta/issues), please include:
   - The full error message and traceback from the `-v` output
   - Confirming your export was requested in **JSON** format (HTML exports are not supported)
   - Whether you ran via Docker or direct Python
   - Any specifics regarding archive structure

## Why This Exists
When requesting your data from Instagram, the export you receive contains your content in raw JSON structures and unstructured folders that are difficult to browse. Memento Mori transforms your export into an intuitive, familiar viewer and ambient display that preserves your photos, videos, and stories.
