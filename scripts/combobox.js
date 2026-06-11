/**
 * combobox.js — 自製 combobox 組件
 *
 * 設計:
 * - 搜尋式: 鍵入即 filter 選項
 * - 自由輸入: 冇 match 都可以 submit (即係「其他」自動新增)
 * - 鍵盤: ↑↓ 移動, Enter 確認, Esc 關閉
 * - Touch-friendly
 *
 * 數據源: 內嵌嘅 SUBJECTS / PAPERS 陣列 (階段 1 簡化版, 之後可改為 JSON)
 *
 * 注意: 科目標籤需要本地化 (zh-HK + en 雙語), 用 window.i18n 處理
 */

(function () {
  'use strict';

  // ==================== Subject list (EDB 對齊) ====================
  // 結構: { zh, en, category, ... }
  // category: primary / elective / junior / primary
  const SUBJECTS = [
    // === 小學 (Primary) ===
    { zh: '中國語文', en: 'Chinese', category: 'primary' },
    { zh: '英國語文', en: 'English', category: 'primary' },
    { zh: '數學', en: 'Mathematics', category: 'primary' },
    { zh: '常識', en: 'General Studies', category: 'primary' },
    { zh: '視覺藝術', en: 'Visual Arts', category: 'primary' },
    { zh: '音樂', en: 'Music', category: 'primary' },
    { zh: '體育', en: 'Physical Education', category: 'primary' },
    { zh: '普通話', en: 'Putonghua', category: 'primary' },

    // === 初中 (Junior Secondary) ===
    { zh: '中國歷史', en: 'Chinese History', category: 'junior' },
    { zh: '地理', en: 'Geography', category: 'junior' },
    { zh: '生活與社會', en: 'Life and Society', category: 'junior' },
    { zh: '科學', en: 'Science', category: 'junior' },
    { zh: '家政', en: 'Home Economics', category: 'junior' },
    { zh: '設計與工藝', en: 'Design and Technology', category: 'junior' },
    { zh: '資訊科技', en: 'Information Technology', category: 'junior' },

    // === 高中 DSE (Senior Secondary) ===
    { zh: '公民與社會發展', en: 'Citizenship and Social Development', category: 'elective' },
    { zh: '物理', en: 'Physics', category: 'elective' },
    { zh: '化學', en: 'Chemistry', category: 'elective' },
    { zh: '生物', en: 'Biology', category: 'elective' },
    { zh: '經濟', en: 'Economics', category: 'elective' },
    { zh: '歷史', en: 'History', category: 'elective' },
    { zh: '中國文學', en: 'Chinese Literature', category: 'elective' },
    { zh: '英語文學', en: 'English Literature', category: 'elective' },
    { zh: '視覺藝術科', en: 'Visual Arts (DSE)', category: 'elective' },
    { zh: '企業、會計與財務概論', en: 'Business, Accounting and Financial Studies', category: 'elective' },
    { zh: '設計與應用科技', en: 'Design and Applied Technology', category: 'elective' },
    { zh: '健康管理與社會關懷', en: 'Health Management and Social Care', category: 'elective' },
    { zh: '資訊及通訊科技', en: 'Information and Communication Technology', category: 'elective' },
    { zh: '科技與生活', en: 'Technology and Living', category: 'elective' },
    { zh: '旅遊與款待', en: 'Tourism and Hospitality Studies', category: 'elective' },
    { zh: '倫理與宗教', en: 'Ethics and Religious Studies', category: 'elective' },
    { zh: '體育科', en: 'Physical Education (DSE)', category: 'elective' },
    { zh: '音樂科', en: 'Music (DSE)', category: 'elective' },
  ];

  // ==================== Paper list ====================
  const PAPERS = [
    { zh: '卷一', en: 'Paper 1' },
    { zh: '卷二', en: 'Paper 2' },
    { zh: '卷三', en: 'Paper 3' },
    { zh: '多項選擇題', en: 'Multiple Choice' },
    { zh: '寫作', en: 'Writing' },
    { zh: '閱讀', en: 'Reading' },
    { zh: '聆聽', en: 'Listening' },
    { zh: '口試', en: 'Speaking' },
    { zh: '實驗 / 實務', en: 'Practical' },
    { zh: '聆聽及綜合能力', en: 'Listening & Integrated Skills' },
  ];

  // ==================== 通用 combobox factory ====================
  function createCombobox(input, list, options) {
    const items = options.items || [];
    const lang = () => (window.i18n ? window.i18n.getLang() : 'zh-HK');

    let activeIdx = -1;
    let currentMatches = [];

    function showAll() {
      renderList('');
    }

    function renderList(query) {
      const q = query.trim().toLowerCase();
      let matches;
      if (!q) {
        matches = items.slice();
      } else {
        matches = items.filter(it => {
          const text = `${it.zh || ''} ${it.en || ''}`.toLowerCase();
          return text.includes(q);
        });
      }
      currentMatches = matches;
      activeIdx = -1;

      list.innerHTML = '';

      if (!matches.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = q ? `「${query}」(新增自訂)` : '無選項';
        list.appendChild(li);
      } else {
        matches.forEach((it, i) => {
          const li = document.createElement('li');
          const isEn = lang() === 'en';
          if (isEn && it.en) {
            li.innerHTML = `${esc(it.en)}${it.zh ? `<span class="item-sub">${esc(it.zh)}</span>` : ''}`;
          } else {
            li.innerHTML = `${esc(it.zh)}${it.en ? `<span class="item-en">${esc(it.en)}</span>` : ''}`;
          }
          li.addEventListener('mousedown', (e) => {
            e.preventDefault();
            input.value = isEn ? (it.en || it.zh) : (it.zh || it.en);
            list.hidden = true;
          });
          list.appendChild(li);
        });
      }
      list.hidden = false;
    }

    function highlight(idx) {
      [...list.children].forEach((li, i) => {
        li.classList.toggle('active', i === idx);
      });
    }

    // 輸入即 filter
    input.addEventListener('input', () => {
      renderList(input.value);
    });

    input.addEventListener('focus', () => {
      renderList(input.value);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => { list.hidden = true; }, 120);
    });

    input.addEventListener('keydown', (e) => {
      if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        renderList(input.value);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentMatches.length) {
          activeIdx = (activeIdx + 1) % currentMatches.length;
          highlight(activeIdx);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentMatches.length) {
          activeIdx = (activeIdx - 1 + currentMatches.length) % currentMatches.length;
          highlight(activeIdx);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && currentMatches[activeIdx]) {
          const it = currentMatches[activeIdx];
          const isEn = lang() === 'en';
          input.value = isEn ? (it.en || it.zh) : (it.zh || it.en);
        }
        list.hidden = true;
      } else if (e.key === 'Escape') {
        list.hidden = true;
      }
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ==================== 初始化 ====================
  function init() {
    const subjectInput = document.getElementById('subject');
    const subjectList = document.getElementById('subject-list');
    const paperInput = document.getElementById('paper');
    const paperList = document.getElementById('paper-list');

    if (subjectInput && subjectList) {
      createCombobox(subjectInput, subjectList, { items: SUBJECTS });
    }
    if (paperInput && paperList) {
      createCombobox(paperInput, paperList, { items: PAPERS });
    }
  }

  // 暴露 SUBJECTS / PAPERS for debugging
  window.SUBJECTS = SUBJECTS;
  window.PAPERS = PAPERS;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
