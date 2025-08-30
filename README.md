# Artwork Museum

A sleek, single-page gallery powered by The Met Collection API. Modern light/dark gradient backgrounds, glassy cards, smooth interactions, and strong accessibility.

- No frameworks: vanilla HTML/CSS/JS
- Fast: lazy images, mid-size assets, cached first paint, skeleton loaders
- Reliable: retry/backoff and CORS-friendly proxy fallbacks
- Accessible: semantic structure, keyboard navigation, focus trap, proper ARIA

## Quick Start

- Open `art-museum/index.html` in a modern browser, or
- Serve locally for a cleaner dev experience:
  - Python: `python -m http.server 5173` then open `http://localhost:5173/art-museum/`
  - Node (npx): `npx serve -l 5173` and open the printed URL
- Hosted on GitHub Pages works out of the box.

## Features

- Random artworks: Searches The Met API with `hasImages=true` and fetches object details.
- Responsive grid: 1–2 columns on small screens, 2–3 on tablets, ~4 on desktop.
- Cards: fixed-aspect image (object-fit: cover), 2-line truncated title, artist + year.
- Details modal: larger image, title, artist, year, medium/description (when available), and a link to the work’s page at The Met.
- Header layout: Refresh on the left, uppercase centered title (Bebas Neue), theme toggle on the right.
- Performance:
  - Uses “web-large” image variants (~720–1280px) for faster loads with graceful fallbacks.
  - Lazy-loads card images; boosts priority for the first few.
  - First load “gates” rendering until several images are ready to reduce pop-in.
  - Caches the last successful gallery in `localStorage` and renders it instantly on revisit.
  - On GitHub Pages, concurrency and prefetching are tuned down to avoid API throttling.
- Reliability:
  - Request retry with exponential backoff.
  - Automatic fallback to public CORS proxies (AllOrigins, isomorphic-git) if the direct API call fails.
  - Supports a custom proxy base via `window.MET_API_BASE` for maximum reliability.
- Accessibility: semantic HTML, keyboard focus styles, cards are buttons (Enter opens), dialog with `aria-modal` + focus trap, ESC/overlay/close button to dismiss, and meaningful alt text.
- Theme: light/dark mode toggle saved in `localStorage`; light uses a white gradient, dark uses a deep black gradient.

## How It Works

- Search endpoint: `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=art`
- Object endpoint: `https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}`
- On load (and Refresh):
  1) Optionally show cached items immediately (if available).
  2) Search with `hasImages=true` and sample object IDs.
  3) Fetch object details with limited concurrency and retry/backoff.
  4) Build multiple image candidates, preferring “web-large” sizes; skip objects without images.
  5) Render the gallery; prefetch is disabled on GitHub Pages to avoid bursts.

## Configuration (in `app.js`)

- `COUNT_PER_BATCH` (default 10): number of artworks per load.
- `PREFETCH_BATCHES` (0 on GitHub Pages): number of background batches to prepare.
- `MAX_DETAIL_CONCURRENCY` (2 on GitHub Pages): number of parallel object detail requests.
- `FIRST_BATCH_MIN_READY` (default 6): gate initial render until this many images load.
- `IMAGE_PRELOAD_TIMEOUT_MS` (default 8000): max wait for the initial gate.
- `CACHE_TTL_MS` (default 24h): TTL for localStorage cache.
- API base override: add before `app.js` in `index.html`:

```
<script>
  window.MET_API_BASE = 'https://your-worker.workers.dev';
  // Should forward /search and /objects/{id}
</script>
```

## Project Structure

```
art-museum/
├─ index.html    # Semantic layout, header, gallery, modal, footer
├─ styles.css    # Gradients, glassy cards, responsive grid, modal, skeletons
└─ app.js        # Fetching, retry/backoff, proxy fallback, caching, rendering
```

## Troubleshooting

- “Blocked by CORS” on GitHub Pages: The Met API may return 403 without CORS headers when requests spike. This app now:
  - Limits concurrency and disables background prefetch on `*.github.io`.
  - Falls back to public CORS proxies when direct fetch fails.
  - Allows a custom proxy via `window.MET_API_BASE` for maximum reliability.
- Still slow? Reduce `MAX_DETAIL_CONCURRENCY` to 1 and leave `PREFETCH_BATCHES = 0`.
- Extensions: Some privacy/ad blockers may block `images.metmuseum.org`. Whitelist that domain.

## Credits

- Data and images: The Metropolitan Museum of Art Collection API.
- UI/implementation by Stiven Gjekaj. No external libraries.
