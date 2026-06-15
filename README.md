# 校園考試計時器

> 為香港教師設計的考試計時器。**雙擊 `index.html` 即可使用。**

[![授權: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![為香港教師而設](https://img.shields.io/badge/Made%20for-HK%20Teachers-orange.svg)](#)

## 一句話總結

考試時開啟瀏覽器，自動倒數、自動響鬧、可顯示試場公告（題目更改等），純前端、零依賴、可離線運作。

## 使用方法

1. 下載 ZIP
2. 雙擊 `index.html`
3. 輸入科目、卷別、開考時間、考試時長
4. 按「開始考試」→ 自動進入全螢幕模式

或前往 [GitHub Pages 示範](https://kyleyct.github.io/hk-exam-timer/) 使用線上版本（如已啟用）。

## 設計理念

> 學校試場所需的計時器，與一般時鐘應用程式截然不同。

| 一般時鐘應用程式 | 校園考試計時器 |
|---|---|
| 字體細小，後排難以辨識 | 120-320 像素特大字體 |
| 沒有考試時段標示 | 顯示「HH:MM - HH:MM」 |
| 沒有公告欄位（題目更改）| 特大字體公告，字級可調 |
| 響鬧需手動設定多組 | 一鍵啟動、暫停、結束 |
| 分頁隱藏後可能失準 | 採用 `Date.now()` 真實時鐘，不受影響 |
| 系統靜音時無法聽到 | 使用 Web Audio API，系統靜音時仍可聽到 |

## 功能

- 開考 + 完卷時間 / 開考 + 時長 兩種輸入模式
- 特大字體倒數（自動按螢幕大小縮放）
- 考試時段顯示（HH:MM - HH:MM）
- 科目 + 卷別（搜尋式選單，內置香港中小學及 DSE 課程）
- 試場公告（題目更改 / 場地提示）— 特大字體，可即時編輯，字級可調
- 響鬧（時間到 + 全螢幕綠色 + 「結束考試」停止）
- 5 分鐘前黃色提示、0 分鐘紅色閃爍、超時灰階顯示
- 暫停 / 繼續（空白鍵）
- 全螢幕模式
- 響鬧使用 Web Audio API，系統靜音時仍可聽到
- 純前端 / 可離線 / 零依賴
- 多語言（繁體中文 / 英文）— 可即時切換

## 計時可靠度

考試計時最忌「分頁被暫停 / 系統休眠 / 切換至後台 → 返抵後失準」。

本工具的處理方法：

- **單一時間基準**：`Date.now()`（真實時鐘），不依賴 `setInterval` 累加
- **響鬧觸發**：`setTimeout(endEpoch - now)`，到時即觸發，不依賴輪詢
- **分頁隱藏**：`visibilitychange` 事件，返抵後即時以 `Date.now()` 重新校驗
- **響鬧音**：Web Audio 振盪器（oscillator），不依賴 `<audio>` 自動播放（會被瀏覽器阻擋）

理論上，不論分頁隱藏多久、系統休眠多久，返抵後時間依然準確。

## 響鬧詳情

- **顏色**：綠色（取代傳統紅色，較溫和）
- **節奏**：1 秒嗶聲 + 0.5 秒靜默，循環直至用戶按「結束考試」
- **音量**：使用 Web Audio gain 控制，於用戶手勢後啟動（避免自動播放限制）
- **試響按鈕**：設定畫面提供「🔊 試響」按鈕，方便考試日前確認聲響正常

## 私隱

- 純前端，**無任何資料上傳**
- 不使用 cookie、不使用 localStorage（語言偏好除外）
- 關閉分頁後所有資料即時清除

## 開發

純 HTML + CSS + 原生 JavaScript，**無建置步驟**。
開啟 `index.html` 即可修改，修改後推送即生效（GitHub Pages 自動部署）。

### 檔案結構

```
w2-exam-timer/
├── index.html
├── assets/
│   ├── style.css
│   └── i18n/
│       ├── zh-HK.json     # 繁體中文 (預設)
│       └── en.json        # 英文
└── scripts/
    ├── i18n.js            # 國際化框架
    ├── combobox.js        # 搜尋式選單組件
    └── timer.js           # 計時器核心邏輯
```

### 多語言

採用輕量自製 i18n 框架：

- 字典檔案：`assets/i18n/{語言}.json`
- 翻譯函數：`window.i18n.t('key')`
- DOM 應用：HTML 元素加 `data-i18n="key"` 屬性，自動替換文字
- 變數插值：`t('greeting', { name: '老師' })`
- 偏好儲存：`localStorage['w2_lang']`

新增語言的方法：於 `assets/i18n/` 增添 JSON 檔案，並於 `scripts/i18n.js` 的 `SUPPORTED` 陣列中登記。

### 自訂版面 (Fold Windows)

考試畫面嘅 4 個視窗 (info / countdown / notice / controls) 嘅位置、大小、摺疊狀態都係**完全可自訂**。

**用戶層面 (UI 操作)：**
- 拖曳視窗頂部 title bar 移動
- 拖曳視窗右下角調整大小
- 點擊視窗右上角 `▾` 摺疊/展開 (notice 視窗)
- 點擊畫面右上角 `⟳` 一鍵重設所有視窗至預設值
- 設定自動儲存至 `localStorage['w2_window_layout']`,reload 後保留

**開發者層面 (修改預設版面):**

打開 `scripts/fold-windows.js`, 修改 `DEFAULT_LAYOUT` 物件:

```js
const DEFAULT_LAYOUT = {
  'info':     { anchor: 'top',             align: 'center', w: '60vw',  h: 96,   minimized: false },
  'countdown':{ anchor: 'center',          align: 'center', w: '50vw',  h: '60vh',minimized: false },
  'notice':   { anchor: 'above-controls',  align: 'center', w: '70vw',  h: 160,  minimized: false },
  'controls': { anchor: 'bottom',          align: 'center', w: '100vw', h: 72,   minimized: false },
};
```

可選 anchor 選項：
- `top`: 視窗釘住頂部 (24px)
- `center`: 視窗垂直水平置中
- `bottom`: 視窗釘住底部 (0px)
- `above-controls`: 視窗喺 controls 視窗之上 (88px 預留空間)

可選 align 選項：
- `left`: 視窗釘住左側 (24px)
- `center`: 視窗水平置中
- `right`: 視窗釘住右側 (24px)

可選 size：
- 字串 `'60vw'`、`'60vh'` → 視窗/螢幕百分比
- 數字 `480` → 像素

**自訂範例 (教師將倒數視窗放大置左):**
```js
'countdown':{ anchor: 'center', align: 'left', w: '60vw', h: '70vh', minimized: false },
```

**自訂範例 (將所有視窗垂直堆疊喺左側):**
```js
'info':     { anchor: 'top',    align: 'left', w: '40vw', h: 80,  minimized: false },
'countdown':{ anchor: 'center', align: 'left', w: '40vw', h: '50vh', minimized: false },
'notice':   { anchor: 'top',    align: 'left', w: '40vw', h: 200, minimized: false },
'controls': { anchor: 'bottom', align: 'left', w: '40vw', h: 72,  minimized: false },
```

完成後用戶需清 `localStorage['w2_window_layout']` 或按畫面右上角 `⟳` 重設,新預設值先生效。

**自訂樣式 (CSS):**

- 大字時鐘字體：`assets/style.css` 嘅 `.fold-countdown .big-time` (用 `cqi` 跟 container 寬度)
- 顏色主題：搜索 `rgba(...)` 即可改黑底配色
- 字體大小：`.big-time` 嘅 `clamp(32px, 12cqi, 160px)` 改 min/max

## 已知限制

- 響鬧音依賴 Web Audio API（Safari 14+、Chrome 全支援；IE 不支援）
- 第一次進入考試畫面時，瀏覽器可能詢問「允許全螢幕」
- iOS Safari 對 Web Audio 自動播放有限制，必須於用戶互動後啟動（本工具已於開始考試按鈕內啟動）
- 響鬧使用 Web Audio 振盪器，並非錄製音檔；音調固定為 880 Hz（A5 音高），可由用戶調節音量但無法更換音樂

## 授權

MIT

## 致謝

本工具為「**8 週 AI × 教育**」公開專案計劃的第二個工具。

- 其他工具：[W1 全港學校列表](#) / [8 週總集](#)
- 由 [Kyle Yeung](https://github.com/kyleyct) 製作 · 2026
