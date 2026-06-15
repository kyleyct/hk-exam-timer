/**
 * timer.js — 校園考試計時器 v0.3
 *
 * 階段 2 改動:
 * - 對接 fold windows 結構 (4 個視窗)
 * - 響鬧時所有視窗仍可見 (alarm screen 半透明)
 * - reset windows 與計時器解耦
 *
 * 階段 3 改動 (polish):
 * - 響鬧: 響到結束為止 (已係 v0.2 行為, 確認)
 * - 超時顯示: 0:00 → 0:01 → 0:02 ... 灰階 (已係 v0.2 行為)
 *
 * 設計:
 * - Date.now() 為單一時間基準
 * - visibilitychange 自動校驗
 * - 響鬧 setInterval loop (1秒嗶/0.5秒靜)
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const setup = $('setup');
  const live = $('live');
  const alarm = $('alarm');

  // ==================== State ====================
  const state = {
    endEpoch: 0,
    pausedTotal: 0,
    pausedAt: 0,
    isPaused: false,
    subject: '',
    paper: '',
    slot: '',
    notice: '',
    alarmPlayed: false,
    alarmLoopId: null,
    alarmTimeoutId: null,
    rafId: null,
  };

  // ==================== i18n ====================
  const t = (key, vars) => {
    if (window.i18n && window.i18n.isReady && window.i18n.isReady()) {
      return window.i18n.t(key, vars);
    }
    return key;
  };

  // ==================== 音 ====================
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('[timer] Web Audio not supported:', e);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function startAlarmLoop() {
    if (state.alarmLoopId) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    console.log('[timer] alarm loop started at', new Date().toISOString());

    function beep(startAt, duration) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.5, startAt + 0.02);
      gain.gain.setValueAtTime(0.5, startAt + duration - 0.02);
      gain.gain.linearRampToValueAtTime(0, startAt + duration);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.01);
    }

    function playBeat() {
      const now = ctx.currentTime;
      beep(now, 1.0);
    }
    playBeat();
    state.alarmLoopId = setInterval(playBeat, 1500);
  }

  function stopAlarmLoop() {
    if (state.alarmLoopId) {
      clearInterval(state.alarmLoopId);
      state.alarmLoopId = null;
    }
    if (audioCtx) audioCtx.suspend().catch(() => {});
  }

  function playTestBeep() {
    const ctx = ensureAudio();
    if (!ctx) return;
    console.log('[timer] test beep at', new Date().toISOString());
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
    gain.gain.setValueAtTime(0.5, now + 0.4);
    gain.gain.linearRampToValueAtTime(0, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.55);
  }

  // ==================== 計算 ====================
  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatHHMMSS(secs) {
    const sign = secs < 0 ? '-' : '';
    const abs = Math.abs(secs);
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    return sign + (h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`);
  }

  function formatSlot(start, end) {
    return `${pad2(start.getHours())}:${pad2(start.getMinutes())} - ${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
  }

  function nowEpoch() {
    // v0.3.1 fix: paused 期間 nowEpoch 凍結
    // 公式: Date.now() - 所有已 commit 嘅 pause 時間 - 當下未結束嘅 pause 區間
    return Date.now() - state.pausedTotal - (state.isPaused ? (Date.now() - state.pausedAt) : 0);
  }

  function remainingSec() {
    return Math.round((state.endEpoch - nowEpoch()) / 1000);
  }

  // ==================== 渲染 ====================
  function render() {
    if (state.alarmPlayed) return;

    const rem = remainingSec();
    const el = $('big-time');
    el.textContent = formatHHMMSS(rem);

    el.classList.remove('warning', 'danger', 'expired');
    const label = $('big-time-label');
    if (rem < 0) {
      el.classList.add('expired');
      label.textContent = `${t('live.expired_for')} ${formatHHMMSS(-rem).replace(/^-/, '')}`;
    } else if (rem === 0) {
      el.classList.add('danger');
      label.textContent = t('live.finished');
    } else if (rem <= 300) {
      el.classList.add('warning');
      label.textContent = t('live.remaining');
    } else {
      label.textContent = t('live.remaining');
    }

    if (rem <= 0 && !state.alarmPlayed) {
      triggerAlarm();
    }
  }

  function tick() {
    if (!state.alarmPlayed) {
      render();
      state.rafId = requestAnimationFrame(tick);
    }
  }

  // ==================== 響鬧 ====================
  function triggerAlarm() {
    if (state.alarmPlayed) return;
    state.alarmPlayed = true;
    if (state.rafId) cancelAnimationFrame(state.rafId);

    console.log('[timer] alarm triggered at', new Date().toISOString(), 'endEpoch=', state.endEpoch);

    $('alarm-subject').textContent = state.subject || '—';
    if (state.paper) {
      $('alarm-paper').textContent = state.paper;
      $('alarm-paper').hidden = false;
    } else {
      $('alarm-paper').hidden = true;
    }
    alarm.classList.remove('hidden');
    startAlarmLoop();
  }

  // ==================== 暫停 ====================
  function togglePause() {
    if (state.isPaused) {
      state.pausedTotal += Date.now() - state.pausedAt;
      state.isPaused = false;
      $('pause-btn').textContent = t('button.pause');
      $('live-status').textContent = t('live.running');
      $('live-status').classList.remove('paused');
      scheduleAlarm();
    } else {
      state.pausedAt = Date.now();
      state.isPaused = true;
      $('pause-btn').textContent = t('button.resume');
      $('live-status').textContent = t('live.paused');
      $('live-status').classList.add('paused');
      if (state.alarmTimeoutId) {
        clearTimeout(state.alarmTimeoutId);
        state.alarmTimeoutId = null;
      }
    }
  }

  // ==================== 響鬧 timeout ====================
  function scheduleAlarm() {
    if (state.alarmTimeoutId) clearTimeout(state.alarmTimeoutId);
    const ms = state.endEpoch - nowEpoch();
    console.log('[timer] schedule alarm in', ms, 'ms');
    if (ms > 0) {
      state.alarmTimeoutId = setTimeout(() => {
        console.log('[timer] alarm timeout fired');
        triggerAlarm();
      }, ms);
    } else {
      triggerAlarm();
    }
  }

  // ==================== 啟動考試 ====================
  function startExam() {
    const subject = $('subject').value.trim();
    const paper = $('paper').value.trim();
    const startStr = $('start-time').value;
    // v0.3.2 rev 13: end-time element 喺 setup 改版後被移除, 預設空字串
    const endEl = $('end-time');
    const endStr = endEl ? endEl.value : '';
    const durationStr = $('duration').value;
    const noticeEl = $('notice');
    const notice = noticeEl ? noticeEl.value.trim() : '';

    let startDate, endDate;
    const today = new Date();
    // v0.3.1: priority 改為 duration > end-time > start-only error
    // (老版本用 start+end > start+duration, 但用戶 intuition 係
    // 「我 set 1 小時, 應該顯示 1 小時」)
    if (!startStr) {
      alert(t('label.start_time'));
      return;
    }
    const [sh, sm] = startStr.split(':').map(Number);
    startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0);

    if (durationStr) {
      const dur = parseInt(durationStr, 10);
      if (!dur || dur < 1) {
        alert(t('placeholder.duration'));
        return;
      }
      // duration mode: end = start + dur
      endDate = new Date(startDate.getTime() + dur * 60 * 1000);
    } else if (endStr) {
      // end-time fallback: end = end-of-day's endStr
      const [eh, em] = endStr.split(':').map(Number);
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em, 0);
      if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
    } else {
      alert(t('placeholder.duration'));
      return;
    }

    let actualStart = startDate;
    const nowMs = Date.now();
    if (startDate.getTime() < nowMs) {
      const originalDuration = endDate.getTime() - startDate.getTime();
      actualStart = new Date(nowMs);
      endDate = new Date(nowMs + originalDuration);
    }

    state.endEpoch = endDate.getTime();
    state.pausedTotal = 0;
    state.pausedAt = 0;
    state.isPaused = false;
    state.alarmPlayed = false;
    state.subject = subject;
    state.paper = paper;
    state.slot = formatSlot(actualStart, endDate);
    state.notice = notice;

    setup.classList.add('hidden');
    live.classList.remove('hidden');

    $('live-slot').textContent = state.slot;
    $('live-subject').textContent = state.subject || '—';
    if (state.paper) {
      $('live-paper').textContent = state.paper;
      $('live-paper').hidden = false;
      $('live-paper-sep').hidden = false;
    } else {
      $('live-paper').hidden = true;
      $('live-paper-sep').hidden = true;
    }
    $('live-notice').textContent = notice;
    $('live-status').textContent = t('live.running');
    $('live-status').classList.remove('paused');
    $('pause-btn').textContent = t('button.pause');

    ensureAudio();
    render();
    scheduleAlarm();
    state.rafId = requestAnimationFrame(tick);

    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  // ==================== 結束 ====================
  function endExam() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    if (state.alarmTimeoutId) clearTimeout(state.alarmTimeoutId);
    if (state.alarmLoopId) clearInterval(state.alarmLoopId);
    state.alarmPlayed = true;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    live.classList.add('hidden');
    alarm.classList.add('hidden');
    setup.classList.remove('hidden');
    state.alarmLoopId = null;
  }

  // ==================== 公告即時編輯 ====================
  function initNoticeEditor() {
    const noticeEl = $('live-notice');
    if (!noticeEl) return;

    noticeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        noticeEl.blur();
      }
    });

    noticeEl.addEventListener('blur', () => {
      state.notice = noticeEl.textContent.trim();
      console.log('[timer] notice updated:', state.notice);
    });
  }

  // ==================== 事件綁定 ====================
  function bindEvents() {
    // v0.3.1: 用 bind() 統一處理 null, 避免 missing element 導致整個 init crash
    // (eg. cached version mismatch, 開發中 hot reload, browser extension 改 DOM)
    function bind(id, event, handler) {
      const el = $(id);
      if (!el) {
        console.warn(`[timer] element #${id} not found, skip ${event} binding`);
        return null;
      }
      el.addEventListener(event, handler);
      return el;
    }

    bind('start-btn', 'click', startExam);
    bind('pause-btn', 'click', togglePause);
    bind('end-btn', 'click', () => {
      if (confirm(t('button.end') + '?')) endExam();
    });
    bind('fullscreen-btn', 'click', () => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
    });
    bind('test-alarm-btn', 'click', () => {
      ensureAudio();
      playTestBeep();
    });

    // v0.3.1: 響鬧時 inline 結束按鈕 (alarm 內, fold window 之外)
    bind('alarm-end-btn', 'click', () => {
      if (confirm(t('button.end') + '?')) endExam();
    });

    bind('notice-size', 'input', (e) => {
      const val = e.target.value;
      const valLabel = $('notice-size-val');
      if (valLabel) valLabel.textContent = val + 'px';
      const noticeEl = $('live-notice');
      if (noticeEl) noticeEl.style.fontSize = val + 'px';
    });

    const langSel = $('lang-select');
    if (langSel) {
      langSel.value = window.i18n ? window.i18n.getLang() : 'zh-HK';
      langSel.addEventListener('change', (e) => {
        window.i18n.setLang(e.target.value);
      });
    }

    document.addEventListener('i18n:changed', () => {
      const isPaused = state.isPaused;
      const pauseBtn = $('pause-btn');
      if (pauseBtn) pauseBtn.textContent = isPaused ? t('button.resume') : t('button.pause');
      const st = $('live-status');
      if (!st) return;
      if (isPaused) st.textContent = t('live.paused');
      else if (state.alarmPlayed) st.textContent = t('live.finished');
      else st.textContent = t('live.running');
    });

    document.addEventListener('keydown', (e) => {
      if (live.classList.contains('hidden')) return;
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !state.alarmPlayed) {
        render();
      }
    });
  }

  // ==================== Init ====================
  function init() {
    // v0.3.1: 用 try-catch 包住, 任何 sub-step 失敗都唔會中斷 init
    try { bindEvents(); }
    catch (err) { console.error('[timer] bindEvents failed:', err); }

    try { initNoticeEditor(); }
    catch (err) { console.error('[timer] initNoticeEditor failed:', err); }

    if (location.search.includes('test=alarm5')) {
      console.log('[timer] test=alarm5 mode — alarm in 5s');
      setTimeout(() => {
        try {
          state.endEpoch = Date.now() + 1000;
          state.subject = '[TEST] 試響測試';
          state.paper = '';
          setup.classList.add('hidden');
          live.classList.remove('hidden');
          const slotEl = $('live-slot');
          const subjEl = $('live-subject');
          if (slotEl) slotEl.textContent = 'TEST — 00:00 - 00:00';
          if (subjEl) subjEl.textContent = state.subject;
          render();
          scheduleAlarm();
          state.rafId = requestAnimationFrame(tick);
        } catch (err) {
          console.error('[timer] test=alarm5 setup failed:', err);
        }
      }, 5000);
    }
  }

  if (window.i18n) {
    if (window.i18n.isReady()) init();
    else window.addEventListener('load', init);
  } else {
    init();
  }
})();
