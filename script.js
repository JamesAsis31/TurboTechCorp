(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------------------------------------------------------------------
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
  --------------------------------------------------------------------- */
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
    const url = `mailto:${toAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  /* ---------------------------------------------------------------------
     Theme toggle (dark / light) — persisted via localStorage
  --------------------------------------------------------------------- */
  const themeToggle = document.getElementById('themeToggle');
  const root = document.documentElement;

  const syncToggleState = () => {
    const isLight = root.getAttribute('data-theme') === 'light';
    if (themeToggle) themeToggle.setAttribute('aria-pressed', String(isLight));
  };
  syncToggleState(); // reflect the theme the inline head-script already applied

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('turbotech-theme', next); } catch (e) { /* storage unavailable */ }
      syncToggleState();
    });
  }

  /* ---------------------------------------------------------------------
     Footer year
  --------------------------------------------------------------------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------------------
     Sticky header shrink-on-scroll
  --------------------------------------------------------------------- */
  const header = document.getElementById('siteHeader');
  const backToTop = document.getElementById('backToTop');

  const onScroll = () => {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 24);
    backToTop.classList.toggle('is-visible', y > 700);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  /* ---------------------------------------------------------------------
     Mobile nav toggle
  --------------------------------------------------------------------- */
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  const navBackdrop = document.getElementById('navBackdrop');
  const mainNavClose = document.getElementById('mainNavClose');

  const closeNav = () => {
    mainNav.classList.remove('is-open');
    navBackdrop?.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };
  const openNav = () => {
    mainNav.classList.add('is-open');
    navBackdrop?.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };

  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.contains('is-open');
    isOpen ? closeNav() : openNav();
  });

  mainNavClose?.addEventListener('click', closeNav);
  navBackdrop?.addEventListener('click', closeNav);

  mainNav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', closeNav);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 760) closeNav();
  });

  /* ---------------------------------------------------------------------
     Scroll reveal (IntersectionObserver)
  --------------------------------------------------------------------- */
  const revealEls = document.querySelectorAll('.reveal');

  if (prefersReducedMotion) {
    revealEls.forEach(el => el.classList.add('is-visible'));
  } else if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const delay = Math.min(Array.from(el.parentElement?.children || []).indexOf(el) * 60, 240);
          setTimeout(() => el.classList.add('is-visible'), delay);
          revealObserver.unobserve(el);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(el => revealObserver.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---------------------------------------------------------------------
     HUD counters — animate numeric values into view
  --------------------------------------------------------------------- */
  const hudValues = document.querySelectorAll('.hud-value[data-count]');

  const animateCount = (el) => {
    const target = parseInt(el.getAttribute('data-count'), 10);
    const suffix = el.getAttribute('data-suffix') || '';
    if (isNaN(target)) return;

    if (prefersReducedMotion) {
      el.textContent = target + suffix;
      return;
    }

    const duration = 900;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(target * eased);
      el.textContent = value + suffix;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  if ('IntersectionObserver' in window) {
    const hudObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          hudObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    hudValues.forEach(el => hudObserver.observe(el));
  } else {
    hudValues.forEach(animateCount);
  }

  /* ---------------------------------------------------------------------
     Active nav link on scroll
  --------------------------------------------------------------------- */
  const sections = ['services', 'process', 'locations', 'contact']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  const navLinks = document.querySelectorAll('.nav-link');

  if ('IntersectionObserver' in window && sections.length) {
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const id = entry.target.id;
        const link = document.querySelector(`.nav-link[href="#${id}"]`);
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(l => l.style.color = '');
          link.style.color = 'var(--text)';
        }
      });
    }, { rootMargin: '-40% 0px -50% 0px' });

    sections.forEach(sec => navObserver.observe(sec));
  }

  /* ---------------------------------------------------------------------
     Scroll progress bar
  --------------------------------------------------------------------- */
  const scrollProgressBar = document.getElementById('scrollProgressBar');
  if (scrollProgressBar) {
    const updateScrollProgress = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const pct = max > 0 ? (doc.scrollTop / max) * 100 : 0;
      scrollProgressBar.style.width = pct + '%';
    };
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress);
    updateScrollProgress();
  }

  /* ---------------------------------------------------------------------
     Cursor spotlight glow (desktop pointer only)
  --------------------------------------------------------------------- */
  if (supportsHover && !prefersReducedMotion) {
    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);

    let glowRaf = null, mouseX = 0, mouseY = 0;
    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
      glow.classList.add('is-active');
      if (glowRaf) return;
      glowRaf = requestAnimationFrame(() => {
        glow.style.setProperty('--x', mouseX + 'px');
        glow.style.setProperty('--y', mouseY + 'px');
        glowRaf = null;
      });
    }, { passive: true });
    document.addEventListener('mouseleave', () => glow.classList.remove('is-active'));
  }

  /* ---------------------------------------------------------------------
     Tilt / glare hover on cards
  --------------------------------------------------------------------- */
  if (supportsHover && !prefersReducedMotion) {
    const tiltEls = document.querySelectorAll('.service-card, .job-card, .location-card, .why-card');
    tiltEls.forEach(el => {
      el.classList.add('tilt-card');
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', ((0.5 - py) * 5) + 'deg');
        el.style.setProperty('--ry', ((px - 0.5) * 7) + 'deg');
        el.style.setProperty('--mx', (px * 100) + '%');
        el.style.setProperty('--my', (py * 100) + '%');
      });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  /* ---------------------------------------------------------------------
     Button / chip ripple on click
  --------------------------------------------------------------------- */
  if (!prefersReducedMotion) {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('.btn, .filter-chip');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.7;
      const ripple = document.createElement('span');
      ripple.className = 'btn-ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      target.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  }

  /* ---------------------------------------------------------------------
     Hero rig — mouse parallax
  --------------------------------------------------------------------- */
  const heroRig = document.querySelector('.hero-rig');
  const heroSection = document.querySelector('.hero');
  if (heroRig && heroSection && supportsHover && !prefersReducedMotion) {
    heroSection.addEventListener('mousemove', (e) => {
      const r = heroSection.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      heroRig.style.transform = `translate3d(${px * 16}px, ${py * 16}px, 0)`;
    });
    heroSection.addEventListener('mouseleave', () => { heroRig.style.transform = ''; });
  }

  /* ---------------------------------------------------------------------
     Careers — department filter
  --------------------------------------------------------------------- */
  const filterChips = document.querySelectorAll('.filter-chip');
  const jobCards = document.querySelectorAll('.job-card');
  const noResults = document.getElementById('noResults');

  if (filterChips.length && jobCards.length) {
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');

        const filter = chip.getAttribute('data-filter');
        let visibleCount = 0;

        jobCards.forEach(card => {
          const match = filter === 'all' || card.getAttribute('data-dept') === filter;
          card.classList.toggle('is-hidden', !match);
          if (match) visibleCount++;
        });

        if (noResults) noResults.hidden = visibleCount !== 0;
      });
    });
  }

  /* ---------------------------------------------------------------------
     Careers — "Apply" button prefills and scrolls to application form
  --------------------------------------------------------------------- */
  const applyButtons = document.querySelectorAll('.job-apply-btn');
  const positionSelect = document.getElementById('aPosition');

  if (applyButtons.length && positionSelect) {
    applyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const position = btn.getAttribute('data-position');
        const optionExists = Array.from(positionSelect.options).some(o => o.value === position || o.textContent === position);
        if (optionExists) positionSelect.value = position;

        const target = document.getElementById('apply');
        if (target) {
          target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
        }
        document.getElementById('aName')?.focus({ preventScroll: true });
      });
    });
  }

  /* ---------------------------------------------------------------------
     Careers — resume file input feedback
  --------------------------------------------------------------------- */
  const resumeInput = document.getElementById('aResume');
  const fileDrop = document.getElementById('fileDrop');
  const fileDropLabel = document.getElementById('fileDropLabel');

  if (resumeInput && fileDrop && fileDropLabel) {
    resumeInput.addEventListener('change', () => {
      const file = resumeInput.files && resumeInput.files[0];
      if (file) {
        fileDropLabel.textContent = file.name;
        fileDrop.classList.add('has-file');
      } else {
        fileDropLabel.textContent = 'Choose file — PDF or Word, up to 10MB';
        fileDrop.classList.remove('has-file');
      }
    });
  }

  /* ---------------------------------------------------------------------
     Careers — application form validation + simulated submit
  --------------------------------------------------------------------- */
  const applyForm = document.getElementById('applyForm');
  const applyFormNote = document.getElementById('applyFormNote');

  if (applyForm) {
    const applyValidators = {
      aName: v => v.trim().length > 1 || 'Enter your full name.',
      aEmail: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Enter a valid email address.',
      aPhone: v => v.trim().replace(/[^\d]/g, '').length >= 7 || 'Enter a valid phone number.',
      aBase: v => v.trim().length > 0 || 'Select a preferred base.',
      aPosition: v => v.trim().length > 0 || 'Select a position.',
      aExp: v => v.trim().length > 0 && Number(v) >= 0 || 'Enter years of experience.',
      aResume: () => (resumeInput && resumeInput.files && resumeInput.files.length > 0) || 'Attach your resume or CV.'
    };

    const setApplyFieldError = (id, message) => {
      const input = document.getElementById(id);
      const row = input.closest('.form-row');
      const errorEl = applyForm.querySelector(`.field-error[data-for="${id}"]`);
      if (message) {
        row.classList.add('has-error');
        if (errorEl) errorEl.textContent = message;
      } else {
        row.classList.remove('has-error');
        if (errorEl) errorEl.textContent = '';
      }
    };

    Object.keys(applyValidators).forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener(id === 'aResume' ? 'change' : 'blur', () => {
        const result = applyValidators[id](input.value);
        setApplyFieldError(id, result === true ? '' : result);
      });
    });

    applyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let hasError = false;

      Object.keys(applyValidators).forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        const result = applyValidators[id](input.value);
        if (result !== true) {
          setApplyFieldError(id, result);
          hasError = true;
        } else {
          setApplyFieldError(id, '');
        }
      });

      if (hasError) {
        applyFormNote.textContent = 'Please fix the highlighted fields.';
        applyFormNote.classList.add('is-error');
        return;
      }

      applyFormNote.classList.remove('is-error');
      const submitBtnWrap = applyForm.querySelector('button[type="submit"]');
      const submitBtn = submitBtnWrap.querySelector('.btn-label');
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Submitting…';
      submitBtnWrap.disabled = true;

      const finishSuccess = (message) => {
        submitBtn.textContent = originalLabel;
        submitBtnWrap.disabled = false;
        submitBtnWrap.classList.add('is-success');
        setTimeout(() => submitBtnWrap.classList.remove('is-success'), 1000);
        applyFormNote.classList.remove('is-error');
        applyFormNote.textContent = message;
        applyForm.reset();
        if (fileDrop && fileDropLabel) {
          fileDrop.classList.remove('has-file');
          fileDropLabel.textContent = 'Choose file — PDF or Word, up to 10MB';
        }
      };

      const finishError = (message) => {
        submitBtn.textContent = originalLabel;
        submitBtnWrap.disabled = false;
        applyFormNote.classList.add('is-error');
        applyFormNote.textContent = message;
      };

      if (isEmailJsConfigured()) {
        emailjs.sendForm(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.applyTemplateId, applyForm)
          .then(() => finishSuccess('Application received — our HR team will reach out if there\'s a fit.'))
          .catch(() => finishError('Something went wrong sending your application. Please email us directly at ' + ADMIN_EMAILS.apply + '.'));
      } else {
        openMailtoFallback(ADMIN_EMAILS.apply, `Job application — ${document.getElementById('aPosition').value}`, [
          ['Name', document.getElementById('aName').value],
          ['Email', document.getElementById('aEmail').value],
          ['Phone', document.getElementById('aPhone').value],
          ['Preferred base', document.getElementById('aBase').value],
          ['Position', document.getElementById('aPosition').value],
          ['Years of experience', document.getElementById('aExp').value],
          ['Message', document.getElementById('aMsg').value]
        ]);
        finishSuccess('Your email app should now be open with your application pre-filled — attach your resume and hit send. (Resumes can\'t travel through mailto links.)');
      }
    });
  }

  /* ---------------------------------------------------------------------
     Gallery — category filter
  --------------------------------------------------------------------- */
  const galleryGrid = document.getElementById('galleryGrid');
  const galleryCards = document.querySelectorAll('.gallery-card');
  const galleryFilterChips = galleryGrid
    ? document.querySelectorAll('.filter-bar .filter-chip')
    : [];
  const galleryNoResults = document.getElementById('galleryNoResults');

  if (galleryGrid && galleryCards.length) {
    galleryFilterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        galleryFilterChips.forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');

        const filter = chip.getAttribute('data-filter');
        let visibleCount = 0;

        galleryCards.forEach(card => {
          const match = filter === 'all' || card.getAttribute('data-cat') === filter;
          card.classList.toggle('is-hidden', !match);
          if (match) visibleCount++;
        });

        if (galleryNoResults) galleryNoResults.hidden = visibleCount !== 0;
      });
    });
  }

  /* ---------------------------------------------------------------------
     Gallery — lightbox viewer
  --------------------------------------------------------------------- */
  const lightbox = document.getElementById('lightbox');

  if (lightbox && galleryCards.length) {
    const lightboxImg = document.getElementById('lightboxImg');
    const lightboxCat = document.getElementById('lightboxCat');
    const lightboxTitle = document.getElementById('lightboxTitle');
    const lightboxClose = document.getElementById('lightboxClose');
    const lightboxPrev = document.getElementById('lightboxPrev');
    const lightboxNext = document.getElementById('lightboxNext');

    let currentIndex = 0;
    let lastFocused = null;

    const visibleCards = () => Array.from(galleryCards).filter(c => !c.classList.contains('is-hidden'));

    const renderSlide = (index) => {
      const cards = visibleCards();
      if (!cards.length) return;
      currentIndex = (index + cards.length) % cards.length;
      const card = cards[currentIndex];
      const img = card.querySelector('img');
      const cat = card.querySelector('.gallery-cat');
      const title = card.querySelector('.gallery-title');

      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
      lightboxCat.textContent = cat ? cat.textContent : '';
      lightboxTitle.textContent = title ? title.textContent : '';
    };

    const openLightbox = (card) => {
      const cards = visibleCards();
      const index = cards.indexOf(card);
      lastFocused = document.activeElement;
      renderSlide(index === -1 ? 0 : index);
      lightbox.hidden = false;
      document.body.style.overflow = 'hidden';
      lightboxClose.focus();
    };

    const closeLightbox = () => {
      lightbox.hidden = true;
      document.body.style.overflow = '';
      if (lastFocused) lastFocused.focus();
    };

    galleryCards.forEach(card => {
      card.addEventListener('click', () => openLightbox(card));
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openLightbox(card);
        }
      });
    });

    lightboxClose.addEventListener('click', closeLightbox);
    lightboxPrev.addEventListener('click', () => renderSlide(currentIndex - 1));
    lightboxNext.addEventListener('click', () => renderSlide(currentIndex + 1));

    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') renderSlide(currentIndex - 1);
      if (e.key === 'ArrowRight') renderSlide(currentIndex + 1);
    });

    /* ---------------------------------------------------------------------
       Gallery — auto-playing featured slideshow
    --------------------------------------------------------------------- */
    const slideshow = document.getElementById('slideshow');
    if (slideshow) {
      const slides = Array.from(slideshow.querySelectorAll('.slide'));
      const dotsWrap = document.getElementById('slideshowDots');
      const progressBar = document.getElementById('slideshowProgressBar');
      const playPauseBtn = document.getElementById('slideshowPlayPause');
      const prevBtn = document.getElementById('slideshowPrev');
      const nextBtn = document.getElementById('slideshowNext');
      const SLIDE_DURATION = 5000;
      slideshow.style.setProperty('--slide-duration', (SLIDE_DURATION / 1000) + 's');

      let ssIndex = slides.findIndex(s => s.classList.contains('is-active'));
      if (ssIndex < 0) ssIndex = 0;
      let ssTimer = null;
      let isPlaying = !prefersReducedMotion;

      slides.forEach((slide, i) => {
        const dot = document.createElement('button');
        dot.className = 'slideshow-dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dot.addEventListener('click', () => goToSlide(i, true));
        dotsWrap.appendChild(dot);

        slide.addEventListener('click', () => {
          const img = slide.querySelector('img');
          const matchingCard = Array.from(galleryCards).find(c => c.querySelector('img').src === img.src);
          if (matchingCard) openLightbox(matchingCard);
        });
      });
      const dots = Array.from(dotsWrap.children);

      const restartProgress = () => {
        progressBar.classList.remove('is-running');
        void progressBar.offsetWidth; // reflow to restart CSS animation
        if (isPlaying) progressBar.classList.add('is-running');
      };

      const render = () => {
        slides.forEach((s, i) => s.classList.toggle('is-active', i === ssIndex));
        dots.forEach((d, i) => d.classList.toggle('is-active', i === ssIndex));
        restartProgress();
      };

      const goToSlide = (index, manual) => {
        ssIndex = (index + slides.length) % slides.length;
        render();
        if (manual) restartAutoplay();
      };

      const advance = () => goToSlide(ssIndex + 1);

      const startAutoplay = () => {
        stopAutoplay();
        if (!isPlaying) return;
        ssTimer = setInterval(advance, SLIDE_DURATION);
      };
      const stopAutoplay = () => {
        if (ssTimer) clearInterval(ssTimer);
        ssTimer = null;
      };
      const restartAutoplay = () => { startAutoplay(); };

      prevBtn.addEventListener('click', () => goToSlide(ssIndex - 1, true));
      nextBtn.addEventListener('click', () => goToSlide(ssIndex + 1, true));

      playPauseBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playPauseBtn.classList.toggle('is-paused', !isPlaying);
        playPauseBtn.setAttribute('aria-pressed', String(isPlaying));
        playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause slideshow' : 'Play slideshow');
        if (isPlaying) { startAutoplay(); restartProgress(); }
        else { stopAutoplay(); progressBar.classList.remove('is-running'); }
      });

      slideshow.addEventListener('mouseenter', () => slideshow.classList.add('is-paused'));
      slideshow.addEventListener('mouseleave', () => slideshow.classList.remove('is-paused'));
      slideshow.addEventListener('focusin', () => slideshow.classList.add('is-paused'));
      slideshow.addEventListener('focusout', () => slideshow.classList.remove('is-paused'));

      slideshow.setAttribute('tabindex', '0');
      slideshow.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') goToSlide(ssIndex - 1, true);
        if (e.key === 'ArrowRight') goToSlide(ssIndex + 1, true);
      });

      if (prefersReducedMotion) {
        playPauseBtn.classList.add('is-paused');
        playPauseBtn.setAttribute('aria-pressed', 'false');
        playPauseBtn.setAttribute('aria-label', 'Play slideshow');
      }

      render();
      startAutoplay();
    }
  }

  /* ---------------------------------------------------------------------
     Contact form — client-side validation + simulated submit
  --------------------------------------------------------------------- */
  const form = document.getElementById('contactForm');
  const formNote = document.getElementById('formNote');

  const validators = {
    fName: v => v.trim().length > 1 || 'Enter your name.',
    fCompany: v => v.trim().length > 1 || 'Enter a company or site name.',
    fEmail: v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || 'Enter a valid email address.',
    fPhone: v => v.trim().replace(/[^\d]/g, '').length >= 7 || 'Enter a valid phone number.',
    fAsset: v => v.trim().length > 0 || 'Select an equipment type.',
    fMsg: v => v.trim().length > 8 || 'Give a few more details on the situation.'
  };

  const setFieldError = (id, message) => {
    const input = document.getElementById(id);
    const row = input.closest('.form-row');
    const errorEl = form.querySelector(`.field-error[data-for="${id}"]`);
    if (message) {
      row.classList.add('has-error');
      errorEl.textContent = message;
    } else {
      row.classList.remove('has-error');
      errorEl.textContent = '';
    }
  };

  if (form) {
    Object.keys(validators).forEach(id => {
      const input = document.getElementById(id);
      input.addEventListener('blur', () => {
        const result = validators[id](input.value);
        setFieldError(id, result === true ? '' : result);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let hasError = false;

      Object.keys(validators).forEach(id => {
        const input = document.getElementById(id);
        const result = validators[id](input.value);
        if (result !== true) {
          setFieldError(id, result);
          hasError = true;
        } else {
          setFieldError(id, '');
        }
      });

      if (hasError) {
        formNote.textContent = 'Please fix the highlighted fields.';
        formNote.classList.add('is-error');
        return;
      }

      formNote.classList.remove('is-error');
      const submitBtnWrap = form.querySelector('button[type="submit"]');
      const submitBtn = submitBtnWrap.querySelector('.btn-label');
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';
      submitBtnWrap.disabled = true;

      const finishSuccess = (message) => {
        submitBtn.textContent = originalLabel;
        submitBtnWrap.disabled = false;
        submitBtnWrap.classList.add('is-success');
        setTimeout(() => submitBtnWrap.classList.remove('is-success'), 1000);
        formNote.classList.remove('is-error');
        formNote.textContent = message;
        form.reset();
      };

      const finishError = (message) => {
        submitBtn.textContent = originalLabel;
        submitBtnWrap.disabled = false;
        formNote.classList.add('is-error');
        formNote.textContent = message;
      };

      if (isEmailJsConfigured()) {
        emailjs.sendForm(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.contactTemplateId, form)
          .then(() => finishSuccess('Inquiry received — for urgent outages, call the 24/7 hotline directly.'))
          .catch(() => finishError('Something went wrong sending your inquiry. Please email us directly at ' + ADMIN_EMAILS.contact + '.'));
      } else {
        openMailtoFallback(ADMIN_EMAILS.contact, `Outage inquiry — ${document.getElementById('fName').value}`, [
          ['Name', document.getElementById('fName').value],
          ['Company / Site', document.getElementById('fCompany').value],
          ['Email', document.getElementById('fEmail').value],
          ['Phone', document.getElementById('fPhone').value],
          ['Asset / Equipment', document.getElementById('fAsset').value],
          ['Message', document.getElementById('fMsg').value]
        ]);
        finishSuccess('Your email app should now be open with your inquiry pre-filled — just hit send.');
      }
    });
  }
})();