/**
 * ミートキャリア 広告専用LP — 自前カレンダー予約UI
 *
 * HubSpot iframe を置き換えるモバイルファーストの予約フロー。
 * 4ステップ: ① 日付選択 → ② 時間帯選択 → ③ 情報入力 → ④ 完了
 *
 * API:
 *   GET  /api/availability  — 空き枠取得
 *   POST /api/book           — 予約作成
 *
 * GA4カスタムイベント（tracking.js がリッスン）:
 *   cal:date_select      — 日付選択時
 *   cal:time_select      — 時間帯選択時
 *   cal:form_start       — フォーム入力開始時
 *   cal:booking_complete — 予約完了時
 */

(function () {
  'use strict';

  // === 定数 ===
  const API_BASE = 'https://meetcareer-hubspot-proxy.kunimitsu-kawamura.workers.dev/api';
  const SLUG = 'meetcareer/free-career-counseling-lst';
  const DURATION = 3600000; // 60分（ミリ秒）
  const TZ = 'Asia/Tokyo';
  const PRIVACY_URL = 'https://fruor.notion.site/9684723a87ca436d8fd46ddbf5f314b5';
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
  const ROOT_ID = 'calendar-root';

  // === 状態管理 ===
  let currentYear = 0;
  let currentMonth = 0; // 0-indexed
  let availabilityCache = {}; // key: "YYYY-MM" → Map<"YYYY-MM-DD", [{start,end}]>
  let selectedDate = null; // "YYYY-MM-DD"
  let selectedSlot = null; // { startMillisUtc, endMillisUtc }
  let currentStep = 1;
  let formStarted = false;
  let prefetched = false;
  let bookingResult = null; // 予約APIのレスポンス

  // === ユーティリティ ===
  function pad(n) { return String(n).padStart(2, '0'); }

  function toJSTDate(millis) {
    return new Date(millis + 9 * 60 * 60 * 1000);
  }

  function formatTime(millis) {
    const d = new Date(millis);
    // UTC millis を JST に変換して表示
    const jst = new Date(d.getTime());
    const h = jst.toLocaleString('ja-JP', { timeZone: TZ, hour: '2-digit', hour12: false });
    const m = jst.toLocaleString('ja-JP', { timeZone: TZ, minute: '2-digit' });
    return `${pad(parseInt(h))}:${pad(parseInt(m))}`;
  }

  function formatDateJP(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const dow = WEEKDAYS[dt.getDay()];
    return `${y}年${m}月${d}日（${dow}）`;
  }

  function monthKey(year, month) {
    return `${year}-${pad(month + 1)}`;
  }

  function getJSTDateStr(millis) {
    const d = new Date(millis);
    const jst = d.toLocaleDateString('ja-JP', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    // "YYYY/MM/DD" → "YYYY-MM-DD"
    return jst.replace(/\//g, '-');
  }

  function dispatchCalEvent(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  // === API ===
  async function fetchAvailability(year, month) {
    const key = monthKey(year, month);
    if (availabilityCache[key]) return availabilityCache[key];

    try {
      const url = `${API_BASE}/availability?slug=${encodeURIComponent(SLUG)}&month=${key}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const map = new Map();
      const durations = json?.linkAvailability?.linkAvailabilityByDuration;
      if (durations) {
        const durationData = durations[String(DURATION)];
        if (durationData && durationData.availabilities) {
          durationData.availabilities.forEach(slot => {
            const dateStr = getJSTDateStr(slot.startMillisUtc);
            if (!map.has(dateStr)) map.set(dateStr, []);
            map.get(dateStr).push({
              startMillisUtc: slot.startMillisUtc,
              endMillisUtc: slot.endMillisUtc
            });
          });
        }
      }

      availabilityCache[key] = map;
      return map;
    } catch (err) {
      console.error('[calendar] availability fetch error:', err);
      return new Map();
    }
  }

  async function bookMeeting(data) {
    const body = {
      slug: SLUG,
      startTime: data.startTime,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      timezone: TZ,
      duration: DURATION,
      locale: 'ja',
      formFields: []
    };

    // 相談内容の処理
    // HubSpotのformFieldは30文字以上が必須。短い場合はformFieldsに含めず、メール用に別途渡す
    if (data.consultation) {
      if (data.consultation.length >= 30) {
        body.formFields.push({
          name: 'consultation_content_free_counseling',
          value: data.consultation
        });
      }
      // メール送信用（Worker側で参照）
      body.consultation_text = data.consultation;
    }

    const res = await fetch(`${API_BASE}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let errorMsg = '予約の送信に失敗しました。';
      try {
        const errData = await res.json();
        if (errData.subCategory === 'MeetingsBookingCreatedError.INVALID_EMAIL') {
          errorMsg = '入力されたメールアドレスが無効です。正しいメールアドレスを入力してください。';
        } else if (errData.message) {
          errorMsg = `エラー: ${errData.message}`;
        }
      } catch (_) { /* JSON parse failed */ }
      throw new Error(errorMsg);
    }

    return res.json();
  }

  // === レンダリング ===
  function getRoot() {
    return document.getElementById(ROOT_ID);
  }

  // === ステップ遷移（History API統合） ===
  function goToStep(step, { pushHistory = true } = {}) {
    currentStep = step;
    if (pushHistory) {
      history.pushState({ calStep: step }, '', '');
    }
    render();
  }

  // ブラウザ戻る/進むでステップ移動
  window.addEventListener('popstate', (e) => {
    if (e.state && typeof e.state.calStep === 'number') {
      currentStep = e.state.calStep;
      render();
    }
  });

  // 初期状態をhistoryに記録
  history.replaceState({ calStep: 1 }, '', '');

  function render() {
    const root = getRoot();
    if (!root) return;

    root.innerHTML = '';
    root.appendChild(renderStepIndicator());

    switch (currentStep) {
      case 1: root.appendChild(renderDateStep()); break;
      case 2: root.appendChild(renderTimeStep()); break;
      case 3: root.appendChild(renderFormStep()); break;
      case 4: root.appendChild(renderThanksStep()); break;
    }

    // フォーム・サンクス画面ではsticky CTAを非表示
    const stickyCta = document.querySelector('.sticky-cta');
    if (stickyCta) {
      if (currentStep >= 2) {
        stickyCta.classList.remove('sticky-cta--visible');
      }
    }
  }

  // --- ステップインジケーター ---
  function renderStepIndicator() {
    const wrap = el('div', 'cal-steps');
    wrap.setAttribute('aria-label', '予約ステップ');

    const steps = [
      { num: 1, label: '日付' },
      { num: 2, label: '時間' },
      { num: 3, label: '情報入力' }
    ];

    steps.forEach((s, i) => {
      const item = el('div', 'cal-steps__item');
      if (s.num < currentStep) item.classList.add('cal-steps__item--done');
      if (s.num === currentStep) item.classList.add('cal-steps__item--active');

      const circle = el('span', 'cal-steps__circle');
      circle.textContent = s.num < currentStep ? '✓' : String(s.num);
      item.appendChild(circle);

      const label = el('span', 'cal-steps__label');
      label.textContent = s.label;
      item.appendChild(label);

      wrap.appendChild(item);

      if (i < steps.length - 1) {
        const line = el('span', 'cal-steps__line');
        if (s.num < currentStep) line.classList.add('cal-steps__line--done');
        wrap.appendChild(line);
      }
    });

    return wrap;
  }

  // --- ステップ1: 日付選択 ---
  function renderDateStep() {
    const container = el('div', 'cal-calendar');
    container.setAttribute('role', 'application');
    container.setAttribute('aria-label', '日付選択カレンダー');

    // ナビゲーション
    const nav = el('div', 'cal-calendar__nav');

    const prevBtn = el('button', 'cal-calendar__nav-btn');
    prevBtn.type = 'button';
    prevBtn.textContent = '‹';
    prevBtn.setAttribute('aria-label', '前月');
    prevBtn.addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      renderCalendarGrid(container);
    });

    const title = el('span', 'cal-calendar__nav-title');
    title.id = 'cal-nav-title';
    title.textContent = `${currentYear}年${currentMonth + 1}月`;

    const nextBtn = el('button', 'cal-calendar__nav-btn');
    nextBtn.type = 'button';
    nextBtn.textContent = '›';
    nextBtn.setAttribute('aria-label', '翌月');
    nextBtn.addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      renderCalendarGrid(container);
    });

    nav.appendChild(prevBtn);
    nav.appendChild(title);
    nav.appendChild(nextBtn);
    container.appendChild(nav);

    // 曜日ヘッダー
    const weekHeader = el('div', 'cal-calendar__weekdays');
    WEEKDAYS.forEach(w => {
      const wd = el('span', 'cal-calendar__weekday');
      wd.textContent = w;
      weekHeader.appendChild(wd);
    });
    container.appendChild(weekHeader);

    // グリッド
    const grid = el('div', 'cal-calendar__grid');
    grid.id = 'cal-grid';
    grid.setAttribute('role', 'grid');
    container.appendChild(grid);

    // ローディング
    const loading = el('div', 'cal-loading');
    loading.id = 'cal-loading';
    loading.innerHTML = '<span class="cal-loading__spinner" aria-hidden="true"></span><span>読み込み中...</span>';
    container.appendChild(loading);

    renderCalendarGrid(container);

    return container;
  }

  async function renderCalendarGrid(container) {
    const grid = container.querySelector('#cal-grid');
    const loading = container.querySelector('#cal-loading');
    const navTitle = container.querySelector('#cal-nav-title');

    if (!grid) return;

    navTitle.textContent = `${currentYear}年${currentMonth + 1}月`;
    grid.innerHTML = '';
    grid.style.display = 'none';
    loading.style.display = 'flex';

    // 前月ナビボタンの制御
    const prevBtn = container.querySelector('.cal-calendar__nav-btn');
    const now = new Date();
    const nowY = now.getFullYear();
    const nowM = now.getMonth();
    if (currentYear === nowY && currentMonth <= nowM) {
      prevBtn.disabled = true;
    } else {
      prevBtn.disabled = false;
    }

    const avail = await fetchAvailability(currentYear, currentMonth);

    // 翌月もプリフェッチ
    const nextM = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
    fetchAvailability(nextY, nextM);

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 前月の空セル
    for (let i = 0; i < firstDay; i++) {
      grid.appendChild(el('span', 'cal-calendar__day cal-calendar__day--empty'));
    }

    // 日セル
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(d)}`;
      const cellDate = new Date(currentYear, currentMonth, d);
      const isPast = cellDate < today;
      const hasSlots = avail.has(dateStr);

      const btn = el('button', 'cal-calendar__day');
      btn.type = 'button';
      btn.textContent = String(d);
      btn.setAttribute('aria-label', `${currentMonth + 1}月${d}日${hasSlots ? '（空きあり）' : '（空きなし）'}`);

      if (isPast || !hasSlots) {
        btn.classList.add('cal-calendar__day--disabled');
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      } else {
        btn.classList.add('cal-calendar__day--available');
        btn.addEventListener('click', () => {
          selectedDate = dateStr;
          dispatchCalEvent('cal:date_select', { date: dateStr });
          goToStep(2);
        });
      }

      // 日曜を赤、土曜を青
      const dayOfWeek = cellDate.getDay();
      if (dayOfWeek === 0) btn.classList.add('cal-calendar__day--sun');
      if (dayOfWeek === 6) btn.classList.add('cal-calendar__day--sat');

      grid.appendChild(btn);
    }

    loading.style.display = 'none';
    grid.style.display = 'grid';
  }

  // --- ステップ2: 時間帯選択 ---
  function renderTimeStep() {
    const container = el('div', 'cal-times');

    const header = el('div', 'cal-times__header');
    const dateLabel = el('p', 'cal-times__date');
    dateLabel.textContent = formatDateJP(selectedDate);
    header.appendChild(dateLabel);

    const backLink = el('button', 'cal-times__back');
    backLink.type = 'button';
    backLink.textContent = '← 日付を変更';
    backLink.addEventListener('click', () => {
      history.back();
    });
    header.appendChild(backLink);
    container.appendChild(header);

    const key = monthKey(currentYear, currentMonth);
    const avail = availabilityCache[key];
    const slots = avail ? avail.get(selectedDate) || [] : [];

    if (slots.length === 0) {
      const empty = el('p', 'cal-times__empty');
      empty.textContent = 'この日に空き枠がありません';
      container.appendChild(empty);
      return container;
    }

    const list = el('div', 'cal-times__list');
    list.setAttribute('role', 'list');

    // 時間順にソート
    const sorted = [...slots].sort((a, b) => a.startMillisUtc - b.startMillisUtc);

    sorted.forEach(slot => {
      const btn = el('button', 'cal-times__btn');
      btn.type = 'button';
      btn.setAttribute('role', 'listitem');
      const timeStr = formatTime(slot.startMillisUtc);
      btn.textContent = timeStr;
      btn.setAttribute('aria-label', `${timeStr}から予約`);
      btn.addEventListener('click', () => {
        selectedSlot = slot;
        dispatchCalEvent('cal:time_select', { time: formatTime(slot.startMillisUtc) });
        goToStep(3);
      });
      list.appendChild(btn);
    });

    container.appendChild(list);
    return container;
  }

  // --- ステップ3: 情報入力フォーム ---
  function renderFormStep() {
    const container = el('div', 'cal-form');

    // 選択内容表示
    const summary = el('div', 'cal-form__summary');
    const dateText = el('p', 'cal-form__summary-text');
    dateText.innerHTML = `<strong>日時:</strong> ${formatDateJP(selectedDate)} ${formatTime(selectedSlot.startMillisUtc)}〜`;
    summary.appendChild(dateText);
    container.appendChild(summary);

    // フォーム
    const form = el('form', 'cal-form__body');
    form.noValidate = true;

    // モバイルでフォーム入力時にsticky CTAを非表示
    const stickyCta = document.querySelector('.sticky-cta');
    if (stickyCta) {
      form.addEventListener('focusin', () => stickyCta.classList.add('sticky-cta--hidden'));
      form.addEventListener('focusout', () => stickyCta.classList.remove('sticky-cta--hidden'));
    }

    // 姓名
    const nameRow = el('div', 'cal-form__row');

    const lastNameField = createField('text', 'lastName', '姓', true);
    const firstNameField = createField('text', 'firstName', '名', true);
    nameRow.appendChild(lastNameField);
    nameRow.appendChild(firstNameField);
    form.appendChild(nameRow);

    // メール
    form.appendChild(createField('email', 'email', 'Eメールアドレス', true));

    // 相談内容
    const consultField = el('div', 'cal-form__field');
    const consultLabel = el('label', 'cal-form__label');
    consultLabel.setAttribute('for', 'cal-consultation');
    consultLabel.textContent = '（任意）相談したい内容を具体的に教えてください';
    consultField.appendChild(consultLabel);

    const textarea = el('textarea', 'cal-form__input cal-form__textarea');
    textarea.id = 'cal-consultation';
    textarea.name = 'consultation';
    textarea.rows = 4;
    textarea.placeholder = '例: 今の仕事を続けるべきか悩んでいます...';
    textarea.addEventListener('focus', trackFormStart);
    consultField.appendChild(textarea);
    form.appendChild(consultField);

    // プライバシー説明
    const privacyNote = el('p', 'cal-form__privacy-note');
    privacyNote.textContent = 'ミートキャリアは、お客様の個人情報をアカウント管理およびサービス提供のためにのみ使用いたします。';
    form.appendChild(privacyNote);

    // プライバシーポリシー同意（必須）
    const privacyCheck = el('div', 'cal-form__checkbox-wrap');
    const privacyCb = el('input', '');
    privacyCb.type = 'checkbox';
    privacyCb.id = 'cal-privacy';
    privacyCb.name = 'privacy';
    privacyCb.required = true;
    const privacyLabel = el('label', 'cal-form__checkbox-label');
    privacyLabel.setAttribute('for', 'cal-privacy');
    privacyLabel.innerHTML = '<a href="' + PRIVACY_URL + '" target="_blank" rel="noopener">プライバシーポリシー</a>に同意する <span class="cal-form__required">*</span>';
    privacyCheck.appendChild(privacyCb);
    privacyCheck.appendChild(privacyLabel);
    form.appendChild(privacyCheck);

    // キャリア情報受取（任意）
    const infoCheck = el('div', 'cal-form__checkbox-wrap');
    const infoCb = el('input', '');
    infoCb.type = 'checkbox';
    infoCb.id = 'cal-info';
    infoCb.name = 'career_info';
    const infoLabel = el('label', 'cal-form__checkbox-label');
    infoLabel.setAttribute('for', 'cal-info');
    infoLabel.textContent = 'キャリアに関する情報を受け取る';
    infoCheck.appendChild(infoCb);
    infoCheck.appendChild(infoLabel);
    form.appendChild(infoCheck);

    // 確定ボタン説明
    const submitNote = el('p', 'cal-form__submit-note');
    submitNote.textContent = '「確定」ボタンを押すことで、プライバシーポリシーに同意いただいたものとみなされます。';
    form.appendChild(submitNote);

    // エラー表示領域
    const errorBox = el('div', 'cal-form__error');
    errorBox.id = 'cal-form-error';
    errorBox.setAttribute('role', 'alert');
    errorBox.style.display = 'none';
    form.appendChild(errorBox);

    // ボタン行
    const btnRow = el('div', 'cal-form__btn-row');

    const backBtn = el('button', 'cal-form__back');
    backBtn.type = 'button';
    backBtn.textContent = '← 戻る';
    backBtn.addEventListener('click', () => {
      history.back();
    });
    btnRow.appendChild(backBtn);

    const submitBtn = el('button', 'cal-form__submit');
    submitBtn.type = 'submit';
    submitBtn.textContent = '確定';
    btnRow.appendChild(submitBtn);

    form.appendChild(btnRow);

    // 送信処理
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // バリデーション
      const lastName = form.querySelector('[name="lastName"]').value.trim();
      const firstName = form.querySelector('[name="firstName"]').value.trim();
      const email = form.querySelector('[name="email"]').value.trim();
      const privacy = form.querySelector('[name="privacy"]').checked;
      const consultation = form.querySelector('[name="consultation"]').value.trim();

      const errors = [];
      if (!lastName) errors.push('姓を入力してください');
      if (!firstName) errors.push('名を入力してください');
      if (!email) errors.push('Eメールアドレスを入力してください');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('正しいメールアドレスを入力してください');
      if (!privacy) errors.push('プライバシーポリシーへの同意が必要です');

      if (errors.length > 0) {
        showFormError(errors.join('。'));
        return;
      }

      // 送信
      submitBtn.disabled = true;
      submitBtn.textContent = '送信中...';
      hideFormError();

      try {
        bookingResult = await bookMeeting({
          startTime: selectedSlot.startMillisUtc,
          firstName,
          lastName,
          email,
          consultation
        });

        goToStep(4);
        dispatchCalEvent('cal:booking_complete');
      } catch (err) {
        console.error('[calendar] booking error:', err);
        showFormError(err.message || '予約の送信に失敗しました。時間をおいて再度お試しください。');
        submitBtn.disabled = false;
        submitBtn.textContent = '確定';
      }
    });

    container.appendChild(form);
    return container;
  }

  function createField(type, name, label, required) {
    const field = el('div', 'cal-form__field');

    const lbl = el('label', 'cal-form__label');
    lbl.setAttribute('for', `cal-${name}`);
    lbl.innerHTML = label + (required ? ' <span class="cal-form__required">*</span>' : '');
    field.appendChild(lbl);

    const input = el('input', 'cal-form__input');
    input.type = type;
    input.id = `cal-${name}`;
    input.name = name;
    input.required = required;
    input.autocomplete = name === 'email' ? 'email' : name === 'firstName' ? 'given-name' : 'family-name';

    if (type === 'email') {
      input.placeholder = 'example@email.com';
    }

    // フォーム入力開始を検知
    input.addEventListener('focus', trackFormStart);

    // リアルタイムバリデーション
    input.addEventListener('blur', () => {
      validateField(input);
    });

    field.appendChild(input);
    return field;
  }

  function trackFormStart() {
    if (!formStarted) {
      formStarted = true;
      dispatchCalEvent('cal:form_start');
    }
  }

  function validateField(input) {
    const val = input.value.trim();
    const isRequired = input.required;

    input.classList.remove('cal-form__input--error', 'cal-form__input--valid');

    if (isRequired && !val) {
      input.classList.add('cal-form__input--error');
      return false;
    }

    if (input.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      input.classList.add('cal-form__input--error');
      return false;
    }

    if (val) {
      input.classList.add('cal-form__input--valid');
    }
    return true;
  }

  function showFormError(msg) {
    const box = document.getElementById('cal-form-error');
    if (box) {
      box.textContent = msg;
      box.style.display = 'block';
    }
  }

  function hideFormError() {
    const box = document.getElementById('cal-form-error');
    if (box) {
      box.style.display = 'none';
    }
  }

  // --- ステップ4: サンクスメッセージ ---
  function renderThanksStep() {
    const container = el('div', 'cal-thanks');

    const icon = el('div', 'cal-thanks__icon');
    icon.textContent = '✓';
    icon.setAttribute('aria-hidden', 'true');
    container.appendChild(icon);

    const title = el('h3', 'cal-thanks__title');
    title.textContent = 'ご予約が確定しました';
    container.appendChild(title);

    const details = el('div', 'cal-thanks__details');

    const dateRow = el('p', 'cal-thanks__detail');
    dateRow.innerHTML = `<strong>日時:</strong> ${formatDateJP(selectedDate)} ${formatTime(selectedSlot.startMillisUtc)}〜`;
    details.appendChild(dateRow);

    const durationRow = el('p', 'cal-thanks__detail');
    durationRow.innerHTML = '<strong>所要時間:</strong> 60分';
    details.appendChild(durationRow);

    const locationRow = el('p', 'cal-thanks__detail');
    locationRow.innerHTML = '<strong>場所:</strong> Google Meet（オンライン）';
    details.appendChild(locationRow);

    // Google Meet URL 表示
    const meetUrl = bookingResult && (bookingResult.webConferenceUrl || bookingResult.location);
    if (meetUrl) {
      const meetLinkWrap = el('div', 'cal-thanks__meet-link');
      const meetLabel = el('p', 'cal-thanks__meet-label');
      meetLabel.textContent = '参加用リンク（当日こちらからご参加ください）';
      meetLinkWrap.appendChild(meetLabel);

      const meetUrlRow = el('div', 'cal-thanks__meet-url-row');
      const meetUrlText = el('span', 'cal-thanks__meet-url-text');
      meetUrlText.textContent = meetUrl;
      meetUrlRow.appendChild(meetUrlText);

      const copyBtn = el('button', 'cal-thanks__copy-btn');
      copyBtn.textContent = 'コピー';
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', () => {
        copyToClipboard(meetUrl).then(() => {
          copyBtn.textContent = 'コピーしました ✓';
          copyBtn.classList.add('cal-thanks__copy-btn--done');
          setTimeout(() => {
            copyBtn.textContent = 'コピー';
            copyBtn.classList.remove('cal-thanks__copy-btn--done');
          }, 2000);
        });
      });
      meetUrlRow.appendChild(copyBtn);
      meetLinkWrap.appendChild(meetUrlRow);
      details.appendChild(meetLinkWrap);
    }

    container.appendChild(details);

    const emailNote = el('p', 'cal-thanks__email-note');
    emailNote.textContent = '担当者よりご予約確認のメールをお送りいたします。上記のGoogle Meetリンクは必ずお控えください。';
    container.appendChild(emailNote);

    return container;
  }

  // === DOM ヘルパー ===
  // === クリップボードコピー（HTTP環境フォールバック付き） ===
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // フォールバック: textarea経由
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  // === IntersectionObserver でプリフェッチ ===
  function setupPrefetch() {
    const section = document.getElementById('reservation');
    if (!section || prefetched) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !prefetched) {
          prefetched = true;
          const now = new Date();
          currentYear = now.getFullYear();
          currentMonth = now.getMonth();
          fetchAvailability(currentYear, currentMonth);
          observer.disconnect();
        }
      });
    }, {
      rootMargin: '200px 0px'
    });

    observer.observe(section);
  }

  // === 初期化 ===
  function init() {
    const root = getRoot();
    if (!root) return;

    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();

    render();
    setupPrefetch();
  }

  // DOM準備完了後に初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
