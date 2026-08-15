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
     Header state, scroll progress, back-to-top, parallax, timeline
  ===================================================================== */
  const header      = $('#siteHeader');
  const backToTop   = $('#backToTop');
  const progressBar = $('#scrollProgressBar');
  const timeline    = $('#timeline');
  const timelineFill= $('#timelineFill');
  const steps       = $$('.step');
  const parallaxEls = $$('[data-parallax]');
  const parallaxImgs= $$('[data-parallax-img]');

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

    if (!reduce) {
      parallaxEls.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const amount = parseFloat(el.dataset.parallax) || 14;
        const mid = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        el.style.transform = `translate3d(0, ${(-mid * amount).toFixed(2)}px, 0)`;
      });

      parallaxImgs.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        const mid = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        el.style.setProperty('--py', `${(-mid * 16).toFixed(2)}px`);
      });
    }

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
     Custom cursor (fine pointers only)
  ===================================================================== */
  if (fine && !reduce) {
    const dot  = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(dot, ring);

    let mx = 0, my = 0, rx = 0, ry = 0;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px)`;
      dot.classList.add('is-on');
      ring.classList.add('is-on');
    }, { passive: true });

    const loop = () => {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = `translate(${rx.toFixed(2)}px, ${ry.toFixed(2)}px)`;
      requestAnimationFrame(loop);
    };
    loop();

    document.addEventListener('mouseleave', () => {
      dot.classList.remove('is-on');
      ring.classList.remove('is-on');
    });

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
     Gallery — auto slideshow
  ===================================================================== */
  const slideshow = $('#slideshow');

  if (slideshow) {
    const slides = $$('.slide', slideshow);
    const dotsWrap = $('#slideshowDots');
    const bar = $('#slideshowProgressBar');
    const playBtn = $('#slideshowPlayPause');
    const DURATION = 5200;
    slideshow.style.setProperty('--ss-dur', (DURATION / 1000) + 's');

    let idx = Math.max(0, slides.findIndex(s => s.classList.contains('is-active')));
    let timer = null;
    let playing = !reduce;

    slides.forEach((slide, i) => {
      const dot = document.createElement('button');
      dot.className = 'ss-dot';
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
      dot.addEventListener('click', () => go(i, true));
      dotsWrap.appendChild(dot);

      slide.addEventListener('click', () => {
        if (!openLightbox) return;
        const src = slide.querySelector('img')?.src;
        const match = galleryCards.find(c => c.querySelector('img')?.src === src);
        if (match) openLightbox(match);
      });
    });
    const dots = Array.from(dotsWrap.children);

    const restartBar = () => {
      if (!bar) return;
      bar.classList.remove('is-running');
      void bar.offsetWidth;               // reflow so the CSS animation restarts
      if (playing) bar.classList.add('is-running');
    };

    const render = () => {
      slides.forEach((s, i) => s.classList.toggle('is-active', i === idx));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
      restartBar();
    };

    function go(i, manual) {
      idx = (i + slides.length) % slides.length;
      render();
      if (manual && playing) start();
    }

    const start = () => { stop(); if (playing) timer = setInterval(() => go(idx + 1), DURATION); };
    const stop  = () => { if (timer) clearInterval(timer); timer = null; };

    $('#slideshowPrev')?.addEventListener('click', () => go(idx - 1, true));
    $('#slideshowNext')?.addEventListener('click', () => go(idx + 1, true));

    playBtn?.addEventListener('click', () => {
      playing = !playing;
      playBtn.classList.toggle('is-paused', !playing);
      playBtn.setAttribute('aria-pressed', String(playing));
      playBtn.setAttribute('aria-label', playing ? 'Pause slideshow' : 'Play slideshow');
      if (playing) { start(); restartBar(); }
      else { stop(); bar?.classList.remove('is-running'); }
    });

    ['mouseenter', 'focusin'].forEach(ev =>
      slideshow.addEventListener(ev, () => slideshow.classList.add('is-paused')));
    ['mouseleave', 'focusout'].forEach(ev =>
      slideshow.addEventListener(ev, () => slideshow.classList.remove('is-paused')));

    slideshow.setAttribute('tabindex', '0');
    slideshow.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(idx - 1, true);
      if (e.key === 'ArrowRight') go(idx + 1, true);
    });

    if (reduce) {
      playBtn?.classList.add('is-paused');
      playBtn?.setAttribute('aria-pressed', 'false');
      playBtn?.setAttribute('aria-label', 'Play slideshow');
    }

    render();
    start();
  }

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
