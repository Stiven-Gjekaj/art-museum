# Artwork Museum

A sleek, single-page viewer powered by The Met Collection API. Modern light/dark gradients, smooth interactions, and strong accessibility.

- No frameworks: vanilla HTML/CSS/JS
- Fast: preloaded buffer, cached first paint, skeleton loaders
- Reliable: retry/backoff and CORS-friendly proxy fallbacks
- Accessible: semantic structure, focus trap, proper ARIA

## Features (New)

- Single-image viewer: Shows one artwork at a time.
- Navigation: Prev/Next buttons and keyboard arrows (←/→).
- Detail modal: Tap/click the image for title, artist, date, medium, and link to The Met.
- Preload buffer: Keeps up to 5 upcoming images preloaded for instant Next.
- Request gating: Only fetches from The Met when the preload buffer isn’t full (less than 5/5).
- Mobile detection: Detects mobile devices and enables a mobile-friendly layout automatically.
- Mobile UI: Larger sticky controls and tightened layout on small screens.
- Theme: Light/dark toggle saved in `localStorage`.

## How It Works

- Search endpoint: `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=art`
- Object endpoint: `https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}`
- Load and navigate:
  1) On start, fills a deck of up to 5 preloaded images.
  2) Displays the current artwork; Next pops from the deck and pushes the previous item to history.
  3) If the deck has fewer than 5 items, fetches more from The Met and preloads images to refill.
  4) Clicking the image opens the existing details modal.

## Keyboard Shortcuts

- `←` Previous artwork
- `→` Next artwork
- `Esc` Close details modal

## Credits

- Data and images: The Metropolitan Museum of Art Collection API.
- UI/implementation by Stiven Gjekaj. No external libraries.
