/**
 * 校園考試計時器
 * 純 vanilla JS,零依賴
 *
 * 計時可靠性設計:
 * - 單一時間基準:Date.now() (真實時鐘),唔用 setInterval 累加
 * - 渲染頻率:1Hz (requestAnimationFrame 控制 ~1fps)
 * - 響鬧觸發:setTimeout(到點時間 - 現在),唔靠 setInterval
 * - 分頁隱藏:visibilitychange 時暫停渲染,恢復時用 Date.now() 重新校驗
 * - 響鬧音:Web Audio API (oscillator + gain envelope),避開 autoplay 限制
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
    endEpoch: 0,        // 響鬧時的 Unix ms
    pauseEpoch: 0,      // 暫停時的 Unix ms
    pausedTotal: 0,     // 累計暫停的 ms
    pausedAt: 0,        // 當前暫停開始時間
    isPaused: false,
    subject: '',
    slot: '',           // "HH:MM - HH:MM"
    notice: '',
    alarmPlayed: false,
    rafId: null,
  };

  // ==================== 音 ====================
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio not supported', e);
      }
    }
    return audioCtx;
  }

  function playAlarm() {
    const ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    // 響鬧:3 次嗶嗶,每次 200ms on / 200ms off
    const beep = (startAt) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.5, startAt + 0.02);
      gain.gain.setValueAtTime(0.5, startAt + 0.18);
      gain.gain.linearRampToValueAtTime(0, startAt + 0.2);
      osc.start(startAt);
      osc.stop(startAt + 0.21);
    };

    const t0 = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      beep(t0 + i * 0.4);
    }
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

  // ==================== 倒數 ====================
  function nowEpoch() {
    return Date.now() - state.pausedTotal + (state.isPaused ? (Date.now() - state.pausedAt) : 0);
  }

  function remainingSec() {
    return Math.round((state.endEpoch - nowEpoch()) / 1000);
  }

  // ==================== 渲染 ====================
  function render() {
    if (state.alarmPlayed) return;  // 響鬧後唔再 render

    const rem = remainingSec();
    const el = $('big-time');
    el.textContent = rem >= 0 ? formatHHMMSS(rem) : `-${formatHHMMSS(-rem)}`;

    // 樣式:5 分鐘內 warning;0 分鐘內 danger
    el.classList.remove('warning', 'danger');
    if (rem <= 0) el.classList.add('danger');
    else if (rem <= 300) el.classList.add('warning');

    $('big-time-label').textContent = rem > 0 ? '剩餘時間' : (rem === 0 ? '時間到' : '已超時');

    // 響鬧
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
    state.alarmPlayed = true;
    if (state.rafId) cancelAnimationFrame(state.rafId);

    $('alarm-subject').textContent = state.subject || '—';
    alarm.classList.remove('hidden');
    playAlarm();
  }

  function dismissAlarm() {
    alarm.classList.add('hidden');
    // 響完後返去 live 畫面(已超時)
  }

  // ESC 關響鬧 / 點擊關響鬧
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !alarm.classList.contains('hidden')) {
      dismissAlarm();
    }
  });
  alarm.addEventListener('click', dismissAlarm);

  // ==================== 暫停 ====================
  function togglePause() {
    if (state.isPaused) {
      // 恢復
      state.pausedTotal += Date.now() - state.pausedAt;
      state.isPaused = false;
      $('pause-btn').textContent = '暫停';
      $('live-status').textContent = '考試中';
      $('live-status').classList.remove('paused');
      // 重設響鬧 timeout
      scheduleAlarm();
    } else {
      // 暫停
      state.pausedAt = Date.now();
      state.isPaused = true;
      $('pause-btn').textContent = '繼續';
      $('live-status').textContent = '已暫停';
      $('live-status').classList.add('paused');
    }
  }

  // ==================== 響鬧 timeout (用 setTimeout 確保唔會因 render lag 錯過) ====================
  let alarmTimeoutId = null;
  function scheduleAlarm() {
    if (alarmTimeoutId) clearTimeout(alarmTimeoutId);
    const ms = state.endEpoch - nowEpoch();
    if (ms > 0) {
      alarmTimeoutId = setTimeout(() => {
        triggerAlarm();
      }, ms);
    } else {
      triggerAlarm();
    }
  }

  // ==================== 啟動考試 ====================
  function startExam() {
    const subject = $('subject').value.trim() || '—';
    const startStr = $('start-time').value;
    const endStr = $('end-time').value;
    const durationStr = $('duration').value;
    const notice = $('notice').value.trim();
    const noticeSize = parseInt($('notice-size').value, 10) || 36;

    // 解析時間
    let startDate, endDate;
    const today = new Date();
    if (startStr && endStr) {
      const [sh, sm] = startStr.split(':').map(Number);
      const [eh, em] = endStr.split(':').map(Number);
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0);
      endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em, 0);
      // 過咗午夜?
      if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
    } else if (startStr && durationStr) {
      const [sh, sm] = startStr.split(':').map(Number);
      const dur = parseInt(durationStr, 10);
      if (!dur || dur < 1) {
        alert('請輸入有效嘅考試時長');
        return;
      }
      startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0);
      endDate = new Date(startDate.getTime() + dur * 60 * 1000);
    } else if (startStr) {
      alert('請輸入完卷時間或考試時長');
      return;
    } else {
      alert('請輸入開考時間');
      return;
    }

    // 開考時間已過? 自動從「現在」開始,但 endDate 仍跟用戶輸入
    let actualStart = startDate;
    const nowMs = Date.now();
    if (startDate.getTime() < nowMs) {
      // 用戶輸入嘅開考時間已過 → 從現在開始
      // 重新計算 endDate: 保留原 duration
      const originalDuration = endDate.getTime() - startDate.getTime();
      actualStart = new Date(nowMs);
      endDate = new Date(nowMs + originalDuration);
    }

    state.endEpoch = endDate.getTime();
    state.pauseEpoch = 0;
    state.pausedTotal = 0;
    state.pausedAt = 0;
    state.isPaused = false;
    state.alarmPlayed = false;
    state.subject = subject;
    state.slot = formatSlot(actualStart, endDate);
    state.notice = notice;

    // 切到 live 畫面
    setup.classList.add('hidden');
    live.classList.remove('hidden');

    $('live-subject').textContent = subject;
    $('live-slot').textContent = state.slot;
    $('live-notice').textContent = notice;
    $('live-notice').style.fontSize = noticeSize + 'px';
    $('pause-btn').textContent = '暫停';

    // 用戶互動後先創建 audio context
    ensureAudio();

    // 開始
    render();
    scheduleAlarm();
    state.rafId = requestAnimationFrame(tick);

    // 自動入全螢幕
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  // ==================== 結束 ====================
  function endExam() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    if (alarmTimeoutId) clearTimeout(alarmTimeoutId);
    state.alarmPlayed = true;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    live.classList.add('hidden');
    alarm.classList.add('hidden');
    setup.classList.remove('hidden');
  }

  // ==================== 事件綁定 ====================
  $('start-btn').addEventListener('click', startExam);
  $('pause-btn').addEventListener('click', togglePause);
  $('end-btn').addEventListener('click', () => {
    if (confirm('確定要結束考試?')) endExam();
  });
  $('fullscreen-btn').addEventListener('click', () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    }
  });

  // 備註字體大小 live preview
  $('notice-size').addEventListener('input', (e) => {
    $('notice-size-val').textContent = e.target.value + 'px';
  });

  // 分頁隱藏時唔好觸發響鬧中斷,但確保 render 仍基於真實時間
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !state.alarmPlayed) {
      render();  // 立即重新計算並 render
    }
  });

  // 鍵盤快捷鍵:在 live 畫面 Space = 暫停/繼續
  document.addEventListener('keydown', (e) => {
    if (live.classList.contains('hidden')) return;
    if (e.key === ' ') {
      e.preventDefault();
      togglePause();
    }
  });
})();
