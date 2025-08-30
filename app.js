/*
  Artwork Museum — Vanilla JS app
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

  // Utilities
  async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
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

  function uniq(arr) {
    return Array.from(new Set(arr));
  }

  // Data fetching
  async function fetchRandomArtworks(count = 10, signal) {
    const search = await fetchJson(SEARCH_URL, { signal });
    const ids = Array.isArray(search.objectIDs) ? search.objectIDs : [];
    if (!ids.length) throw new Error('No artworks found');

    // Over-sample to ensure enough with valid images
    const sample = sampleIds(ids, Math.min(60, Math.max(count * 6, count + 10)));
    const detailPromises = sample.map((id) =>
      fetchJson(OBJECT_URL + id, { signal }).catch(() => null)
    );
    const details = (await Promise.all(detailPromises)).filter(Boolean);

    const items = [];
    for (const d of details) {
      const candidates = uniq([
        d.primaryImageSmall,
        d.primaryImage,
        ...(Array.isArray(d.additionalImages) ? d.additionalImages : []),
      ].filter(Boolean).map(ensureHttps));
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

    return items;
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
      meta.textContent = item.artist + (item.date ? ` · ${item.date}` : '');
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
      mediaWrap.appendChild(img);
    }
    if (titleEl) titleEl.textContent = item.title;
    if (bylineEl) bylineEl.textContent = item.artist + (item.date ? ` · ${item.date}` : '');
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
  async function loadArtworks() {
    // Cancel any in-flight fetches
    if (currentAbort) {
      try { currentAbort.abort(); } catch {}
    }
    currentAbort = new AbortController();
    const { signal } = currentAbort;
    setLoading(true);
    try {
      const items = await fetchRandomArtworks(10, signal);
      setLoading(false);
      renderGallery(items);
    } catch (err) {
      setLoading(false);
      console.error(err);
      renderMessage('error', 'Could not load artworks. Please check your connection.', true);
    } finally {
      currentAbort = null;
    }
  }

  // Event wiring
  refreshBtn?.addEventListener('click', () => {
    refreshBtn.disabled = true;
    refreshBtn.classList.add('spinning');
    loadArtworks().finally(() => {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove('spinning');
    });
  });
  themeToggleBtn?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
  modalCloseBtn?.addEventListener('click', closeModal);

  // Initialize
  initTheme();
  loadArtworks();
})();
