/**
 * fold-windows.js — Fold Window 系統 (Interact.js 版本)
 *
 * 設計:
 * - 使用 Interact.js (BSD-3-Clause, ~98KB) 做 draggable + resizable
 * - 4 個視窗: info (頂), countdown (中央), notice (底, 可摺疊), controls (底)
 * - localStorage 記低每個視窗嘅 x/y/width/height/minimized
 * - 預設版面: 開考時或按重設時用
 * - 響鬧時 fold windows 仍可見 (alarm screen 半透明覆蓋)
 *
 * 預設 layout:
 * - info: 頂部中央, 寬 60%, 高 80px
 * - countdown: 中央, 寬 50%, 高 60%
 * - notice: 倒數下方, 寬 70%, 高 200px (可摺疊)
 * - controls: 底部, 全寬, 高 70px
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'w2_window_layout';
  const MIN_W = 200;
  const MIN_H = 60;

  // 預設版面
  const DEFAULT_LAYOUT = {
    'info': { x: 'center-x', y: 16, w: '60vw', h: 80, minimized: false },
    'countdown': { x: 'center-x', y: 'center-y', w: '50vw', h: '60vh', minimized: false },
    'notice': { x: 'center-x', y: 'notice-y', w: '70vw', h: 200, minimized: false },
    'controls': { x: 'center-x', y: 'controls-y', w: '100vw', h: 70, minimized: false },
  };

  let layout = loadLayout();

  function loadLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const result = {};
      for (const k of Object.keys(DEFAULT_LAYOUT)) {
        result[k] = { ...DEFAULT_LAYOUT[k], ...(saved[k] || {}) };
      }
      return result;
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    }
  }

  function saveLayout() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (e) {
      console.warn('[fold-windows] save failed:', e);
    }
  }

  // ==================== 套用 layout ====================
  function applyLayout() {
    document.querySelectorAll('.fold-window').forEach(el => {
      const name = el.dataset.window;
      if (!name || !layout[name]) return;
      const cfg = layout[name];

      // 位置
      el.style.position = 'absolute';
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';

      // 計算 y 錨點
      if (cfg.y === 'center-y') {
        el.style.top = '50%';
        el.style.transform = 'translate(-50%, -50%)';
      } else if (cfg.y === 'notice-y') {
        // 倒數視窗下方
        el.style.top = '';
        el.style.bottom = '110px';
        el.style.transform = 'translateX(-50%)';
      } else if (cfg.y === 'controls-y') {
        el.style.top = '';
        el.style.bottom = '0';
        el.style.transform = 'translateX(-50%)';
      } else {
        el.style.top = cfg.y + 'px';
        el.style.transform = 'translateX(-50%)';
      }

      // 計算 x
      if (cfg.x === 'center-x' || cfg.y === 'center-y' || cfg.y === 'notice-y' || cfg.y === 'controls-y') {
        el.style.left = '50%';
      } else {
        el.style.left = cfg.x + 'px';
      }

      // 大小
      if (typeof cfg.w === 'string' && cfg.w.endsWith('vw')) {
        el.style.width = cfg.w;
      } else if (typeof cfg.w === 'number') {
        el.style.width = cfg.w + 'px';
      }
      if (typeof cfg.h === 'string' && cfg.h.endsWith('vh')) {
        el.style.height = cfg.h;
      } else if (typeof cfg.h === 'number') {
        el.style.height = cfg.h + 'px';
      }

      // 摺疊
      el.classList.toggle('minimized', cfg.minimized);
      const toggle = el.querySelector('.window-toggle');
      if (toggle) toggle.textContent = cfg.minimized ? '▴' : '▾';
    });
  }

  // ==================== Interact.js 設定 ====================
  function initInteract() {
    if (typeof interact === 'undefined') {
      console.error('[fold-windows] Interact.js not loaded');
      return;
    }

    // 預設 allowEvery: 視窗、handle、resize-grip 都可互動
    interact.dynamicDrop(true);

    // 全部 fold-window 都可 drag
    interact('.fold-window').draggable({
      allowFrom: '[data-drag-handle]',
      ignoreFrom: '[data-resize-handle], button, input, textarea, [contenteditable], .combobox-list',
      inertia: false,
      listeners: {
        start(event) {
          event.target.classList.add('dragging');
        },
        move(event) {
          const target = event.target;
          const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
          const y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
          target.style.transform = `translate(${x}px, ${y}px)`;
          target.setAttribute('data-x', x);
          target.setAttribute('data-y', y);
        },
        end(event) {
          event.target.classList.remove('dragging');
          const name = event.target.dataset.window;
          if (!name) return;

          // Save new position (remove from CSS anchor)
          const x = parseFloat(event.target.getAttribute('data-x')) || 0;
          const y = parseFloat(event.target.getAttribute('data-y')) || 0;
          // Save as 'tl' (top-left pixel-anchored)
          layout[name].x = 'tl';
          layout[name].y = 'tl';
          layout[name]._x = x;
          layout[name]._y = y;
          saveLayout();
        }
      }
    }).resizable({
      edges: { left: false, right: true, top: false, bottom: true },
      margin: 8,
      // v0.3.2: 強制 min size, 防止用戶縮太細導致大字被切走
      modifiers: [
        interact.modifiers.restrictSize({
          min: { width: 360, height: 120 }
        })
      ],
      listeners: {
        start(event) {
          event.target.classList.add('resizing');
        },
        move(event) {
          const target = event.target;
          let x = parseFloat(target.getAttribute('data-x')) || 0;
          let y = parseFloat(target.getAttribute('data-y')) || 0;
          target.style.width = event.rect.width + 'px';
          target.style.height = event.rect.height + 'px';
          x += event.deltaRect.left;
          y += event.deltaRect.top;
          target.setAttribute('data-x', x);
          target.setAttribute('data-y', y);
          target.style.transform = `translate(${x}px, ${y}px)`;
        },
        end(event) {
          event.target.classList.remove('resizing');
          const name = event.target.dataset.window;
          if (!name) return;
          layout[name]._w = event.rect.width;
          layout[name]._h = event.rect.height;
          saveLayout();
        }
      }
    });

    // Resize grip indicator
    interact('.window-resize').styleCursor(false);
  }

  // ==================== Toggle (notice 摺疊) ====================
  function initToggle() {
    document.querySelectorAll('.window-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const window = toggle.closest('.fold-window');
        if (!window) return;
        const name = window.dataset.window;
        if (!name) return;

        const isMinimized = window.classList.toggle('minimized');
        toggle.textContent = isMinimized ? '▴' : '▾';
        layout[name].minimized = isMinimized;
        saveLayout();
      });
    });
  }

  // ==================== Reset ====================
  function initReset() {
    const btn = document.getElementById('reset-windows-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const lang = window.i18n ? window.i18n.getLang() : 'zh-HK';
      const msg = lang === 'en' ? 'Reset all window positions to defaults?' : '重設所有視窗位置至預設值？';
      if (confirm(msg)) {
        layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
        saveLayout();
        // 清除 transform 累積
        document.querySelectorAll('.fold-window').forEach(el => {
          el.removeAttribute('data-x');
          el.removeAttribute('data-y');
        });
        applyLayout();
      }
    });
  }

  // ==================== Init ====================
  function init() {
    initInteract();
    initToggle();
    initReset();
    applyLayout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
