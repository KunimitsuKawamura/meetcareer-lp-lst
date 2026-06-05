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
        // モバイルメニューが開いていたら閉じてからスクロール
        const modal = document.getElementById('modal-menu');
        if (modal && modal.classList.contains('is-open')) {
          modal.classList.remove('is-open');
          document.body.style.overflow = '';
          const sticky = document.getElementById('sticky-cta');
          if (sticky) sticky.style.display = '';
        }
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

  // モバイルメニュー内のアンカーリンク → メニューを閉じてからスクロール
  document.querySelectorAll('.modal-menu__cta[href^="#"], .modal-menu__link[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      closeMenu();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    });
  });
});
