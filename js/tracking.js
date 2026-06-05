/**
 * ミートキャリア 広告専用LP — スクロール計測 + カレンダーファネル計測
 * 
 * GA4イベント:
 *   lp_section_view      — セクションが画面内に入った時（section パラメータ付き）
 *   lp_scroll            — スクロール深度 25/50/75/100% 通過時（depth パラメータ付き）
 *   lp_reservation_view  — 予約セクション到達（最重要CV指標）
 *   lp_cal_date_select   — カレンダー日付選択
 *   lp_cal_time_select   — カレンダー時間帯選択
 *   lp_cal_form_start    — フォーム入力開始
 *   lp_cal_booking_complete — 予約完了
 *   lp_sticky_cta_click  — 追従CTA（3分ワーク）クリック
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

  // === 自前カレンダーファネル計測 ===
  window.addEventListener('cal:date_select', function (e) {
    sendEvent('lp_cal_date_select', { date: e.detail.date });
    if (typeof clarity === 'function') clarity('set', 'cal_step', 'date_select');
  });
  window.addEventListener('cal:time_select', function (e) {
    sendEvent('lp_cal_time_select', { time: e.detail.time });
    if (typeof clarity === 'function') clarity('set', 'cal_step', 'time_select');
  });
  window.addEventListener('cal:form_start', function () {
    sendEvent('lp_cal_form_start');
    if (typeof clarity === 'function') clarity('set', 'cal_step', 'form_start');
  });
  window.addEventListener('cal:booking_complete', function () {
    sendEvent('lp_cal_booking_complete');
    if (typeof clarity === 'function') clarity('set', 'cal_step', 'booking_complete');
  });

  // === 追従CTA（予約セクションへ）クリック計測 ===
  const stickyCta = document.querySelector('.sticky-cta__link');
  if (stickyCta) {
    stickyCta.addEventListener('click', () => {
      sendEvent('lp_sticky_cta_click', {
        destination: 'reservation',
        sections_viewed: viewedSections.size,
        reached_reservation: viewedSections.has('reservation') ? 'yes' : 'no'
      });
    });
  }

  // === Hero CTAクリック計測 ===
  const heroCta = document.querySelector('.hero__cta');
  if (heroCta) {
    heroCta.addEventListener('click', () => {
      sendEvent('lp_hero_cta_click');
    });
  }

  // === CTA+VIDEO セクション CTAクリック計測 ===
  const videoCta = document.querySelector('.sec-cta__btn');
  if (videoCta) {
    videoCta.addEventListener('click', () => {
      sendEvent('lp_video_cta_click', {
        sections_viewed: viewedSections.size
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

