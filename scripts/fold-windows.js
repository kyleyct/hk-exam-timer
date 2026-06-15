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
  // v0.3.2 rev 8: countdown 喺中央, notice 喺 countdown 下方 120px
  const DEFAULT_LAYOUT = {
    'info':     { anchor: 'top',    align: 'center', w: '60vw',  h: 96,   minimized: false },
    'countdown':{ anchor: 'center', align: 'center', w: '50vw',  h: '60vh',minimized: false },
    'notice':   { anchor: 'top',    align: 'center', w: '70vw',  h: 200,  minimized: false },
    'controls': { anchor: 'bottom', align: 'center', w: '100vw', h: 72,   minimized: false },
  };

  // 將 anchor 轉成 base top/left/right/bottom (without offset)
  function baseBoxPosition(cfg) {
    // 用 margin: auto + position absolute 嚟處理 center
    let top = 'auto', left = 'auto', right = 'auto', bottom = 'auto';
    if (cfg.anchor === 'top') top = '24px';
    else if (cfg.anchor === 'center') {
      top = '0'; bottom = '0';
    } else if (cfg.anchor === 'bottom') bottom = '0';

    if (cfg.align === 'left') left = '24px';
    else if (cfg.align === 'right') right = '24px';
    else {
      // center: 用 margin: auto 自動置中
      left = '0'; right = '0';
    }
    return { top, left, right, bottom };
  }

  // 套用 offset 到 element top/left
  function applyOffset(el, cfg) {
    const base = baseBoxPosition(cfg);
    const dx = cfg._offsetX || 0;
    const dy = cfg._offsetY || 0;

    if (cfg.anchor === 'top') el.style.top = (24 + dy) + 'px';
    else if (cfg.anchor === 'center') {
      el.style.top = dy + 'px';
      el.style.bottom = (-dy) + 'px';
    } else if (cfg.anchor === 'bottom') el.style.bottom = (-dy) + 'px';

    if (cfg.align === 'left') el.style.left = (24 + dx) + 'px';
    else if (cfg.align === 'right') el.style.right = (-dx) + 'px';
    else {
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
      const base = baseBoxPosition(cfg);
      el.style.top = base.top;
      el.style.left = base.left;
      el.style.right = base.right;
      el.style.bottom = base.bottom;
      el.style.margin = 'auto';

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

      // 套用 user offset
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
