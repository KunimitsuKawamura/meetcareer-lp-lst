/**
 * ミートキャリア 広告専用LP — マイクロサーベイ
 *
 * 予約セクションを見たがカレンダー操作せず離脱しようとしたユーザーに
 * 1回だけ表示する非侵襲的な1問アンケート。
 *
 * 表示条件:
 *   1. 1ユーザーにつき1回限り（localStorage）
 *   2. 予約セクションを見た（IntersectionObserver）
 *   3. カレンダー操作なし（cal:date_select 未発火）
 *   4. 予約セクションから上にスクロールして離れた
 *   5. 予約セクション表示後5秒以上経過
 *
 * GA4イベント:
 *   lp_survey_response — 回答（reason パラメータ付き）
 *   lp_survey_dismiss  — ✕で閉じた
 *   lp_survey_timeout  — 15秒で自動消滅
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'lp_survey_shown';
  var AUTO_DISMISS_MS = 15000;
  var MIN_VIEW_TIME_MS = 5000;

  // --- テスト用: ?survey=test でlocalStorageリセット ---
  var isTestMode = location.search.indexOf('survey=test') !== -1;
  if (isTestMode) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  // --- 既に表示済みなら何もしない ---
  try {
    if (!isTestMode && localStorage.getItem(STORAGE_KEY)) return;
  } catch (_) {
    return; // localStorage 使用不可（プライベートブラウズ等）
  }

  var reservationViewed = false;
  var reservationViewedAt = 0;
  var calendarInteracted = false;
  var surveyShown = false;

  // カレンダー操作を検知 → サーベイ抑制
  window.addEventListener('cal:date_select', function () {
    calendarInteracted = true;
  });
  window.addEventListener('cal:booking_complete', function () {
    calendarInteracted = true;
  });

  // --- 予約セクション監視 ---
  var section = document.getElementById('reservation');
  if (!section) return;

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        // 予約セクションに到達
        if (!reservationViewed) {
          reservationViewed = true;
          reservationViewedAt = Date.now();
        }
      } else if (reservationViewed && !calendarInteracted && !surveyShown) {
        // 予約セクションがビューポートから出た
        var elapsed = Date.now() - reservationViewedAt;
        if (elapsed < MIN_VIEW_TIME_MS) return;

        // セクションがビューポートの下に出た = ユーザーが上にスクロールした
        if (entry.boundingClientRect.top > 0) {
          showSurvey();
        }
      }
    });
  }, { threshold: 0.3 });

  observer.observe(section);

  // --- サーベイ表示 ---
  function showSurvey() {
    if (surveyShown) return;
    surveyShown = true;

    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (_) { /* ignore */ }

    var survey = document.createElement('div');
    survey.className = 'lp-survey';
    survey.id = 'lp-survey';
    survey.setAttribute('role', 'dialog');
    survey.setAttribute('aria-label', 'アンケート');

    survey.innerHTML =
      '<button class="lp-survey__close" aria-label="閉じる">✕</button>' +
      '<p class="lp-survey__question">今日ご予約されなかった理由を教えてください</p>' +
      '<div class="lp-survey__options">' +
        '<button class="lp-survey__option" data-value="gathering_info">まだ情報を集めている段階</button>' +
        '<button class="lp-survey__option" data-value="not_ready">相談したい内容がまとまっていない</button>' +
        '<button class="lp-survey__option" data-value="no_slot">都合の良い日時がない</button>' +
        '<button class="lp-survey__option" data-value="thinking">もう少し考えたい</button>' +
      '</div>';

    document.body.appendChild(survey);

    // sticky CTA を一時非表示
    var stickyCta = document.querySelector('.sticky-cta');
    if (stickyCta) stickyCta.style.display = 'none';

    // アニメーション開始
    requestAnimationFrame(function () {
      survey.classList.add('lp-survey--visible');
    });

    // ✕ ボタン
    survey.querySelector('.lp-survey__close').addEventListener('click', function () {
      dismiss(survey, stickyCta);
      sendGA4('lp_survey_dismiss');
    });

    // 選択肢
    survey.querySelectorAll('.lp-survey__option').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sendGA4('lp_survey_response', { reason: btn.dataset.value });
        showThanks(survey, stickyCta);
      });
    });

    // 15秒で自動消滅
    var timer = setTimeout(function () {
      if (document.getElementById('lp-survey')) {
        dismiss(survey, stickyCta);
        sendGA4('lp_survey_timeout');
      }
    }, AUTO_DISMISS_MS);

    // 手動で消えた場合にタイマーをクリア
    survey.addEventListener('lp-survey-removed', function () {
      clearTimeout(timer);
    });
  }

  function showThanks(survey, stickyCta) {
    var q = survey.querySelector('.lp-survey__question');
    var opts = survey.querySelector('.lp-survey__options');
    var close = survey.querySelector('.lp-survey__close');

    if (opts) opts.style.display = 'none';
    if (close) close.style.display = 'none';
    if (q) {
      q.textContent = 'ご回答ありがとうございます';
      q.style.textAlign = 'center';
    }

    setTimeout(function () { dismiss(survey, stickyCta); }, 2000);
  }

  function dismiss(survey, stickyCta) {
    survey.dispatchEvent(new Event('lp-survey-removed'));
    survey.classList.remove('lp-survey--visible');
    survey.classList.add('lp-survey--hiding');

    // sticky CTA を復帰
    if (stickyCta) stickyCta.style.display = '';

    setTimeout(function () {
      if (survey.parentNode) survey.parentNode.removeChild(survey);
    }, 300);
  }

  function sendGA4(eventName, params) {
    if (typeof gtag === 'function') {
      gtag('event', eventName, params || {});
    }
  }
})();
