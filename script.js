(() => {
  'use strict';

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* =====================================================================
     EmailJS delivery — lets form submissions actually reach the admin.

     Setup (one-time, ~5 minutes):
       1. Create a free account at https://www.emailjs.com
       2. Add an Email Service (e.g. Gmail) — note its Service ID.
       3. Create two Email Templates — note their Template IDs:
            - a "contact inquiry" template using variables:
              {{name}} {{company}} {{email}} {{phone}} {{asset}} {{message}}
            - a "job application" template using variables:
              {{name}} {{email}} {{phone}} {{base}} {{position}} {{experience}} {{message}}
              (attach the {{resume}} file field as an attachment on the template)
       4. Copy your Public Key from Account > General.
       5. Paste all four values into EMAILJS_CONFIG below.

     Until configured, submissions fall back to opening the visitor's own
     email client (mailto:) pre-filled with their message, so the admin
     still receives every inquiry without any setup.
  ===================================================================== */
  const EMAILJS_CONFIG = {
    publicKey: 'YOUR_EMAILJS_PUBLIC_KEY',
    serviceId: 'YOUR_EMAILJS_SERVICE_ID',
    contactTemplateId: 'YOUR_EMAILJS_CONTACT_TEMPLATE_ID',
    applyTemplateId: 'YOUR_EMAILJS_APPLY_TEMPLATE_ID'
  };
  const ADMIN_EMAILS = {
    contact: 'tech@turbotechcorp.com',
    apply: 'tech@turbotechcorp.com'
  };

  const isEmailJsConfigured = () =>
    typeof window.emailjs !== 'undefined' &&
    Object.values(EMAILJS_CONFIG).every(v => v && !v.startsWith('YOUR_'));

  if (isEmailJsConfigured()) {
    emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
  }

  const openMailtoFallback = (toAddress, subject, fields) => {
    const body = fields.map(([label, value]) => `${label}: ${value || '—'}`).join('\n');
    window.location.href =
      `mailto:${toAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  /* =====================================================================
     SVG builders — turbine blades and bolt rings are generated so the
     markup stays readable instead of repeating 22 near-identical paths.
  ===================================================================== */
  const NS = 'http://www.w3.org/2000/svg';

  $$('[data-blades]').forEach(group => {
    const count = parseInt(group.dataset.blades, 10) || 12;
    const d = group.dataset.blade;
    if (!d) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('transform', `rotate(${(360 / count) * i} 200 200)`);
      frag.appendChild(p);
    }
    group.appendChild(frag);
  });

  $$('[data-bolts]').forEach(group => {
    const count = parseInt(group.dataset.bolts, 10) || 8;
    const radius = parseFloat(group.dataset.boltRadius) || 42;
    const size = parseFloat(group.dataset.boltSize) || 4.5;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', '200');
      c.setAttribute('cy', String(200 - radius));
      c.setAttribute('r', String(size));
      c.setAttribute('transform', `rotate(${(360 / count) * i} 200 200)`);
      frag.appendChild(c);
    }
    group.appendChild(frag);
  });

  /* =====================================================================
     Theme toggle — persisted via localStorage
  ===================================================================== */
  const root = document.documentElement;
  const themeToggle = $('#themeToggle');

  const syncTheme = () => {
    if (themeToggle) {
      themeToggle.setAttribute('aria-pressed', String(root.getAttribute('data-theme') === 'light'));
    }
  };
  syncTheme();

  themeToggle?.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('turbotech-theme', next); } catch (e) { /* storage blocked */ }
    syncTheme();
  });

  /* Footer year */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* =====================================================================
     Word splitter — wraps each word so headings can slide up behind a mask
  ===================================================================== */
  const splitWords = (rootEl) => {
    const walk = (node) => {
      Array.from(node.childNodes).forEach(child => {
        if (child.nodeType === Node.TEXT_NODE) {
          if (!child.textContent.trim()) return;
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (!part.trim()) { frag.appendChild(document.createTextNode(part)); return; }
            const outer = document.createElement('span');
            outer.className = 'w';
            const inner = document.createElement('span');
            inner.className = 'w-i';
            inner.textContent = part;
            outer.appendChild(inner);
            frag.appendChild(outer);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(rootEl);
    $$('.w-i', rootEl).forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i * 55, 700)}ms`;
    });
  };

  if (!reduce) $$('[data-split]').forEach(splitWords);

  /* =====================================================================
     Reveal on scroll
  ===================================================================== */
  const revealSelector = '.reveal, .reveal-mask, .reveal-scale';

  const startReveals = () => {
    const els = $$(revealSelector);
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const siblings = Array.from(el.parentElement?.children || []);
        const delay = Math.min(siblings.indexOf(el) * 90, 400);
        setTimeout(() => el.classList.add('is-visible'), delay);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => io.observe(el));
  };

  /* =====================================================================
     Preloader
  ===================================================================== */
  const preloader = $('#preloader');
  const preloadBar = $('#preloadBar');

  let loadFinished = false;
  const finishLoading = () => {
    if (loadFinished) return;          // `load` and the timeout ceiling can both fire
    loadFinished = true;
    if (preloadBar) preloadBar.style.width = '100%';
    setTimeout(() => {
      preloader?.classList.add('is-done');
      document.body.classList.remove('is-locked');
      startReveals();
    }, 320);
  };

  if (preloader && !reduce) {
    document.body.classList.add('is-locked');
    let pct = 0;
    const tick = setInterval(() => {
      pct = Math.min(pct + Math.random() * 18, 88);
      if (preloadBar) preloadBar.style.width = pct + '%';
    }, 130);

    const done = () => { clearInterval(tick); finishLoading(); };
    if (document.readyState === 'complete') setTimeout(done, 420);
    else window.addEventListener('load', () => setTimeout(done, 320));
    setTimeout(done, 3600); // hard ceiling so a slow image never traps the page
  } else {
    preloader?.classList.add('is-done');
    startReveals();
  }

  /* =====================================================================
     Text scramble — settles technical labels into place
  ===================================================================== */
  const CHARS = '▚▞ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>·';

  const scramble = (el) => {
    const final = el.textContent;
    let frame = 0;
    const queue = final.split('').map((ch, i) => ({
      ch, start: Math.floor(i * 1.6), end: Math.floor(i * 1.6) + 14
    }));
    const run = () => {
      let out = '', done = 0;
      queue.forEach(item => {
        if (frame >= item.end) { out += item.ch; done++; }
        else if (frame >= item.start && item.ch.trim()) {
          out += CHARS[Math.floor(Math.random() * CHARS.length)];
        } else { out += item.ch; }
      });
      el.textContent = out;
      if (done < queue.length) { frame++; requestAnimationFrame(run); }
    };
    run();
  };

  if (!reduce && 'IntersectionObserver' in window) {
    const scrambleIo = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        setTimeout(() => scramble(entry.target), 500);
        scrambleIo.unobserve(entry.target);
      });
    }, { threshold: 0.8 });
    $$('[data-scramble]').forEach(el => scrambleIo.observe(el));
  }

  /* =====================================================================
     Animated counters
  ===================================================================== */
  const runCount = (el) => {
    const target = parseInt(el.dataset.count, 10);
    if (isNaN(target)) return;
    if (reduce) { el.textContent = String(target); return; }
    const duration = 1400, start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if ('IntersectionObserver' in window) {
    const countIo = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        runCount(entry.target);
        countIo.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    $$('[data-count]').forEach(el => countIo.observe(el));
  } else {
    $$('[data-count]').forEach(runCount);
  }

  /* =====================================================================
     Scroll-driven 3D depth
     ---------------------------------------------------------------------
     Elements marked [data-depth] sit on a plane that is turned in 3D
     against their own position in the viewport, so the motion tracks the
     scrollbar the whole way past instead of firing once on entry.

     Positions come from the offsetTop chain rather than
     getBoundingClientRect: the rect of an element we are translating
     already includes that translation, so reading it would feed our own
     output back in as the next frame's input. offsetTop/offsetHeight are
     layout values that ignore transforms, which also keeps this off the
     per-frame layout-read path entirely.
  ===================================================================== */
  const DEPTH_PRESETS = {
    //       lay back    turn    spin   drift  push back  shrink
    soft:  { rx:  6, ry:  0, rz:  0, y:  12, z:  90, s:  .02 },
    panel: { rx:  9, ry:  0, rz:  0, y:  18, z: 150, s:  .04 },
    deck:  { rx: 13, ry:  0, rz:  0, y:  26, z: 300, s:  .06 },
    belt:  { rx: 16, ry:  0, rz:  0, y:   0, z:   0, s: -.06 },
    rotor: { rx: 17, ry: 12, rz: 55, y: -34, z: 180, s:  .05 },
  };

  /* Within this much of the settle line an element is left with no
     transform at all, so anything sitting comfortably on screen renders
     through no 3D projection and keeps its text pixel-crisp. */
  const DEPTH_DEAD = .18;

  const depthItems = new Map();
  $$('[data-depth]').forEach(el => {
    depthItems.set(el, {
      cfg: DEPTH_PRESETS[el.dataset.depth] || DEPTH_PRESETS.panel,
      top: 0, height: 0, last: '', hot: false,
    });
  });

  const depthOn = !reduce && depthItems.size > 0;
  let depthScale = 1;

  const measureDepth = () => {
    if (!depthOn) return;
    depthScale = window.innerWidth <= 760 ? .55 : 1;   // gentler on a phone
    depthItems.forEach((item, el) => {
      let y = 0;
      for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
      item.top = y;
      item.height = el.offsetHeight;
    });
  };

  const updateDepth = (scrollY) => {
    if (!depthOn) return;

    const vh = window.innerHeight;
    const line = vh * .55;          // the height at which a plane settles flat

    depthItems.forEach((item, el) => {
      const elTop = item.top - scrollY;
      const elBottom = elTop + item.height;

      /* nothing off screen is worth transforming, and a compositor layer is
         only worth holding while the element is somewhere near one */
      const near = elBottom > -vh * .35 && elTop < vh * 1.35;
      if (near !== item.hot) {
        item.hot = near;
        el.style.willChange = near ? 'transform' : '';
      }

      /* an element straddling the settle line counts as arrived whatever its
         height, so a list taller than the screen sits flat while you read it
         and only turns on the way in and the way back out */
      let p = 0;
      if (elTop > line) p = (elTop - line) / (vh - line);
      else if (elBottom < line) p = (elBottom - line) / line;

      const sign = p < 0 ? -1 : 1;
      const away = Math.min(Math.max((Math.abs(p) - DEPTH_DEAD) / (1 - DEPTH_DEAD), 0), 1);

      if (!near || away === 0) {
        if (item.last !== '') { el.style.transform = ''; item.last = ''; }
        return;
      }

      const q = sign * away * away * depthScale;   // eased, sign preserved
      const mag = Math.abs(q);
      const c = item.cfg;

      const t =
        'perspective(1500px) translate3d(0, ' + (c.y * q).toFixed(1) + 'px, ' +
        (-c.z * mag).toFixed(0) + 'px) rotateX(' + (-c.rx * q).toFixed(2) +
        'deg) rotateY(' + (c.ry * q).toFixed(2) + 'deg) rotateZ(' +
        (c.rz * q).toFixed(2) + 'deg) scale(' + (1 - c.s * mag).toFixed(4) + ')';

      if (t !== item.last) { el.style.transform = t; item.last = t; }
    });
  };

  measureDepth();
  window.addEventListener('resize', measureDepth);
  window.addEventListener('load', measureDepth);

  /* =====================================================================
     Header state, scroll progress, back-to-top, 3D depth, timeline
  ===================================================================== */
  const header      = $('#siteHeader');
  const backToTop   = $('#backToTop');
  const progressBar = $('#scrollProgressBar');
  const timeline    = $('#timeline');
  const timelineFill= $('#timelineFill');
  const steps       = $$('.step');

  let ticking = false;

  const onScroll = () => {
    const y = window.scrollY;
    const doc = document.documentElement;

    header?.classList.toggle('is-scrolled', y > 20);
    backToTop?.classList.toggle('is-visible', y > 640);

    if (progressBar) {
      const max = doc.scrollHeight - doc.clientHeight;
      progressBar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    }

    updateDepth(y);

    if (timeline && timelineFill) {
      const r = timeline.getBoundingClientRect();
      const anchor = window.innerHeight * 0.55;
      const p = Math.max(0, Math.min(1, (anchor - r.top) / r.height));
      timelineFill.style.height = (p * 100) + '%';
      steps.forEach(step => {
        const dot = step.querySelector('.step-dot');
        if (!dot) return;
        const dr = dot.getBoundingClientRect();
        step.classList.toggle('is-lit', dr.top + dr.height / 2 <= anchor);
      });
    }

    ticking = false;
  };

  const requestScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScroll);
  };

  window.addEventListener('scroll', requestScroll, { passive: true });
  window.addEventListener('resize', requestScroll);
  onScroll();

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* =====================================================================
     Mobile navigation
  ===================================================================== */
  const navToggle   = $('#navToggle');
  const mainNav     = $('#mainNav');
  const navBackdrop = $('#navBackdrop');
  const navClose    = $('#mainNavClose');

  const closeNav = () => {
    mainNav?.classList.remove('is-open');
    navBackdrop?.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('is-locked');
  };
  const openNav = () => {
    mainNav?.classList.add('is-open');
    navBackdrop?.classList.add('is-open');
    navToggle?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
  };

  navToggle?.addEventListener('click', () => {
    mainNav?.classList.contains('is-open') ? closeNav() : openNav();
  });
  navClose?.addEventListener('click', closeNav);
  navBackdrop?.addEventListener('click', closeNav);
  $$('.nav-link', mainNav || document).forEach(a => a.addEventListener('click', closeNav));
  window.addEventListener('resize', () => { if (window.innerWidth > 760) closeNav(); });

  /* =====================================================================
     Cursor ring — follows the mouse, and on touch appears under the finger
     then fades out a second after the last contact.
  ===================================================================== */
  if (!reduce) {
    const dot  = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(dot, ring);

    const TOUCH_LINGER = 1000;
    let mx = 0, my = 0, rx = 0, ry = 0;
    let raf = null, shown = false, hideTimer = null, lastTouch = 0;

    const loop = () => {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = `translate(${rx.toFixed(2)}px, ${ry.toFixed(2)}px)`;
      raf = requestAnimationFrame(loop);
    };

    const show = () => {
      if (shown) return;
      shown = true;
      dot.classList.add('is-on');
      ring.classList.add('is-on');
      if (raf === null) loop();          // only animate while actually visible
    };

    const hide = () => {
      shown = false;
      dot.classList.remove('is-on');
      ring.classList.remove('is-on');
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    };

    const moveTo = (x, y) => {
      mx = x; my = y;
      dot.style.transform = `translate(${x}px, ${y}px)`;
    };

    /* --- mouse: follows continuously, hides when the pointer leaves --- */
    window.addEventListener('mousemove', (e) => {
      // touching also emits synthetic mouse events; ignore those so they
      // cannot cancel the touch fade-out below
      if (Date.now() - lastTouch < 700) return;
      clearTimeout(hideTimer);
      moveTo(e.clientX, e.clientY);
      show();
    }, { passive: true });

    document.addEventListener('mouseleave', hide);

    /* --- touch: show under the finger, then linger for a second --- */
    const fadeAfterTouch = () => {
      lastTouch = Date.now();
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, TOUCH_LINGER);
    };

    window.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (!t) return;
      lastTouch = Date.now();
      clearTimeout(hideTimer);
      if (!shown) { rx = t.clientX; ry = t.clientY; }  // snap, don't fly in
      moveTo(t.clientX, t.clientY);
      show();
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!t) return;
      lastTouch = Date.now();
      clearTimeout(hideTimer);
      moveTo(t.clientX, t.clientY);
      show();
    }, { passive: true });

    window.addEventListener('touchend', fadeAfterTouch, { passive: true });
    window.addEventListener('touchcancel', fadeAfterTouch, { passive: true });

    /* --- grow over interactive targets (mouse only) --- */
    const hot = 'a, button, .gcard, .svc, .loc, .job, input, select, textarea, .filter-chip';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest(hot)) ring.classList.add('is-hot');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest(hot)) ring.classList.remove('is-hot');
    });
  }

  /* =====================================================================
     Magnetic buttons + card tilt/glare
  ===================================================================== */
  if (fine && !reduce) {
    $$('[data-magnetic]').forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.22}px, ${y * 0.3}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });

    $$('[data-tilt]').forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--mx', (px * 100) + '%');
        el.style.setProperty('--my', (py * 100) + '%');
      });
    });
  }

  /* Ripple on buttons and chips */
  if (!reduce) {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('.btn, .filter-chip');
      if (!t) return;
      const r = t.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 1.8;
      const ripple = document.createElement('span');
      ripple.className = 'btn-ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - r.left - size / 2) + 'px';
      ripple.style.top  = (e.clientY - r.top  - size / 2) + 'px';
      t.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  /* =====================================================================
     Marquee — duplicate each track so the loop is seamless
  ===================================================================== */
  $$('[data-marquee]').forEach(m => {
    const track = m.querySelector('.marquee-track');
    if (!track) return;
    const copy = track.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    m.appendChild(copy);
  });

  /* =====================================================================
     Careers — department filter
  ===================================================================== */
  const jobCards = $$('.job-card');
  const noResults = $('#noResults');
  const jobChips = $('#jobList') ? $$('.filter-bar .filter-chip') : [];

  jobChips.forEach(chip => {
    chip.addEventListener('click', () => {
      jobChips.forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const filter = chip.dataset.filter;
      let shown = 0;
      jobCards.forEach(card => {
        const match = filter === 'all' || card.dataset.dept === filter;
        card.classList.toggle('is-hidden', !match);
        if (match) shown++;
      });
      if (noResults) noResults.hidden = shown !== 0;
      measureDepth();   // filtering changes the height of everything below it
    });
  });

  /* Careers — "Apply" prefills the form and scrolls to it */
  const positionSelect = $('#aPosition');
  $$('.job-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const position = btn.dataset.position;
      if (positionSelect) {
        const exists = Array.from(positionSelect.options)
          .some(o => o.value === position || o.textContent === position);
        if (exists) positionSelect.value = position;
      }
      $('#apply')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      setTimeout(() => $('#aName')?.focus({ preventScroll: true }), reduce ? 0 : 600);
    });
  });

  /* Careers — resume file feedback */
  const resumeInput = $('#aResume');
  const fileDrop = $('#fileDrop');
  const fileDropLabel = $('#fileDropLabel');
  const RESUME_PLACEHOLDER = 'Choose file — PDF or Word, up to 10MB';

  resumeInput?.addEventListener('change', () => {
    const file = resumeInput.files && resumeInput.files[0];
    if (fileDropLabel) fileDropLabel.textContent = file ? file.name : RESUME_PLACEHOLDER;
    fileDrop?.classList.toggle('has-file', !!file);
  });

  /* =====================================================================
     Gallery — category filter
  ===================================================================== */
  const galleryGrid = $('#galleryGrid');
  const galleryCards = $$('.gallery-card');
  const galleryNoResults = $('#galleryNoResults');
  const galleryChips = galleryGrid ? $$('.filter-bar .filter-chip') : [];

  if (galleryGrid) {
    galleryChips.forEach(chip => {
      chip.addEventListener('click', () => {
        galleryChips.forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        const filter = chip.dataset.filter;
        let shown = 0;
        galleryCards.forEach(card => {
          const match = filter === 'all' || card.dataset.cat === filter;
          card.classList.toggle('is-hidden', !match);
          if (match) shown++;
        });
        if (galleryNoResults) galleryNoResults.hidden = shown !== 0;
        measureDepth();   // filtering changes the height of everything below it
      });
    });
  }

  /* =====================================================================
     Gallery — lightbox
  ===================================================================== */
  const lightbox = $('#lightbox');
  let openLightbox = null;

  if (lightbox && galleryCards.length) {
    const lbImg   = $('#lightboxImg');
    const lbCat   = $('#lightboxCat');
    const lbTitle = $('#lightboxTitle');
    const lbClose = $('#lightboxClose');
    const lbPrev  = $('#lightboxPrev');
    const lbNext  = $('#lightboxNext');

    let index = 0, lastFocused = null;
    const visible = () => galleryCards.filter(c => !c.classList.contains('is-hidden'));

    const render = (i) => {
      const cards = visible();
      if (!cards.length) return;
      index = (i + cards.length) % cards.length;
      const card = cards[index];
      const img = card.querySelector('img');
      lbImg.src = img.src;
      lbImg.alt = img.alt;
      lbCat.textContent   = card.querySelector('.shot-cat')?.textContent || '';
      lbTitle.textContent = card.querySelector('.shot-title')?.textContent || '';
    };

    openLightbox = (card) => {
      const i = visible().indexOf(card);
      lastFocused = document.activeElement;
      render(i === -1 ? 0 : i);
      lightbox.hidden = false;
      document.body.classList.add('is-locked');
      lbClose.focus();
    };

    const close = () => {
      lightbox.hidden = true;
      document.body.classList.remove('is-locked');
      lastFocused?.focus();
    };

    galleryCards.forEach(card => {
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.addEventListener('click', () => openLightbox(card));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(card); }
      });
    });

    lbClose.addEventListener('click', close);
    lbPrev.addEventListener('click', () => render(index - 1));
    lbNext.addEventListener('click', () => render(index + 1));
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });

    document.addEventListener('keydown', (e) => {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') render(index - 1);
      if (e.key === 'ArrowRight') render(index + 1);
    });
  }

  /* =====================================================================
     Slideshow — self-contained, so several can run on one page
  ===================================================================== */
  const initSlideshow = (root) => {
    const slides = $$('.ss-slide', root);
    if (!slides.length) return;

    const rail    = $('[data-ss-rail]', root);
    const info    = $('[data-ss-info]', root);
    const catEl   = $('[data-ss-cat]', root);
    const titleEl = $('[data-ss-title]', root);
    const idxEl   = $('[data-ss-index]', root);
    const totalEl = $('[data-ss-total]', root);
    const playBtn = $('[data-ss-toggle]', root);

    const duration = parseInt(root.dataset.interval, 10) || 5000;
    root.style.setProperty('--ss-dur', (duration / 1000) + 's');

    const pad = n => String(n).padStart(2, '0');
    if (totalEl) totalEl.textContent = pad(slides.length);

    let idx = Math.max(0, slides.findIndex(s => s.classList.contains('is-active')));
    let timer = null;
    let playing = !reduce;

    // one rail segment per slide
    const segs = slides.map((_, i) => {
      const seg = document.createElement('button');
      seg.className = 'ss-seg';
      seg.type = 'button';
      seg.setAttribute('role', 'tab');
      seg.setAttribute('aria-label', `Go to slide ${i + 1}`);
      seg.innerHTML = '<i></i>';
      seg.addEventListener('click', () => go(i, true));
      rail?.appendChild(seg);
      return seg;
    });

    // clicking the centred card opens the lightbox (when there is one on the
    // page); clicking any other card brings it to the centre instead
    slides.forEach((slide, i) => {
      slide.addEventListener('click', () => {
        if (i !== idx) { go(i, true); return; }
        if (!openLightbox) return;
        const src = slide.querySelector('img')?.src;
        const match = galleryCards.find(c => c.querySelector('img')?.src === src);
        if (match) openLightbox(match);
      });
    });

    // Coverflow: every card's position is a function of its circular
    // distance from the active index, so re-running this after idx changes
    // moves the whole wheel at once — each card already has its own CSS
    // transition, so nothing needs the reflow/no-anim tricks a linear
    // slider would (there's no "off-stage" state to hide first).
    const VISIBLE = 3; // cards beyond this distance fade to fully invisible
    const layout = () => {
      const total = slides.length;
      slides.forEach((s, i) => {
        let off = i - idx;
        if (off > total / 2) off -= total;
        if (off < -total / 2) off += total;

        const dist = Math.abs(off);
        const dir = Math.sign(off);
        const reach = Math.min(dist, VISIBLE);

        const scale = (1 - reach * 0.15).toFixed(3);
        const tilt = dir * Math.min(dist, 2);            // rotation caps at ±2 slides out
        const opacity = dist === 0 ? 1 : Math.max(0, 1 - dist * 0.34).toFixed(2);
        const dim = Math.min(dist * 0.13, 0.5).toFixed(2);

        s.style.transform =
          `translate(-50%,-50%) translateX(calc(var(--ss-step) * ${off})) ` +
          `rotateY(calc(var(--ss-tilt) * ${-tilt})) scale(${scale})`;
        s.style.opacity = String(opacity);
        s.style.zIndex = String(100 - reach);
        s.style.filter = dist === 0 ? 'none' : `brightness(${1 - dim}) saturate(${1 - dim})`;
        s.style.pointerEvents = dist > VISIBLE ? 'none' : '';
        s.classList.toggle('is-active', off === 0);
        s.setAttribute('aria-hidden', String(off !== 0));
      });
    };

    // rail fill, caption and counter — everything except the cards themselves
    const updateChrome = () => {
      segs.forEach((seg, i) => {
        const fill = seg.querySelector('i');
        seg.classList.toggle('is-active', i === idx);
        seg.classList.toggle('is-done', i < idx);
        seg.setAttribute('aria-selected', String(i === idx));
        fill.classList.remove('is-running');
        if (i === idx) {
          void fill.offsetWidth;          // reflow so the fill animation restarts
          if (playing) fill.classList.add('is-running');
        }
      });

      const active = slides[idx];
      if (catEl)   catEl.textContent   = active.dataset.cat || '';
      if (titleEl) titleEl.textContent = active.dataset.title || '';
      if (idxEl)   idxEl.textContent   = pad(idx + 1);

      if (info) {                          // replay the caption entrance
        info.classList.remove('is-swap');
        void info.offsetWidth;
        info.classList.add('is-swap');
      }
    };

    function go(newIdxRaw, manual) {
      const total = slides.length;
      idx = ((newIdxRaw % total) + total) % total;
      layout();
      updateChrome();
      if (manual && playing) start();
    }

    const stop  = () => { if (timer) clearInterval(timer); timer = null; };
    const start = () => { stop(); if (playing) timer = setInterval(() => go(idx + 1), duration); };

    $('[data-ss-prev]', root)?.addEventListener('click', () => go(idx - 1, true));
    $('[data-ss-next]', root)?.addEventListener('click', () => go(idx + 1, true));

    playBtn?.addEventListener('click', () => {
      playing = !playing;
      playBtn.classList.toggle('is-paused', !playing);
      playBtn.setAttribute('aria-pressed', String(playing));
      playBtn.setAttribute('aria-label', playing ? 'Pause slideshow' : 'Play slideshow');
      if (playing) { start(); updateChrome(); }
      else { stop(); segs.forEach(s => s.querySelector('i').classList.remove('is-running')); }
    });

    ['mouseenter', 'focusin'].forEach(ev =>
      root.addEventListener(ev, () => root.classList.add('is-paused')));
    ['mouseleave', 'focusout'].forEach(ev =>
      root.addEventListener(ev, () => root.classList.remove('is-paused')));

    root.setAttribute('tabindex', '0');
    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  go(idx - 1, true);
      if (e.key === 'ArrowRight') go(idx + 1, true);
    });

    if (reduce) {
      playBtn?.classList.add('is-paused');
      playBtn?.setAttribute('aria-pressed', 'false');
      playBtn?.setAttribute('aria-label', 'Play slideshow');
    }

    // no resize listener needed: --ss-step is a clamp() driven by vw, so the
    // calc() expressions above re-resolve on their own as the viewport moves
    layout();
    updateChrome();
    start();
  };

  $$('[data-slideshow]').forEach(initSlideshow);

  /* =====================================================================
     Forms — validation + delivery
  ===================================================================== */
  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const phoneOk = v => v.trim().replace(/\D/g, '').length >= 7;

  const wireForm = ({ form, note, rules, onSend }) => {
    if (!form) return;

    const setError = (id, message) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.closest('.form-row')?.classList.toggle('has-error', !!message);
      const slot = form.querySelector(`.field-error[data-for="${id}"]`);
      if (slot) slot.textContent = message || '';
    };

    Object.keys(rules).forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      const evt = input.type === 'file' ? 'change' : 'blur';
      input.addEventListener(evt, () => {
        const result = rules[id](input.value);
        setError(id, result === true ? '' : result);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let bad = false;

      Object.keys(rules).forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const result = rules[id](input.value);
        if (result !== true) { setError(id, result); bad = true; }
        else setError(id, '');
      });

      if (bad) {
        note.classList.add('is-error');
        note.textContent = 'Please fix the highlighted fields.';
        form.querySelector('.has-error input, .has-error select, .has-error textarea')?.focus();
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      const label = button.querySelector('.btn-label');
      const original = label.textContent;
      label.textContent = 'Sending…';
      button.disabled = true;
      note.classList.remove('is-error');
      note.textContent = '';

      const succeed = (message) => {
        label.textContent = original;
        button.disabled = false;
        button.classList.add('is-success');
        setTimeout(() => button.classList.remove('is-success'), 1200);
        note.classList.remove('is-error');
        note.textContent = message;
        form.reset();
        if (fileDrop && fileDropLabel) {
          fileDrop.classList.remove('has-file');
          fileDropLabel.textContent = RESUME_PLACEHOLDER;
        }
      };
      const fail = (message) => {
        label.textContent = original;
        button.disabled = false;
        note.classList.add('is-error');
        note.textContent = message;
      };

      onSend(succeed, fail);
    });
  };

  /* Contact form */
  wireForm({
    form: $('#contactForm'),
    note: $('#formNote'),
    rules: {
      fName:    v => v.trim().length > 1 || 'Enter your name.',
      fCompany: v => v.trim().length > 1 || 'Enter a company or site name.',
      fEmail:   v => emailOk(v) || 'Enter a valid email address.',
      fPhone:   v => phoneOk(v) || 'Enter a valid phone number.',
      fAsset:   v => v.trim().length > 0 || 'Select an equipment type.',
      fMsg:     v => v.trim().length > 8 || 'Give a few more details on the situation.'
    },
    onSend: (succeed, fail) => {
      const form = $('#contactForm');
      if (isEmailJsConfigured()) {
        emailjs.sendForm(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.contactTemplateId, form)
          .then(() => succeed('Inquiry received — for urgent outages, call the 24/7 hotline directly.'))
          .catch(() => fail('Could not send. Please email us directly at ' + ADMIN_EMAILS.contact + '.'));
      } else {
        openMailtoFallback(ADMIN_EMAILS.contact, `Outage inquiry — ${$('#fName').value}`, [
          ['Name', $('#fName').value],
          ['Company / Site', $('#fCompany').value],
          ['Email', $('#fEmail').value],
          ['Phone', $('#fPhone').value],
          ['Asset / Equipment', $('#fAsset').value],
          ['Message', $('#fMsg').value]
        ]);
        succeed('Your email app should now be open with the inquiry pre-filled — just hit send.');
      }
    }
  });

  /* Application form */
  wireForm({
    form: $('#applyForm'),
    note: $('#applyFormNote'),
    rules: {
      aName:     v => v.trim().length > 1 || 'Enter your full name.',
      aEmail:    v => emailOk(v) || 'Enter a valid email address.',
      aPhone:    v => phoneOk(v) || 'Enter a valid phone number.',
      aBase:     v => v.trim().length > 0 || 'Select a preferred base.',
      aPosition: v => v.trim().length > 0 || 'Select a position.',
      aExp:      v => (v.trim().length > 0 && Number(v) >= 0) || 'Enter years of experience.',
      aResume:   () => (resumeInput?.files?.length > 0) || 'Attach your resume or CV.'
    },
    onSend: (succeed, fail) => {
      const form = $('#applyForm');
      if (isEmailJsConfigured()) {
        emailjs.sendForm(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.applyTemplateId, form)
          .then(() => succeed('Application received — our HR team will reach out if there\'s a fit.'))
          .catch(() => fail('Could not send. Please email us directly at ' + ADMIN_EMAILS.apply + '.'));
      } else {
        openMailtoFallback(ADMIN_EMAILS.apply, `Job application — ${$('#aPosition').value}`, [
          ['Name', $('#aName').value],
          ['Email', $('#aEmail').value],
          ['Phone', $('#aPhone').value],
          ['Preferred base', $('#aBase').value],
          ['Position', $('#aPosition').value],
          ['Years of experience', $('#aExp').value],
          ['Message', $('#aMsg').value]
        ]);
        succeed('Your email app should now be open with your application pre-filled — attach your resume and hit send. (Resumes can\'t travel through mailto links.)');
      }
    }
  });

})();
