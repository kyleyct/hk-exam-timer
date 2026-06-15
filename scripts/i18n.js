/**
 * i18n.js — 輕量國際化框架
 *
 * 設計重點:
 * 1. 0 依賴
 * 2. 字典以 JSON 檔案儲存 (zh-HK / en 等)
 * 3. HTML 元素加 data-i18n="key" 自動替換
 * 4. placeholder 加 data-i18n-placeholder="key"
 * 5. title / aria-label 加 data-i18n-title / data-i18n-aria
 * 6. 支援變數插值: t('greeting', { name: 'Mary' })
 * 7. localStorage 記低用戶選擇
 * 8. fallback: 冇翻譯時用 key 自身
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'w2_lang';
  const DEFAULT_LANG = 'zh-HK';
  const SUPPORTED = ['zh-HK', 'en'];
  const I18N_DIR = 'assets/i18n/';

  let dict = {};
  let currentLang = DEFAULT_LANG;
  let ready = false;

  /** 從 localStorage / 瀏覽器語言判斷默認 */
  function detectInitialLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const browser = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (browser.startsWith('en')) return 'en';
    return DEFAULT_LANG;
  }

  /** 載入字典 */
  async function loadLang(lang) {
    if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;
    try {
      const res = await fetch(`${I18N_DIR}${lang}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dict = await res.json();
      currentLang = lang;
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;  // <html lang="...">
      return true;
    } catch (e) {
      console.error(`[i18n] failed to load ${lang}:`, e);
      return false;
    }
  }

  /** 翻譯函數: 支援 {var} 插值 */
  function t(key, vars) {
    let s = dict[key];
    if (s === undefined) return key;  // fallback
    if (Array.isArray(s)) return s.join('\n');  // 多行
    if (vars && typeof s === 'string') {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return s;
  }

  /** 取得陣列翻譯 (for hint lists) */
  function tArr(key) {
    const s = dict[key];
    return Array.isArray(s) ? s : [];
  }

  /** 掃描 DOM,apply 所有 data-i18n-* attribute */
  function applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      // v0.3.1 fix: skip 任何有 form-control children (input/textarea/select)
      // 嘅 element — 之前用 textContent = 會清空所有 children, 包括 input,
      // 導致 #start-time / #end-time / #duration / #notice / #notice-size
      // 全部消失, 之後 timer.js bind() 返 null 然後 crash。
      if (el.querySelector('input, textarea, select')) {
        // 只更新第一個 text node (即 label 自己嘅文字), 保留後面嘅 input
        const key = el.getAttribute('data-i18n');
        const translated = t(key);
        // 將翻譯文字放喺 element 最前 (text node 在前, input 在後)
        // 用 firstChild.nodeValue 直接改 text, 唔觸碰其他 children
        if (el.firstChild && el.firstChild.nodeType === Node.TEXT_NODE) {
          el.firstChild.nodeValue = translated;
        } else {
          // 冇 text node 在前, prepend 一個
          el.insertBefore(document.createTextNode(translated), el.firstChild);
        }
        return;
      }
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    // 陣列類 (e.g. hint list)
    document.querySelectorAll('[data-i18n-list]').forEach(el => {
      const items = tArr(el.getAttribute('data-i18n-list'));
      // 清空再 append
      el.innerHTML = '';
      items.forEach(line => {
        const li = document.createElement('li');
        li.textContent = line;
        el.appendChild(li);
      });
    });
  }

  /** 切換語言 */
  async function setLang(lang) {
    if (lang === currentLang && ready) return;
    const ok = await loadLang(lang);
    if (ok) {
      applyAll();
      // 觸發自定義事件,其他模組可監聽 (e.g. notice font slider label)
      document.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang } }));
    }
  }

  /** 取得當前語言 */
  function getLang() { return currentLang; }

  /** 取得支援清單 */
  function getSupported() { return [...SUPPORTED]; }

  /** 初始化 */
  async function init() {
    const lang = detectInitialLang();
    const ok = await loadLang(lang);
    if (!ok) {
      console.warn('[i18n] using empty dict');
    }
    ready = true;
    applyAll();
  }

  // 暴露 API
  window.i18n = {
    init, setLang, t, tArr, getLang, getSupported,
    isReady: () => ready,
  };

  // 自動 init (DOMContentLoaded 之後)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
