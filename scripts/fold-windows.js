/**
 * fold-windows.js — 4 個 fold window 嘅 layout + drag/resize
 *
 * v0.3.2 rev 8 — 簡化重構:
 *  - 捨棄 CSS transform: translate(-50%, -50%) center-anchor
 *  - 改用 position: absolute + top/left/right/bottom + margin: auto centering
 *  - drag 直接 increment _offsetX/_offsetY, base 設 top/left, final = base + offset
 *  - anchor 永遠保留, 唔再亂跳
 *  - reload 自動用 anchor + offset 還原
 *
 * Layout 結構:
 *   {
 *     anchor: 'top' | 'center' | 'bottom',
 *     align:  'left' | 'center' | 'right',
 *     w:  ...,
 *     h:  ...,
 *     _w: <number> | null, _h: <number> | null,
 *     _offsetX: <number>, _offsetY: <number>,
 *     minimized: bool,
 *   }
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'w2_window_layout';

  // 預設版面
  // v0.3.2 rev 9: 4 個 anchor 互唔重疊
  //   - info     : 頂部 24px (考試時段)
  //   - countdown: 中央 (大倒數)
  //   - notice   : countdown 下方 120px (或 controls 之上 80px)
  //   - controls : 底部 0
  const DEFAULT_LAYOUT = {
    'info':     { anchor: 'top',         align: 'center', w: '60vw',  h: 96,   minimized: false },
    'countdown':{ anchor: 'center',      align: 'center', w: '50vw',  h: '60vh',minimized: false },
    'notice':   { anchor: 'above-controls', align: 'center', w: '70vw', h: 160, minimized: false },
    'controls': { anchor: 'bottom',      align: 'center', w: '100vw', h: 72,   minimized: false },
  };

  // 將 anchor 轉成 base top/left/right/bottom (without offset)
  function baseBoxPosition(cfg) {
    let top = 'auto', left = 'auto', right = 'auto', bottom = 'auto';
    if (cfg.anchor === 'top') top = '24px';
    else if (cfg.anchor === 'center') {
      top = '0'; bottom = '0';
    } else if (cfg.anchor === 'above-controls') {
      // 喺 controls (h ~ 72) 之上
      bottom = '88px';
    } else if (cfg.anchor === 'bottom') bottom = '0';

    if (cfg.align === 'left') left = '24px';
    else if (cfg.align === 'right') right = '24px';
    else {
      left = '0'; right = '0';
    }
    return { top, left, right, bottom };
  }

  // 套用 offset 到 element top/left
  // 將 base anchor value + user offset 結合寫入 element style
  // 注意: anchor value 從 baseBoxPosition 嚟, 確保 anchor 同 offset 分離
  function applyOffset(el, cfg) {
    const base = baseBoxPosition(cfg);
    const dx = cfg._offsetX || 0;
    const dy = cfg._offsetY || 0;

    // 解析 base 嘅 number (例如 '24px' -> 24)
    const px = (v) => parseInt(v, 10) || 0;

    if (cfg.anchor === 'top') {
      el.style.top = (px(base.top) + dy) + 'px';
    } else if (cfg.anchor === 'center') {
      el.style.top = dy + 'px';
      el.style.bottom = (-dy) + 'px';
    } else if (cfg.anchor === 'above-controls') {
      // base 為 bottom: 88px, dy 為正向下移
      el.style.bottom = (px(base.bottom) - dy) + 'px';
    } else if (cfg.anchor === 'bottom') {
      // base 為 bottom: 0, dy 為正向上移 (因為 bottom 愈大愈上)
      el.style.bottom = (-dy) + 'px';
    }

    if (cfg.align === 'left') {
      el.style.left = (px(base.left) + dx) + 'px';
    } else if (cfg.align === 'right') {
      // base 為 right: 24px, dx 為正向左移 (因為 right 愈大愈左)
      el.style.right = (px(base.right) - dx) + 'px';
    } else {
      // center: left/right 都 0, dx 正向左右擴 (margin auto)
      el.style.left = dx + 'px';
      el.style.right = (-dx) + 'px';
    }
    el.style.margin = 'auto';
  }

  function applyLayout() {
    document.querySelectorAll('.fold-window').forEach(el => {
      const name = el.dataset.window;
      if (!name || !layout[name]) return;
      const cfg = layout[name];

      el.style.position = 'absolute';

      // size (user override 優先)
      const MIN_W = 360, MIN_H = 120;
      const w = (cfg._w != null) ? cfg._w : cfg.w;
      const h = (cfg._h != null) ? cfg._h : cfg.h;
      if (typeof w === 'string' && w.endsWith('vw')) {
        el.style.width = w;
      } else if (typeof w === 'number') {
        el.style.width = Math.max(w, MIN_W) + 'px';
      }
      if (typeof h === 'string' && h.endsWith('vh')) {
        el.style.height = h;
      } else if (typeof h === 'number') {
        el.style.height = Math.max(h, MIN_H) + 'px';
      }

      // 摺疊
      el.classList.toggle('minimized', cfg.minimized);
      const toggle = el.querySelector('.window-toggle');
      if (toggle) toggle.textContent = cfg.minimized ? '▴' : '▾';

      // 套用 anchor + offset (applyOffset 處理 base + offset)
      applyOffset(el, cfg);
    });
  }

  // ==================== Layout IO ====================
  let layout = loadLayout();

  function sanitizeLayout(saved) {
    const out = {};
    for (const k of Object.keys(DEFAULT_LAYOUT)) {
      const def = DEFAULT_LAYOUT[k];
      const s = saved[k] || {};
      out[k] = {
        anchor: s.anchor || def.anchor,
        align:  s.align  || def.align,
        w: s.w || def.w,
        h: s.h || def.h,
        _w: Number.isFinite(s._w) ? s._w : null,
        _h: Number.isFinite(s._h) ? s._h : null,
        _offsetX: Number.isFinite(s._offsetX) ? s._offsetX : 0,
        _offsetY: Number.isFinite(s._offsetY) ? s._offsetY : 0,
        minimized: !!s.minimized,
      };
    }
    return out;
  }

  function loadLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return sanitizeLayout(saved);
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

  // ==================== Interact.js ====================
  function initInteract() {
    if (typeof interact === 'undefined') {
      console.error('[fold-windows] Interact.js not loaded');
      return;
    }

    interact.dynamicDrop(true);

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
          const name = target.dataset.window;
          if (!name || !layout[name]) return;
          layout[name]._offsetX = (layout[name]._offsetX || 0) + event.dx;
          layout[name]._offsetY = (layout[name]._offsetY || 0) + event.dy;
          applyOffset(target, layout[name]);
        },
        end(event) {
          event.target.classList.remove('dragging');
          saveLayout();
        }
      }
    }).resizable({
      edges: { left: false, right: true, top: false, bottom: true },
      margin: 8,
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
          const name = target.dataset.window;
          if (!name || !layout[name]) return;
          target.style.width = event.rect.width + 'px';
          target.style.height = event.rect.height + 'px';
          layout[name]._w = event.rect.width;
          layout[name]._h = event.rect.height;
        },
        end(event) {
          event.target.classList.remove('resizing');
          saveLayout();
        }
      }
    });

    interact('.window-resize').styleCursor(false);
  }

  // ==================== Toggle (notice 摺疊) ====================
  function initToggle() {
    document.querySelectorAll('.window-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const win = toggle.closest('.fold-window');
        if (!win) return;
        const name = win.dataset.window;
        if (!name || !layout[name]) return;

        const isMinimized = win.classList.toggle('minimized');
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
