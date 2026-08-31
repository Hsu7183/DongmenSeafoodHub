> 本文件記錄原完整 Next.js／PostgreSQL 管理版本；最新下單／統計網站請見 [PORTAL.md](PORTAL.md)。

# DongmenSeafoodHub — 東門市場 B2B 水產採購媒合平台

## A. 專案目錄

專案：`C:\Users\User\Documents\DongmenSeafoodHub`。完整結構與操作流程見 [README.md](README.md)。

本次交付為可執行的 Next.js／React／TypeScript／Tailwind CSS 前端、伺服器 API 與 PostgreSQL／Prisma 後端，非僅畫面原型。網站已以 production build 在 `http://127.0.0.1:3000` 啟動，尚未發布外網。

## B. Database Schema

[prisma/schema.prisma](prisma/schema.prisma) 共 24 個模型、[2 次 migrations](prisma/migrations)。關係及金額快照說明見 [DATABASE.md](DATABASE.md)。

核心包含 User/Session、Customer、Supplier、Category、Product/ProductVariant、CustomerPrice/PriceLevel、VolumeTier、Order/OrderItem、PurchaseOrder/PurchaseOrderItem/PurchaseAllocation、Payment、Commission、Quotation、Favorite、AuditLog、PlatformSetting、通知預留與每日編號序列。

## C. 帳號權限

- SUPER_ADMIN：平台、營業／法律設定、正式匯入、成本／價格、訂單、佣金與稽核。
- SALES：業務範圍的客戶、商品、價格、訂單、採購、報價與營運資料；不可變更最高管理員設定與讀寫稽核。
- CUSTOMER：只取得自己的成交價及訂單；API、列印及 PDF 都不回傳供應商成本、佣金、毛利或其他客戶資料。
- SUPPLIER：只取得自己商品與採購、成本及配貨；不含客戶售價、平台毛利或其他供應商內容。

## D. Demo Account

共同密碼：`DemoOnly!2026`，只供本機 `DEMO_MODE=true` 使用。

| 角色 | 帳號 |
| --- | --- |
| 管理員 | admin@dongmen.test |
| 業務 | sales@dongmen.test |
| 客戶 A | customer@dongmen.test |
| 客戶 B | customer2@dongmen.test |
| 供應商 | supplier@dongmen.test |
| 第二供應商 | supplier2@dongmen.test |

其餘客戶為 customer3 至 customer10。帳號、公司、電話、產地、成本及佣金皆為標示的虛構展示值。正式資料庫不執行 Demo seed；首次正式管理員可使用 [部署說明](DEPLOYMENT.md) 的環境變數 bootstrap 工具。

## E. 執行方式

目前網站與資料庫均運行中。下次啟動：

```powershell
cd C:\Users\User\Documents\DongmenSeafoodHub
npm run db:start
npm start
```

需要修改程式時使用 `npm run dev:full`，不要與 `npm start` 同時占用 3000。修改後停止網站再執行 `npm run build:full`；Windows 下可避免 Prisma engine 檔案被運行中的服務鎖住。新環境的安裝、migration、seed 與 PostgreSQL 設定見 README。

## F. 測試結果

lint、typecheck、production build 通過；12 項單元／權限測試及 110 項實際 HTTP 整合測試通過，npm audit 當次掃描 0 漏洞。四種 PDF 已實際輸出並渲染檢視。詳細結果與瀏覽器限制見 [TEST_REPORT.md](TEST_REPORT.md)。

## G. 尚未完成項目與界線

- 完整三角色瀏覽器操作及手機／平板實機複驗：內嵌瀏覽器在伺服器切換後停於錯誤頁，受工具安全政策阻擋；未繞過。三角色後端完整流程已通過。
- 正式公司、統編、食品登錄、政策、批發成本、佣金合約、授權、網域與部署均待管理員提供和確認，不擅自假設。
- 昊鼎腳本提供公開結構預覽、正式授權資料 manifest 與獨立批發 Excel 的受控匯入；沒有大量網站爬蟲或第三方圖片下載。正式資料依供應商授權範圍準備。
- 金額議價目標為採購 KPI；自動折扣／返佣依月累計數量階梯運作，非按金額重算歷史訂單。
- 依第一期範圍未加入刷卡、物流 API、ERP、會計／LINE API、POS、自有庫存。正式大量營運另需負載、備援、資安及法務審閱。

## H. 正式上線前 Checklist

完成 [LEGAL_CHECKLIST.md](LEGAL_CHECKLIST.md)、[DEPLOYMENT.md](DEPLOYMENT.md) 及 [BUSINESS_MODEL.md](BUSINESS_MODEL.md)；其中含營業／稅籍、食品登錄、發票／收據、圖片及文案授權、食品與冷鏈責任、退換貨及個資政策。

保持 `SUPPLIER_CONTENT_AUTHORIZED=false`，直到取得授權並由管理員確認。移除 Demo 模式、停用測試帳號／資料、設定自己的 HTTPS 網域、正式成本及佣金，完成資料庫備份還原與權限驗證，再由管理員發布。`launch:check` 目前會正確阻擋正式發布；**NEEDS PROFESSIONAL REVIEW，不宣稱法律合規**。
