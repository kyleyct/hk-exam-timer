# 校園考試計時器

> 為香港老師而設嘅考試計時器。**雙擊 `index.html` 就用得**。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Made for HK Teachers](https://img.shields.io/badge/Made%20for-HK%20Teachers-orange.svg)](#)

## 一句話總結

考試時開個瀏覽器，自動倒數、自動響鬧、可顯示試場備註（題目更改等），純前端、零依賴、可離線用。

## 點用

1. 下載個 zip
2. 雙擊 `index.html`
3. 輸入科目、開考時間、考試時長
4. 按「開始考試」 → 自動入全螢幕

或者去 [GitHub Pages demo](https://kyleyct.github.io/hk-exam-timer/) 用 online 版（如果你開咗嘅話）。

## 點解做呢個

> 學校試場用嘅計時器，唔係普通時鐘 app。

| 普通時鐘 app | 校園考試計時器 |
|---|---|
| 細字體，後排睇唔到 | 120-320px 大字體 |
| 冇考試時段標示 | 顯示「HH:MM - HH:MM」|
| 冇備註欄（題目更改）| 大字體備註，可調字級 |
| 響鬧要 set 多個 | 一鍵開/暫停/結束 |
| 分頁隱藏可能失準 | 用 `Date.now()` 真實時鐘，唔受影響 |
| 系統靜音聽唔到 | Web Audio API，系統靜音都聽到 |

## 功能

- 開考 + 完卷時間 / 開考 + 時長 兩種輸入模式
- 大字體倒數（自動按螢幕大小縮放）
- 考試時段顯示（HH:MM - HH:MM）
- 科目顯示（內置 17 個 DSE 常用科目預設）
- 備註欄（題目更改 / 場地提示）— 大字體 + 可調字級
- 響鬧（時間到 + 全屏紅色 + ESC 關閉）
- 5 分鐘前黃色提示、0 分鐘紅色閃爍
- 暫停 / 繼續（Space 鍵）
- 全螢幕模式
- 系統靜音都聽到（Web Audio API）
- 純前端 / 可離線 / 零依賴

## 計時可靠度（重點）

考試計時最怕「分頁被 suspend / 系統休眠 / 切去後台 → 返嚟失準」。

呢個工具嘅做法：
- **單一時間基準**：`Date.now()`（真實時鐘），唔靠 `setInterval` 累加
- **響鬧觸發**：`setTimeout(endEpoch - now)`，到時即觸發，唔靠輪詢
- **分頁隱藏**：`visibilitychange` 事件，返嚟即時用 `Date.now()` 重新校驗
- **響鬧音**：Web Audio oscillator，唔靠 `<audio>` 自動播放（會被瀏覽器 block）

理論上，無論分頁隱藏幾耐、系統休眠幾耐，返嚟時間都準。

## 隱私

- 純前端，**冇任何資料上傳**
- 唔用 cookie、唔用 localStorage
- 關咗個 tab 全部嘢冇晒

## 開發

純 HTML + CSS + Vanilla JS，**冇 build step**。
打開 `index.html` 就能改，改完 push 即生效。

## 已知限制

- 響鬧音依賴 Web Audio API（Safari 14+、Chrome 全支援；IE 唔支援）
- 第一次進入 live 畫面時，瀏覽器可能問「允許全螢幕」

## License

MIT

## 致謝

呢個係「**8 週 AI × 教育**」公開專案計劃嘅第二個工具。
其他工具：[W1 全港學校列表](https://github.com/kyleyct/hk-schools) / [8 週總集](https://github.com/kyleyct/8-weeks-ai-edu)

由 [Kyle Yeung](https://github.com/kyleyct) 製作 · 2026
