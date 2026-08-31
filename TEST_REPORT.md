# 驗證紀錄 — 2026-08-31

本機 Next.js production server：`http://127.0.0.1:3000`。
真實 PostgreSQL 18.4：loopback `127.0.0.1:54329`，資料保存在 `.runtime/postgres`。

| 檢查 | 實際結果 |
| --- | --- |
| Dependencies | 已安裝，package-lock.json 已保存 |
| Prisma schema | 24 個模型；已 generate 與 typecheck |
| Migrations | 2 次 migration 已實際套用，保留資料 |
| Demo seed | 10 客戶、2 供應商、8 商品、18 規格、3 價格等級、36 歷史訂單；另保留有 TEST 標記的整合測試歷史 |
| ESLint | 通過，0 errors、0 warnings |
| TypeScript | 通過 |
| Vitest | 12 / 12 通過 |
| Production build | Next.js 16.3.3 build 成功；動態頁面/API/PDF 路由均完成 |
| Production 整合測試 | 110 / 110 通過；使用實際 PostgreSQL、HTTP 與登入 cookie |
| 套件安全掃描 | npm audit：0 vulnerabilities（當次掃描結果） |
| PDF | 客戶、內部、供應商、報價 4 種 PDF 成功下載，A4 與繁體中文渲染檢視通過 |
| 正式發布防護 | launch:check 正確拒絕 Demo、未填法律資料、未確認網域與供應商授權；預期的拒絕，不代表已合規 |

## 整合測試內容

透過管理員 API 建立 TEST 供應商、匯入 TEST 商品、建立兩家獨立 TEST 客戶及專屬價格，再以客戶登入建立訂單。驗證客戶價格優先權、信用／MOQ、未授權正式匯入拒絕、重複提交、其他客戶 ID 不可越權、過期與不正確請求、歷史價格不受改價影響。

以管理員彙總兩張訂單，得到 50 件、供應商成本 NT$5,000、客戶成交額 NT$7,800、毛利 NT$2,800。供應商登入只能取得自己的採購與配貨資料，更新履約後兩張訂單到 COMPLETED；測試部分收款、全額收款、超額收款拒絕、佣金確認及已收狀態，並核對 Dashboard 與 old/new audit。

新增驗證涵蓋服務費與客戶地址的安全結帳 API、過時確認金額拒絕且不產生訂單、供應商金額議價目標、下架 TEST 商品後歷史快照仍保留。金額目標不會自動觸發數量折扣。

可機讀的逐項結果：`.runtime/verification/integration-report.json`。PDF、抽取文字及渲染樣本同存於 `.runtime/verification`。測試腳本只允許 Demo localhost，並保留明確 TEST 記錄供稽核；已完成的測試商品可停用而不刪除歷史。

## 瀏覽器驗證邊界

已在內嵌瀏覽器實際確認桌面商品目錄、未登入不顯示價格、客戶登入、搜尋商品、+5 數量控制與採購單品項／金額顯示。

切換 production server 時，既有瀏覽器停在 `ERR_CONNECTION_REFUSED` 的暫存錯誤頁，Browser 工具隨後因 URL 安全政策拒絕重載與導覽。沒有使用其他瀏覽器、原始 CDP 或安全政策繞過機制。

因此**尚未完成三角色完整瀏覽器串接操作，以及手機／平板視覺與實機複驗**；不能把 110 項 HTTP 整合測試等同於這些 UI 驗證。網站目前已重新啟動，使用者可自行開啟上述本機網址進行操作。

響應式排版與手機快速訂貨控制已實作；仍需實際裝置測試。未執行正式網域部署、真實供應商匯入或真實交易。
# 簡化下單網站驗證（2026-08-31）

最新 `portal/` 下單／PDF／商品總表版本：TypeScript、ESLint、12 項原單元測試，以及 36 項實際 HTTP 檢查通過。涵蓋跨瀏覽器訂单、重複／並行送出、自己的訂单限制、無效數量與日期、100 商品參數邊界、日期篩選與不同單位分開統計。

一頁訂單與 70 商品七頁 PDF 已用 PDFium 實際渲染檢視，繁中、表格、頁碼與換頁正常。Noto TrueType 完整嵌入，避開 CJK 子集映射錯誤。未對新版進行自動瀏覽器點擊或手機實機 QA；本次以 HTTP、程式檢查和 PDF 渲染驗證。

目前仍為 8 項自建示範商品，並非完整昊鼎目錄，不接受真實採購。下列保留原完整 Next.js／PostgreSQL 版本的歷史報告。
