/**
 * ミートキャリア 広告専用LP — JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Hamburger menu toggle (mobile)
  const hamburger = document.getElementById('hamburger');
  const modalMenu = document.getElementById('modal-menu');
  const modalClose = document.getElementById('modal-close');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const stickyCta = document.getElementById('sticky-cta');

  // Sticky CTA fade-in on scroll
  if (stickyCta) {
    const hero = document.querySelector('.hero');
    window.addEventListener('scroll', () => {
      if (!hero) return;
      const heroBottom = hero.getBoundingClientRect().bottom;
      if (heroBottom < 0) {
        stickyCta.classList.add('is-visible');
      } else {
        stickyCta.classList.remove('is-visible');
      }
    }, { passive: true });
  }

  function openMenu() {
    modalMenu.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    if (stickyCta) stickyCta.style.display = 'none';
  }

  function closeMenu() {
    modalMenu.classList.remove('is-open');
    document.body.style.overflow = '';
    if (stickyCta) stickyCta.style.display = '';
  }

  if (hamburger && modalMenu) {
    hamburger.addEventListener('click', openMenu);
  }
  if (modalClose) {
    modalClose.addEventListener('click', closeMenu);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeMenu);
  }

  // Touch guard for iframe on mobile
  const guard = document.getElementById('touch-guard');
  if (guard) {
    let startY = 0;
    let startTime = 0;
    let hideTimer = null;

    guard.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    guard.addEventListener('touchend', (e) => {
      const endY = e.changedTouches[0].clientY;
      const dt = Date.now() - startTime;
      const dy = Math.abs(endY - startY);

      if (dt < 300 && dy < 10) {
        guard.style.display = 'none';
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          guard.style.display = 'block';
        }, 4000);
      }
    }, { passive: true });

    window.addEventListener('scroll', () => {
      if (guard.style.display === 'none') {
        guard.style.display = 'block';
        clearTimeout(hideTimer);
      }
    }, { passive: true });
  }
});
