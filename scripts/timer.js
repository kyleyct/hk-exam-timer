/**
 * timer.js — 校園考試計時器 v0.2
 *
 * 階段 1 改動:
 * - 響鬧改綠色 (CSS 配合, JS 只 emit 事件)
 * - 響鬧使用 setInterval loop, 確保長響
 * - 公告可於考試中即時編輯 (contenteditable)
 * - 公告常駐於 live + alarm screen
 * - i18n 整合 (t() 函數 from window.i18n)
 * - Combobox 取代 datalist (search + free input)
 * - 響鬧 debug: 5 秒測試 mode via ?test=alarm5
 *
 * 設計重點:
 * - Date.now() 為單一時間基準 (唔用 setInterval 累加)
 * - visibilitychange 自動校驗
 * - 響鬧用 oscillator + setInterval loop
 */

(function () {
  'use strict';

  // ==================== DOM ====================
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
    rafId: null,
  };

  // ==================== i18n helper ====================
  const t = (key, vars) => {
    if (window.i18n && window.i18n.isReady && window.i18n.isReady()) {
      return window.i18n.t(key, vars);
    }
    return key;  // fallback
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

  /** 響鬧長響: 1 秒嗶 + 0.5 秒靜, loop until stop */
  function startAlarmLoop() {
    if (state.alarmLoopId) return;  // already running
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

    let beat = 0;
    function playBeat() {
      const now = ctx.currentTime;
      // 1 秒嗶 + 0.5 秒靜
      beep(now, 1.0);
      // 每 1.5 秒重複
      beat++;
    }
    playBeat();
    state.alarmLoopId = setInterval(playBeat, 1500);
  }

  function stopAlarmLoop() {
    if (state.alarmLoopId) {
      clearInterval(state.alarmLoopId);
      state.alarmLoopId = null;
      console.log('[timer] alarm loop stopped');
    }
    // 即時靜音: 暫停 audio context
    if (audioCtx) {
      audioCtx.suspend().catch(() => {});
    }
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
    return Date.now() - state.pausedTotal + (state.isPaused ? (Date.now() - state.pausedAt) : 0);
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

    // 顯示響鬧畫面 (綠色)
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
  let alarmTimeoutId = null;
  function scheduleAlarm() {
    if (alarmTimeoutId) clearTimeout(alarmTimeoutId);
    const ms = state.endEpoch - nowEpoch();
    console.log('[timer] schedule alarm in', ms, 'ms');
    if (ms > 0) {
      alarmTimeoutId = setTimeout(() => {
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
    const endStr = $('end-time').value;
    const durationStr = $('duration').value;
    const notice = $('notice').value.trim();

    let startDate, endDate;
    const today = new Date();
    if (startStr && endStr) {
      const [sh, sm] = startStr.split(':').map(Number);
      const [eh, em] = endStr.split(':').map(Number);
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0);
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em, 0);
      if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
    } else if (startStr && durationStr) {
      const [sh, sm] = startStr.split(':').map(Number);
      const dur = parseInt(durationStr, 10);
      if (!dur || dur < 1) {
        alert(t('placeholder.duration'));
        return;
      }
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0);
      endDate = new Date(startDate.getTime() + dur * 60 * 1000);
    } else {
      alert(t('label.start_time'));
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
    if (alarmTimeoutId) clearTimeout(alarmTimeoutId);
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

    // 鍵盤: Enter = 換行, Esc = 退出編輯
    noticeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        noticeEl.blur();
      }
    });

    // blur 後保存到 state
    noticeEl.addEventListener('blur', () => {
      state.notice = noticeEl.textContent.trim();
      console.log('[timer] notice updated:', state.notice);
    });
  }

  // ==================== 事件綁定 ====================
  function bindEvents() {
    $('start-btn').addEventListener('click', startExam);
    $('pause-btn').addEventListener('click', togglePause);
    $('end-btn').addEventListener('click', () => {
      if (confirm(t('button.end') + '?')) endExam();
    });
    $('fullscreen-btn').addEventListener('click', () => {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
    });
    $('test-alarm-btn').addEventListener('click', () => {
      ensureAudio();
      playTestBeep();
    });

    $('notice-size').addEventListener('input', (e) => {
      const val = e.target.value;
      $('notice-size-val').textContent = val + 'px';
      const noticeEl = $('live-notice');
      if (noticeEl) noticeEl.style.fontSize = val + 'px';
    });

    // 語言切換
    const langSel = $('lang-select');
    if (langSel) {
      langSel.value = window.i18n ? window.i18n.getLang() : 'zh-HK';
      langSel.addEventListener('change', (e) => {
        window.i18n.setLang(e.target.value);
      });
    }

    // i18n 變化時 re-bind confirm 等動態文字
    document.addEventListener('i18n:changed', () => {
      const isPaused = state.isPaused;
      $('pause-btn').textContent = isPaused ? t('button.resume') : t('button.pause');
      const st = $('live-status');
      if (isPaused) st.textContent = t('live.paused');
      else if (state.alarmPlayed) st.textContent = t('live.finished');
      else st.textContent = t('live.running');
    });

    // 鍵盤快捷鍵
    document.addEventListener('keydown', (e) => {
      if (live.classList.contains('hidden')) return;
      if (e.target.matches('input, textarea, [contenteditable]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      }
    });

    // 分頁隱藏時重新校驗
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !state.alarmPlayed) {
        render();
      }
    });
  }

  // ==================== 初始化 ====================
  function init() {
    bindEvents();
    initNoticeEditor();

    // 5 秒響鬧測試 mode (debug)
    if (location.search.includes('test=alarm5')) {
      console.log('[timer] test=alarm5 mode — alarm in 5s');
      setTimeout(() => {
        state.endEpoch = Date.now() + 1000;  // 1s 後觸發
        state.subject = '[TEST] 試響測試';
        state.paper = '';
        setup.classList.add('hidden');
        live.classList.remove('hidden');
        $('live-slot').textContent = 'TEST — 00:00 - 00:00';
        $('live-subject').textContent = state.subject;
        render();
        scheduleAlarm();
        state.rafId = requestAnimationFrame(tick);
      }, 5000);
    }
  }

  // 等 i18n ready 後 init
  if (window.i18n) {
    if (window.i18n.isReady()) {
      init();
    } else {
      window.addEventListener('load', init);
    }
  } else {
    init();
  }
})();
