# Artwork Museum

A sleek, single‑page gallery powered by The Met Collection API. Modern gradient backdrop, glassy cards, smooth interactions, and strong accessibility.

- No frameworks: vanilla HTML/CSS/JS
- Fast: parallel fetch, lazy images, skeleton loaders
- Accessible: semantic structure, keyboard navigation, focus trap, proper ARIA

## Features

- Random artworks: Uses The Met search API with `hasImages=true`, samples IDs, then fetches object details in parallel.
- Responsive grid: 1–2 columns on small screens, 2–3 on tablets, ~4 on desktop.
- Cards: image (object-fit cover, fixed aspect), 2‑line truncated title, artist + year.
- Details modal: large image, title, artist, year, medium/description (when available), and a link to the work’s page at The Met.
- Interactions: hover lift and subtle image zoom; click to open, ESC or overlay/close button to dismiss; Refresh button shows a spinner.
- Loading & errors: shimmer skeleton cards during fetch; friendly error with “Try again”.
- Accessibility: semantic HTML, keyboard focus styles, cards are buttons (Enter to open), dialog with `aria-modal`, focus trap, and ESC to close; meaningful alt text.
- Theme: light/dark toggle saved in `localStorage`.

## How It Works

- Search endpoint: `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=art`
- Object endpoint: `https://collectionapi.metmuseum.org/public/collection/v1/objects/{id}`
- On load and Refresh:
  1) Search with `hasImages=true` and a general query (`art`).
  2) Randomly sample object IDs (oversampling to ensure valid images).
  3) Fetch details in parallel with `Promise.all`.
  4) Keep items that have `primaryImageSmall` or `primaryImage`.

## Accessibility Notes

- Keyboard: TAB to focus cards, Enter to open; ESC to close the modal.
- Dialog: `role="dialog"`, `aria-modal="true"`, focus trapped inside until closed.
- Alt text: “{title} by {artist}”.
- Reduced motion: honors `prefers-reduced-motion` for quicker transitions.

```
<script>
  window.MET_API_BASE = 'https://your-worker.workers.dev';
  // It should forward /search and /objects/{id}
</script>
```

## Credits

- Data and images: The Metropolitan Museum of Art Collection API.
- This project uses no external libraries and runs entirely in the browser.

