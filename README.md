# Memento Mori - Instagram Archive Viewer

<img align="right" width="300" hspace="20" src="preview.gif" alt="Memento Mori Interface Preview">

**Memento Mori** is a tool that converts your Instagram data export into a beautiful, standalone viewer that resembles the Instagram interface. The name "Memento Mori" (Latin for "remember that you will die") reflects the ephemeral nature of our digital content.

If you find a bug that you're able to fix please create a pull request, otherwise [create an issue with helpful info](#troubleshooting--reporting-issues).

## Quick Start
Get your Instagram data export as a JSON-format zip, place it in this directory, and run:
```bash
docker compose run --rm memento-mori
```
Then open `output/index.html` in your browser.

## ⚠️ IMPORTANT SECURITY WARNING ⚠️

**DO NOT** share your raw Instagram export online! It contains sensitive personal data:

- Phone numbers
- Precise location data
- Personal messages
- Email addresses
- Other private account data

Only share the generated `output/` folder after processing with this tool.

## How It Works
Memento Mori processes your Instagram data export and generates a fast, standalone static website with your posts and stories, converting media into optimized formats and organizing everything into a structure that can be viewed offline or hosted on any web server.

## Key Features
- **Familiar Interface**: Grid layout with dark mode aesthetic, post detail modal, and swipeable carousel for multi-media posts
- **Stories Support**: View your Instagram Stories with auto-progression, indicators, and 9:16 aspect ratio display
- **Media Optimization**: Automatically converts images to WebP, extracts video frame thumbnails, and preserves playback
- **Sorting & Filtering**: Sort posts by newest, oldest, multi-photo, videos only, photos only, random, or engagement metrics (likes, comments, views)
- **Profile Information**: Displays bio, links, and follower count from your Instagram export
- **Standalone Static Output**: Zero backend required for serving—host on GitHub Pages, Cloudflare Pages, S3, Traefik, or browse locally
- **Parallel Processing**: Multi-threaded media conversion with configurable quality and resolution limits

## How to Use Memento Mori

### 1. Request Your Instagram Data
1. In the Instagram app or website, go to **Settings > Accounts Center > Your information and permissions > Download your information**.
2. Request a download in **JSON** format (HTML format is not supported).
3. Place the downloaded ZIP file directly into the project folder.

### 2. Preferred Method: Using Docker (Easiest)

Memento Mori is available as a pre-built multi-arch Docker image on Docker Hub (`plantsoup/insta:latest`).

```bash
# Run with Docker Compose (auto-detects zip in workspace and writes to ./output)
docker compose run --rm memento-mori

# Or run directly with Docker CLI
docker run --rm \
  -v "$(pwd):/app/workspace" \
  -v "$(pwd)/output:/app/output" \
  plantsoup/insta:latest

# Run with custom arguments
docker compose run --rm memento-mori --output /app/output/my-site --quality 90

# Add Google Analytics tracking to output
docker compose run --rm memento-mori --gtag-id G-DX1ZWTC9NZ

# Rebuild locally if making source modifications
docker compose build
```

Preview the generated site in your browser:
```bash
python3 -m http.server -d output
```

### 3. Alternative Method: Direct Python Installation

If you prefer running natively without Docker:

```bash
# Install dependencies
pip install -r requirements.txt
# Or install in editable mode
pip install -e .

# Run the CLI
python -m memento_mori.cli

# Preview the site locally
python3 -m http.server -d output
```

### CLI Arguments

```
Options:
  --input PATH             Path to Instagram data (ZIP or folder). If not specified, auto-detection will be used.
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

### Example Commands

```bash
# Auto-detect export in current directory
python -m memento_mori.cli

# Specify an explicit input archive and custom output directory
python -m memento_mori.cli --input path/to/export.zip --output my-site

# Optimize conversion with custom threads and quality
python -m memento_mori.cli --threads 8 --quality 85 --max-dimension 1600

# Specify custom search directory
python -m memento_mori.cli --search-dir ~/Downloads

# Run in verbose mode for troubleshooting
python -m memento_mori.cli --verbose
```

## Viewing Your Generated Site
1. Once processing finishes, open `output/index.html` in your web browser.
2. Click on the profile photo or "Stories" tab to launch the interactive Stories viewer.
3. You can upload the entire `output/` directory to any static hosting provider (e.g., Cloudflare Pages, Netlify, GitHub Pages, Nginx, Traefik).

## Troubleshooting & Reporting Issues
If you encounter an error:

1. Re-run with the `-v` (verbose) flag to get detailed diagnostic output:
   ```bash
   docker compose run --rm memento-mori -v
   # or
   python -m memento_mori.cli -v
   ```

2. When [opening a GitHub issue](https://github.com/plantsoup/insta/issues), please include:
   - The full error message and traceback from the `-v` output
   - Confirming your export was requested in **JSON** format (HTML exports are not supported)
   - Whether you ran via Docker or direct Python
   - Any specifics regarding archive structure

## Why This Exists
When requesting your data from Instagram, the export you receive contains your content in raw JSON structures and unstructured folders that are difficult to browse. Memento Mori transforms your export into an intuitive, familiar viewer that preserves your photos, videos, and stories.
