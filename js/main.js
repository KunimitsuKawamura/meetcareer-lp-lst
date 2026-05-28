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

  // HubSpot fullscreen mode: detect iframe click (date selection)
  let hubspotActive = false;

  function enterHubSpotMode() {
    if (hubspotActive) return;
    hubspotActive = true;
    document.body.classList.add('hubspot-active');
    // Scroll to reservation section
    const rsv = document.querySelector('.sec-rsv');
    if (rsv) {
      rsv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Detect click inside HubSpot iframe via window blur
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active.tagName === 'IFRAME' &&
          active.closest('.meetings-iframe-container')) {
        enterHubSpotMode();
      }
    }, 0);
  });
});
