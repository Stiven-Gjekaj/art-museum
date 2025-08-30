/*
  Artwork Museum â€” Vanilla JS app
  - Fetches random artworks from The Met Collection API
  - Renders responsive, accessible gallery with modal details view
  - Includes loading skeletons, error states, and a theme toggle
*/

(() => {
  'use strict';

  // DOM elements
  const galleryEl = document.getElementById('gallery');
  const messageEl = document.getElementById('message');
  const refreshBtn = document.getElementById('refreshBtn');
  const themeToggleBtn = document.getElementById('themeToggle');
  const modalEl = document.getElementById('modal');
  const modalCloseBtn = document.getElementById('modalClose');
  const mainEl = document.getElementById('main');
  const headerEl = document.querySelector('header');
  const footerEl = document.querySelector('footer');

  // API endpoints
  const SEARCH_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=art';
  const OBJECT_URL = 'https://collectionapi.metmuseum.org/public/collection/v1/objects/';

  // State
  let currentAbort = null;
  let lastFocusedEl = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let objectIdPool = null;

  // Prefetch configuration
  const COUNT_PER_BATCH = 10;
  const ENV_IS_GHPAGES = /\.github\.io$/i.test(location.hostname);
  const PREFETCH_BATCHES = ENV_IS_GHPAGES ? 1 : 3; // keep this many batches ready
  const MAX_DETAIL_CONCURRENCY = ENV_IS_GHPAGES ? 4 : 8;
  const FIRST_BATCH_MIN_READY = 6; // gate initial render until N images loaded
  const IMAGE_PRELOAD_TIMEOUT_MS = 8000;

  const prefetch = {
    ready: [], // resolved, fully-prepared batches
    queue: [], // in-flight promises
    filling: false,
    async fill() {
      if (this.filling) return;
      this.filling = true;
      try {
        while (this.ready.length + this.queue.length < PREFETCH_BATCHES) {
          const p = (async () => {
            const items = await fetchRandomArtworks(COUNT_PER_BATCH);
            await preloadImagesForItems(items, { minReady: items.length, timeout: IMAGE_PRELOAD_TIMEOUT_MS });
            return items;
          })();
          this.queue.push(p);
          p.then((items) => {
            const i = this.queue.indexOf(p);
            if (i >= 0) this.queue.splice(i, 1);
            this.ready.push(items);
          }).catch(() => {
            const i = this.queue.indexOf(p);
            if (i >= 0) this.queue.splice(i, 1);
          });
        }
      } finally {
        this.filling = false;
      }
    },
    takeReady() { return this.ready.shift() || null; }
  };

  // Utilities
  async function fetchJson(url, options = {}) {
    const opts = {
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    };
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Network error ${res.status}`);
    return res.json();
  }

  function sampleIds(ids, n) {
    const len = ids.length;
    const count = Math.min(n, len);
    const picked = new Set();
    while (picked.size < count) {
      const idx = Math.floor(Math.random() * len);
      picked.add(ids[idx]);
    }
    return Array.from(picked);
  }

  function cleanText(value, fallback = 'Unknown') {
    if (!value) return fallback;
    const s = String(value).trim();
    return s || fallback;
  }

  function ensureHttps(url) {
    if (!url) return '';
    try {
      const u = new URL(url, 'https://');
      if (u.protocol !== 'https:') u.protocol = 'https:';
      return u.toString();
    } catch {
      // If it's a bare path or invalid, just return as is
      return url.replace(/^http:\/\//i, 'https://');
    }
  }

  // Set helper
  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  // Tiny cache (localStorage)
  const CACHE_KEY = 'am-cache-v1';
  const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
  function saveCache(items) {
    try {
      const payload = { ts: Date.now(), items };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {}
  }
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || !Array.isArray(payload.items)) return null;
      if (typeof payload.ts !== 'number' || Date.now() - payload.ts > CACHE_TTL_MS) return null;
      return payload.items;
    } catch {
      return null;
    }
  }

  

  // Retry wrapper for robustness
  async function fetchJsonRetry(url, options = {}, { retries = 2, baseDelay = 250 } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetchJson(url, options);
      } catch (err) {
        if (attempt === retries) throw err;
        const delay = baseDelay * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  // Data fetching
    async function getObjectIdPool(signal) {
    if (objectIdPool && objectIdPool.length) return objectIdPool;
    const search = await fetchJson(SEARCH_URL, { signal });
    objectIdPool = Array.isArray(search.objectIDs) ? search.objectIDs : [];
    return objectIdPool;
  }
async function fetchRandomArtworks(count = 10, signal) {
    const ids = await getObjectIdPool(signal);
    if (!ids.length) throw new Error('No artworks found');

    const used = new Set();
    const items = [];
    let rounds = 0;

    while (items.length < count && rounds < 3) {
      const sampleSize = Math.min(100, Math.max(count * 10, 60));
      const candidateIds = sampleIds(ids.filter(id => !used.has(id)), sampleSize);
      candidateIds.forEach((id) => used.add(id));

      for (let i = 0; i < candidateIds.length && items.length < count; i += MAX_DETAIL_CONCURRENCY) {
        const slice = candidateIds.slice(i, i + MAX_DETAIL_CONCURRENCY);
        const details = await Promise.all(
          slice.map((id) => fetchJsonRetry(OBJECT_URL + id, { signal }).catch(() => null))
        );
        for (const d of details) {
          if (!d) continue;
          const additional = Array.isArray(d.additionalImages) ? d.additionalImages : [];
          const prioritized = [
            d.primaryImageSmall,
            ...additional.filter(Boolean).filter(u => /web[-]?large/i.test(u || '')),
            d.primaryImage,
            ...additional
          ];
          const candidates = uniq(prioritized.filter(Boolean).map(ensureHttps));
          const img = candidates[0] || '';
          if (!img) continue;
          items.push({
            id: d.objectID,
            title: cleanText(d.title, 'Untitled'),
            artist: cleanText(d.artistDisplayName, 'Unknown artist'),
            date: cleanText(d.objectDate, ''),
            image: img,
            images: candidates,
            alt: `${cleanText(d.title, 'Untitled')} by ${cleanText(d.artistDisplayName, 'Unknown artist')}`,
            medium: cleanText(d.medium || d.creditLine || d.classification || d.department || '', ''),
            culture: cleanText(d.culture || d.period || '', ''),
            objectURL: d.objectURL || `https://www.metmuseum.org/art/collection/search/${d.objectID}`,
          });
          if (items.length >= count) break;
        }
      }
      rounds += 1;
    }

    return items;
  }

  // Image preloading helpers
  function preloadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      try { img.referrerPolicy = 'no-referrer'; } catch {}
      try { img.crossOrigin = 'anonymous'; } catch {}
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  async function preloadImagesForItems(items, { minReady = items.length, timeout = 6000 } = {}) {
    let loaded = 0;
    const tasks = items.map((it) => preloadImage(it.image).then((ok) => { if (ok) loaded += 1; }));
    const all = Promise.allSettled(tasks);
    const gate = new Promise((resolve) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (loaded >= minReady || Date.now() - start > timeout) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
    await Promise.race([all, gate]);
  }

  // Rendering
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function setLoading(isLoading) {
    galleryEl.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (isLoading) {
      clear(messageEl);
      clear(galleryEl);
      const skeletonCount = 10;
      for (let i = 0; i < skeletonCount; i++) {
        const card = document.createElement('div');
        card.className = 'skeleton-card';
        const media = document.createElement('div');
        media.className = 'skeleton__media shimmer';
        const lines = document.createElement('div');
        lines.className = 'skeleton__lines';
        const l1 = document.createElement('div'); l1.className = 'skeleton__line skeleton__line--med';
        const l2 = document.createElement('div'); l2.className = 'skeleton__line';
        const l3 = document.createElement('div'); l3.className = 'skeleton__line skeleton__line--short';
        lines.append(l1, l2, l3);
        card.append(media, lines);
        galleryEl.appendChild(card);
      }
    }
  }

  function renderMessage(kind, text, withRetry = false) {
    clear(messageEl);
    const wrap = document.createElement('div');
    wrap.className = kind === 'error' ? 'error' : 'info';
    const p = document.createElement('p');
    p.textContent = text;
    wrap.appendChild(p);
    if (withRetry) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn primary';
      b.textContent = 'Try again';
      b.addEventListener('click', () => loadArtworks());
      wrap.appendChild(b);
    }
    messageEl.appendChild(wrap);
  }

  function renderGallery(items) {
    clear(galleryEl);
    if (!items || !items.length) {
      renderMessage('info', 'No artworks to display.');
      return;
    }

    items.forEach((item, index) => {
      const btn = document.createElement('button');
      btn.className = 'card';
      btn.type = 'button';
      btn.setAttribute('aria-label', `${item.title} by ${item.artist}${item.date ? ', ' + item.date : ''}`);
      btn.dataset.index = String(index);

      const media = document.createElement('div');
      media.className = 'card__media';
      const img = document.createElement('img');
      img.className = 'card__img';
      img.src = item.image;
      img.alt = item.alt;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      // Allow cross-origin images without tainting canvas (future-friendly)
      img.crossOrigin = 'anonymous';
      try { img.setAttribute('fetchpriority', index < 4 ? 'high' : 'low'); } catch {}

      // Fallback through candidate images if any fail
      if (Array.isArray(item.images) && item.images.length > 1) {
        let idx = 0;
        img.addEventListener('error', () => {
          idx += 1;
          if (idx < item.images.length) {
            img.src = item.images[idx];
          } else {
            // Final fallback: hide broken image but keep card usable
            img.style.display = 'none';
            media.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))';
            media.title = 'Image unavailable';
          }
        }, { once: false });
      }
      media.appendChild(img);

      const content = document.createElement('div');
      content.className = 'card__content';
      const title = document.createElement('h3');
      title.className = 'card__title';
      title.textContent = item.title;
      const meta = document.createElement('p');
      meta.className = 'card__meta';
      meta.textContent = item.date ? item.artist + ' - ' + item.date : item.artist;
      content.append(title, meta);

      btn.append(media, content);

      // Zoom + blur others, then open modal
      btn.addEventListener('click', (e) => {
        const card = e.currentTarget;
        if (!(card instanceof HTMLElement)) return;
        galleryEl.classList.add('selecting');
        document.querySelectorAll('.card').forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
        const open = () => openModal(item, card);
        if (prefersReducedMotion) {
          open();
        } else {
          setTimeout(open, 140);
        }
      });

      galleryEl.appendChild(btn);
    });
  }

  // Modal logic with focus trap
  function getFocusable(root) {
    return Array.from(root.querySelectorAll(
      [
        'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled])',
        'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'object', 'embed',
        '[contenteditable]', '[tabindex]:not([tabindex="-1"])'
      ].join(', ')
    )).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusables = getFocusable(modalEl);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  function openModal(item, triggerEl) {
    lastFocusedEl = triggerEl instanceof HTMLElement ? triggerEl : document.activeElement;

    // Fill content
    const mediaWrap = modalEl.querySelector('.modal__media');
    const titleEl = modalEl.querySelector('.modal__title');
    const bylineEl = modalEl.querySelector('.modal__byline');
    const descEl = modalEl.querySelector('.modal__desc');
    const extrasEl = modalEl.querySelector('.modal__extras');
    const linkEl = modalEl.querySelector('#modal-link');

    if (mediaWrap) {
      clear(mediaWrap);
      const img = document.createElement('img');
      img.src = item.image;
      img.alt = item.alt;
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      try { img.setAttribute('fetchpriority', 'high'); } catch {}
      mediaWrap.appendChild(img);
    }
    if (titleEl) titleEl.textContent = item.title;
    if (bylineEl) bylineEl.textContent = item.date ? item.artist + ' - ' + item.date : item.artist;
    if (descEl) descEl.textContent = item.medium || '';
    if (extrasEl) extrasEl.textContent = item.culture ? `Culture/Period: ${item.culture}` : '';
    if (linkEl) linkEl.href = item.objectURL;

    // Show modal
    modalEl.classList.remove('hidden');
    modalEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    // Hide background content from AT
    headerEl && headerEl.setAttribute('aria-hidden', 'true');
    mainEl && mainEl.setAttribute('aria-hidden', 'true');
    footerEl && footerEl.setAttribute('aria-hidden', 'true');

    // Remove selecting effect once modal is visible
    galleryEl.classList.remove('selecting');
    document.addEventListener('keydown', onKeydown);
    modalEl.addEventListener('keydown', trapFocus);
    modalEl.addEventListener('click', onModalClick);

    // Focus first focusable (close button)
    setTimeout(() => { modalCloseBtn?.focus(); }, 0);
  }

  function closeModal() {
    modalEl.classList.add('hidden');
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    headerEl && headerEl.removeAttribute('aria-hidden');
    mainEl && mainEl.removeAttribute('aria-hidden');
    footerEl && footerEl.removeAttribute('aria-hidden');

    document.removeEventListener('keydown', onKeydown);
    modalEl.removeEventListener('keydown', trapFocus);
    modalEl.removeEventListener('click', onModalClick);

    // Clear selection effect
    galleryEl.classList.remove('selecting');
    document.querySelectorAll('.card').forEach((el) => el.classList.remove('selected'));

    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal();
    }
  }

  function onModalClick(e) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-close]')) closeModal();
  }

  // Theme toggle
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('am-theme', theme); } catch {}
  }
  function initTheme() {
    const saved = (() => { try { return localStorage.getItem('am-theme'); } catch { return null; } })();
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // Load flow
  async function loadArtworks({ gateImages = false, showSkeleton = true } = {}) {
    // Cancel any in-flight fetches
    if (currentAbort) {
      try { currentAbort.abort(); } catch {}
    }
    currentAbort = new AbortController();
    const { signal } = currentAbort;
    if (showSkeleton) {
      setLoading(true);
    } else {
      // Still mark busy for AT; keep current gallery (e.g., cached) visible
      galleryEl.setAttribute('aria-busy', 'true');
    }
    try {
      const items = await fetchRandomArtworks(COUNT_PER_BATCH, signal);
      if (gateImages) {
        await preloadImagesForItems(items, { minReady: Math.min(FIRST_BATCH_MIN_READY, items.length), timeout: IMAGE_PRELOAD_TIMEOUT_MS });
      }
      setLoading(false);
      renderGallery(items);
      saveCache(items);
      if (PREFETCH_BATCHES > 0) prefetch.fill();
    } catch (err) {
      setLoading(false);
      console.error(err);
      renderMessage('error', 'Could not load artworks. Please check your connection.', true);
    } finally {
      currentAbort = null;
    }
  }

  // Event wiring
  refreshBtn?.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('spinning');
    try {
      const ready = prefetch.takeReady();
      if (ready && Array.isArray(ready) && ready.length) {
        renderGallery(ready);
        saveCache(ready);
        if (PREFETCH_BATCHES > 0) prefetch.fill();
      } else {
        await loadArtworks({ gateImages: false });
      }
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove('spinning');
    }  });

  themeToggleBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
  modalCloseBtn?.addEventListener('click', closeModal);

  // Initialize
  initTheme();
  const cached = loadCache();
  if (cached && Array.isArray(cached) && cached.length) {
    renderGallery(cached);
  }
  loadArtworks({ gateImages: true, showSkeleton: !cached });
})();
















