/**
 * ミートキャリア 広告専用LP — スクロール計測
 * 
 * GA4イベント:
 *   lp_section_view  — セクションが画面内に入った時（section パラメータ付き）
 *   lp_scroll         — スクロール深度 25/50/75/100% 通過時（depth パラメータ付き）
 *   lp_reservation_view — 予約セクション到達（最重要CV指標）
 *   lp_hubspot_click  — HubSpotカレンダー内クリック検出
 *   lp_sticky_cta_click — 追従CTA（3分ワーク）クリック
 */

(function () {
  'use strict';

  // GA4 イベント送信
  function sendEvent(eventName, params) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params || {});
    }
  }

  // === セクション表示計測（IntersectionObserver） ===
  const sections = [
    { id: 'hero', selector: '.hero' },
    { id: 'flow', selector: '#flow' },
    { id: 'media', selector: '#media' },
    { id: 'voice', selector: '#voice' },
    { id: 'cta', selector: '#cta' },
    { id: 'reservation', selector: '#reservation' }
  ];

  const viewedSections = new Set();

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const sectionId = entry.target.dataset.trackSection;
      if (!sectionId || viewedSections.has(sectionId)) return;

      viewedSections.add(sectionId);
      sendEvent('lp_section_view', { section: sectionId });

      // 予約セクション到達は別イベントでも送信（最重要）
      if (sectionId === 'reservation') {
        sendEvent('lp_reservation_view', {
          sections_viewed: viewedSections.size,
          path: Array.from(viewedSections).join(' > ')
        });
      }
    });
  }, {
    threshold: 0.3 // 30%が画面内に入ったら発火
  });

  // セクションにdata属性を付与して監視開始
  sections.forEach(({ id, selector }) => {
    const el = document.querySelector(selector);
    if (el) {
      el.dataset.trackSection = id;
      sectionObserver.observe(el);
    }
  });

  // === スクロール深度計測 ===
  const firedDepths = new Set();
  const depthThresholds = [25, 50, 75, 100];

  function getScrollPercent() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return 100;
    return Math.round((scrollTop / docHeight) * 100);
  }

  let scrollTicking = false;

  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;

    requestAnimationFrame(() => {
      const percent = getScrollPercent();

      depthThresholds.forEach((threshold) => {
        if (percent >= threshold && !firedDepths.has(threshold)) {
          firedDepths.add(threshold);
          sendEvent('lp_scroll', { depth: String(threshold) });
        }
      });

      scrollTicking = false;
    });
  }, { passive: true });

  // === HubSpotカレンダークリック検出 ===
  window.addEventListener('blur', () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active.tagName === 'IFRAME' &&
          active.closest('.meetings-iframe-container')) {
        sendEvent('lp_hubspot_click');
      }
    }, 0);
  });

  // === 追従CTA（3分ワーク）クリック計測 ===
  const stickyCta = document.querySelector('.sticky-cta__link');
  if (stickyCta) {
    stickyCta.addEventListener('click', () => {
      sendEvent('lp_sticky_cta_click', {
        sections_viewed: viewedSections.size,
        reached_reservation: viewedSections.has('reservation') ? 'yes' : 'no'
      });
    });
  }

  // === ヘッダーCTAクリック計測 ===
  document.querySelectorAll('.header__cta, .modal-menu__cta').forEach((cta) => {
    cta.addEventListener('click', () => {
      const dest = cta.href.includes('work.meetcareer.net') ? '3min_work' : 'counseling';
      sendEvent('lp_header_cta_click', {
        destination: dest,
        sections_viewed: viewedSections.size
      });
    });
  });
})();
