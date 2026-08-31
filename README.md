# DongmenSeafoodHub

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
npm run dev
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
