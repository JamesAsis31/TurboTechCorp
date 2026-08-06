(() => {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  const closeNav = () => {
    mainNav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };
  const openNav = () => {
    mainNav.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };

  navToggle.addEventListener('click', () => {
    const isOpen = mainNav.classList.contains('is-open');
    isOpen ? closeNav() : openNav();
  });

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
      const submitBtn = applyForm.querySelector('button[type="submit"] .btn-label');
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Submitting…';

      setTimeout(() => {
        submitBtn.textContent = originalLabel;
        applyFormNote.textContent = 'Application received — our HR team will reach out if there\'s a fit.';
        applyForm.reset();
        if (fileDrop && fileDropLabel) {
          fileDrop.classList.remove('has-file');
          fileDropLabel.textContent = 'Choose file — PDF or Word, up to 10MB';
        }
      }, 900);
    });
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
      const submitBtn = form.querySelector('button[type="submit"] .btn-label');
      const originalLabel = submitBtn.textContent;
      submitBtn.textContent = 'Sending…';

      setTimeout(() => {
        submitBtn.textContent = originalLabel;
        formNote.textContent = 'Inquiry received — for urgent outages, call the 24/7 hotline directly.';
        form.reset();
      }, 900);
    });
  }
})();