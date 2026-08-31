# DongmenSeafoodHub

## 最新公開版：攤位 PIN、訂單與集中採購

[GitHub Pages 入口](https://hsu7183.github.io/DongmenSeafoodHub/) 仍轉到 [東門市場・食材訂購](https://dongmen-seafood-hub.mr-hsu.chatgpt.site)。網址不變。

延續 React／TypeScript／Vite／Cloudflare Worker／D1／Drizzle；沒有重寫公開網站，也沒有接入或雙寫原完整版 PostgreSQL。

### 已完成

- 攤位選單＋4 位 PIN；同裝置記住登入、跨裝置讀取自己的歷史訂單。
- 手機大圖、大字、大按鈕；常買最多 20 項，歷史訂單一鍵帶回再訂。下架或規格變更不自動替換。
- SUBMITTED 訂單可改數量／備註或取消；保留原量及每次修訂。取消不計入統計。
- 管理者可建立攤位、重設 PIN、停用帳戶、依日期選單截單。
- 已截單訂單可建立集中採購批次，資料庫約束防重複採購。
- 輸入供應量與各攤配貨；不得超量，短配須客戶確認，重新配貨會重新要求確認。
- 供應商採購與各攤配貨分開列印；顧客 PDF 顯示需求、配貨及取消／異動狀態，不含價格。
- 未儲存的訂單修改不能直接下載／列印；未儲存的配貨不能列印或完成批次。

### 使用與管理

顧客：首頁 → 下單 → 選攤位及 PIN → 選商品 → 確認；「我的訂單」可修改、取消、再訂與確認短配。

管理者：[管理入口](https://dongmen-seafood-hub.mr-hsu.chatgpt.site/admin/orders) → 攤位管理 → 設定店名及 PIN → 選訂單截單 → 集中採購 → 配貨確認 → 客戶確認短配 → 完成。

管理密碼與 PIN pepper 是獨立的部署 secret，不在原始碼或此文件提供。沒有任何公開預設管理密碼或預設客戶 PIN。建立攤位後由管理者私下交付 PIN。

### 本機執行

Node.js 24、npm；先安裝套件。將 .dev.vars.example 複製成 .dev.vars，設定兩個不同的長隨機 secret：PORTAL_ADMIN_SECRET、PORTAL_PIN_PEPPER。勿上傳 .dev.vars。執行 npm run dev；設定變更後重啟。

驗證指令：npm run typecheck、npm run lint、npm run build、npm run test:portal。Portal 測試只允許 localhost，使用實際 Worker／本機 D1，會留下 TEST 標記資料，並在結束後停用測試商品；不對正式站寫測試訂單。

### 測試結果與目前界線

2026-08-31 第二階段：171 項 HTTP／D1／遷移／權限／競態與流程檢查通過，另產生 4 份 PDF 驗證樣本。包括跨裝置與跨攤隔離、10 改 6、取消扣除、60 需求配 50、配 51 拒絕、短配確認、重複採購與 50 張×8 商品大批次。完整結果與驗證邊界見 TEST_REPORT.md。

尚未完成手機實機及年長攤販使用者驗證；瀏覽器列印頁未做自動瀏覽器操作測試。正式營運仍待商品清單、真實規格、圖片授權、客戶／交易政策、備份還原與營運權限確認。

目前仍只有 8 項示範商品、7 張官網原圖，整尾透抽待補圖；全程沒有供應商官網商品連結。沒有開啟真實採購、金流、LINE、ERP、POS 或複雜 Dashboard。

舊匿名訂單與原 Cookie 讀取方式保留，但不按攤名自動歸戶；未歸戶舊單不可進入新採購批次。正式歸戶需另行核實。GitHub Pages 僅作入口，實際服務及 D1 資料由既有主機處理。

詳細操作、資料模型及限制見 [PORTAL.md](PORTAL.md)。以下保留原 Next.js／PostgreSQL MVP 的歷史說明；它使用 dev:full／build:full／start:full，並非上述公開版。

## 原完整版

東門市場 B2B 水產採購媒合平台。以「客戶先叫貨 → 集中彙總 → 供應商採購單 → 供應商出貨」為核心的可執行全端 MVP；不是 B2C 商城，也不建立虛假庫存。

預設使用繁體中文、TWD、`DROP_SHIP`、Demo 資料及未授權供應商內容保護。真實營業人、統編、正式批發成本、正式佣金、食品業者登錄、圖片授權與網域均須管理員填入，不得把 Demo 視為正式營運資料。

## 快速啟動

需求：Node.js 22 以上、npm。此工作區使用 Node.js 24 與本機 PostgreSQL 18.4；其他環境可使用支援的外部 PostgreSQL。Windows 本機資料庫不需要 Docker，也不安裝系統服務。

```powershell
npm install
# 第一次建立環境檔，已有 .env 請勿覆寫。
Copy-Item .env.example .env
npm run db:start
npm run db:migrate
npm run db:seed
npm run dev:full
```

開啟 [本機平台](http://127.0.0.1:3000)。`db:start` 僅管理本工作區 `.runtime/postgres`，綁定 `127.0.0.1:54329`；資料會保留。停止資料庫使用 `npm run db:stop`，不刪資料。外部 PostgreSQL 應設定自己的 `DATABASE_URL`，不用執行本機資料庫腳本。

不要對既有正式資料庫執行 Demo seed。請先閱讀 [部署說明](DEPLOYMENT.md)。

## Demo 帳號

共同密碼：`DemoOnly!2026`，只適用 `DEMO_MODE=true` 的開發展示。

| 角色 | 電子郵件 | 可用範圍 |
| --- | --- | --- |
| SUPER_ADMIN | `admin@dongmen.test` | 全部管理、正式匯入、平台與法律資料設定 |
| SALES | `sales@dongmen.test` | 客戶、價格、訂單、採購、報價與營運資料；不可變更最高管理員設定 |
| CUSTOMER | `customer@dongmen.test` | 自己的採購價、採購單、訂單與客戶文件 |
| CUSTOMER | `customer2@dongmen.test` | 第二家獨立測試客戶 |
| SUPPLIER | `supplier@dongmen.test` | 自家商品成本、採購單、供貨配貨資訊 |

另有合計十家 Demo 客戶。正式上線前須停用／移除 Demo 使用者，重建正式帳號與合約資料。

## 操作路徑

1. 管理員登入，建立供應商、商品分類，於 `/admin/import-products` 匯入 CSV／Excel／JSON 並確認欄位對應。
2. 建立客戶，指定價格等級；需要時設定具有有效期間的專屬採購價。
3. 客戶於 `/quick-order` 搜尋、常購／收藏與再次訂購，使用數量按鈕加入採購單並「確認叫貨」。
4. 訂單存入下單當時的成本、客戶價及佣金快照；客戶列印／PDF 僅包含自己的交易資料。
5. 管理員確認訂單後選取彙總，依供應商與 SKU 產生 Supplier PO，保留各攤配貨數量。
6. 跟進備貨、配送、完成，登錄部分或全部收款，檢查佣金台帳與 Dashboard。

## 專案目錄

```text
app/                    Next.js 前台、管理介面、API、列印與法律頁面
components/             共用介面、商品與採購單互動元件
lib/server/             登入、權限、資料存取、定價與交易邏輯
prisma/schema.prisma    PostgreSQL schema
prisma/migrations/      版本化 SQL migrations
prisma/seed.ts          可重複使用的 Demo seed
public/                 自有／placeholder 靜態資產
scripts/db/             本工作區 PostgreSQL 啟停，不刪資料
scripts/haoding/        來源結構預覽及明確授權後的匯入工具
tests/                  定價／權限單元與完整 API 整合驗證
.runtime/               本機資料庫、日誌、測試報告（不提交版控）
```

## 驗證

```powershell
npm run lint
npm run typecheck
npm test
npm run build
# 需另啟動 localhost，且 DEMO_MODE=true。
npm run test:integration
npm run launch:check
```

整合測試真實使用登入 Session、PostgreSQL 與 HTTP API，涵蓋供應商／商品匯入、兩家客戶專屬價與下單、跨客戶及供應商隔離、分離 PDF、集中採購、重複彙總保護、歷史價格快照、收款、完成訂單、Dashboard 與稽核。報告位於 `.runtime/verification/integration-report.json`，PDF 樣本也存於該資料夾。每次測試會留下明確標示 `TEST` 的業務記錄，成功時將該次測試商品下架；不刪除歷史記錄、不破壞既有資料，也不適合直接對正式庫執行。

2026-08-31 已實際在 production build 的 localhost 通過完整 API 整合驗證 **110 項**；此流程驗證 50 件集中採購、成本 NT$5,000、客戶成交額 NT$7,800、毛利 NT$2,800 與首張訂單佣金 NT$150。包含服務費安全資料、成交前金額變動拒絕與議價金額目標進度。客戶、內部、供應商與報價 PDF 均成功輸出並以 Poppler 檢視，繁體中文、A4、權限內容與排版正常。啟停工具及匯入／測試腳本 ESLint 無錯誤或警告。

完整 lint（零警告）、typecheck、12 項 Vitest 單元／安全測試、production build 均通過；npm audit 為零項漏洞。兩份 migrations 已套用，Demo seed 已建立。`launch:check` 在預設 Demo／法律資料未填的狀態應阻擋正式發布，這是預期保護行為。

瀏覽器實測已完成初始桌面公開目錄、客戶登入、搜尋、`+5` 數量操作及採購單顯示。伺服器重啟後既有分頁發生連線失敗，後續重新導覽受瀏覽器工具 URL 政策限制；未繞過限制。**尚未完成最終版本的完整 Admin／Supplier 瀏覽器操作、瀏覽器確認送單及手機視覺驗證**，不可把 110 項 API 整合測試稱為完整瀏覽器 E2E。相關流程的後端權限、真實資料交易與 PDF 已由 API／文件驗證完成。

整合測試留下的三組專用 TEST 商品均已透過管理 API 下架，公開目錄保留 8 項原始 Demo 商品；42 張既有／測試訂單及其快照完全保留，稽核未刪除。

## 授權與範圍

`SUPPLIER_CONTENT_AUTHORIZED=false` 時不得正式匯入或公開未授權供應商文案／圖片。`haoding:preview` 只讀取單一公開頁並保存結構資訊；沒有圖片下載、價格擷取或資料庫匯入。正式資料應先向供應商取得 CSV、Excel、API、原圖及授權。詳見 [昊鼎匯入說明](scripts/haoding/README.md) 與 [法律待辦](LEGAL_CHECKLIST.md)。

第一階段未包含線上刷卡、物流 API、ERP、會計 API、LINE API、POS 或自有庫存。LINE 僅有停用的通知佇列預留，不會發送真實訊息。

更多文件：[架構](ARCHITECTURE.md)、[資料庫](DATABASE.md)、[商業模式](BUSINESS_MODEL.md)、[部署](DEPLOYMENT.md)、[正式上線待辦](LEGAL_CHECKLIST.md)。
