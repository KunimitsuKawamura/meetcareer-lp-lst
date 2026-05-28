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

  // HubSpot embed: hide footer & sticky CTA when form is active
  const footer = document.querySelector('.footer');
  const rsv = document.querySelector('.sec-rsv');

  // Listen for HubSpot postMessage (sent when user interacts with calendar/form)
  window.addEventListener('message', (event) => {
    if (event.data && typeof event.data === 'string' && event.data.includes('meetings')) {
      if (footer) footer.style.display = 'none';
      if (stickyCta) stickyCta.style.display = 'none';
      if (rsv) rsv.style.paddingBottom = '0';
    }
  });

  // Also hide sticky CTA when reservation section is in viewport
  if (rsv && stickyCta) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          stickyCta.style.display = 'none';
        }
      });
    }, { threshold: 0.3 });
    observer.observe(rsv);
  }
});
