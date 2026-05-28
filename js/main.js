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

  // Hide footer & sticky CTA when reservation section is visible
  const footer = document.querySelector('.footer');
  const rsv = document.querySelector('.sec-rsv');

  if (rsv) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (footer) footer.style.display = 'none';
          if (stickyCta) stickyCta.style.display = 'none';
        } else {
          if (footer) footer.style.display = '';
          if (stickyCta) stickyCta.style.display = '';
        }
      });
    }, { threshold: 0.1 });
    observer.observe(rsv);
  }
});
