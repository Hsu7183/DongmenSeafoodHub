> 本文件記錄原完整 Next.js／PostgreSQL 管理版本；最新下單／統計網站請見 [PORTAL.md](PORTAL.md)。

# 部署與正式發布

本次交付預設只在 localhost 執行。沒有替使用者設定正式公司、食品業者登錄、域名、供應商授權、成本或佣金，也沒有發布到外網。

## 本機開發

使用 `.env.example` 建立 `.env`；不可提交密碼。`DATABASE_URL` 指向本機 PostgreSQL `127.0.0.1:54329/dongmen`。本機帳密是公開 Demo 開發設定，不得沿用到正式環境。

```powershell
npm install
npm run db:start
npm run db:migrate
npm run db:seed
npm run dev:full
```

資料庫不隨 Next.js 開發伺服器關閉而清除。`db:stop` 使用 PostgreSQL 正常控制指令，只管理本 workspace 的資料庫，不停止其他 PostgreSQL，也不刪資料。

## 正式建置

使用可持續運行 Node.js 的主機與 PostgreSQL。部署使用自己的強密碼、最低權限資料庫角色、TLS、備份及監控。不要用隨 npm devDependencies 下載的 PostgreSQL 做正式服務。

新正式資料庫套用 migrations 後，透過安全環境變數提供 `BOOTSTRAP_ADMIN_EMAIL`、`BOOTSTRAP_ADMIN_NAME`、`BOOTSTRAP_ADMIN_PASSWORD`（至少 14 字元），執行 `npm run admin:bootstrap` 建立第一位管理員並寫入稽核。不要將密碼放進命令列參數；完成後移除暫時的密碼環境設定。工具只允許資料庫尚無 SUPER_ADMIN 時執行，不會覆寫既有管理員或提高既有使用者權限。不要用 Demo seed 建立正式管理員；正式公司資料、佣金與成本仍須管理員設定，非 Demo 佣金預設為零。

```powershell
npm ci
npm run db:migrate
npm run lint
npm run typecheck
npm test
npm run build:full
npm run launch:check
npm start
```

請於測試環境完成 HTTP 整合測試；`test:integration` 刻意限制 localhost 且 `DEMO_MODE=true`，避免向正式庫新增 TEST 訂單。正式環境不要執行 `db:seed`。

`npm start` 預設只綁定 loopback，外部服務應由 HTTPS 反向代理轉送，設定自己的 `APP_URL`；不要任意接受跨網域寫入。Production Cookie 需 Secure，正式站必須 HTTPS。

## 環境與資料門檻

| 項目 | 正式條件 |
| --- | --- |
| DATABASE_URL | 正式 PostgreSQL 與專用低權限帳號，不沿用 Demo 密碼 |
| APP_URL | 管理者持有的正式 HTTPS 網域 |
| DEMO_MODE | `false`；停用／移除測試帳號與資料 |
| SUPPLIER_CONTENT_AUTHORIZED | 預設 `false`；取得相符授權且由管理員確認後才可改為 `true` |
| BUSINESS_MODEL | 管理員選擇 COMMISSION 或 RESELLER，合約須對應交易主體 |
| INVENTORY_MODE | 第一版固定 DROP_SHIP，沒有自有庫存功能 |
| ALLOW_PUBLIC_LAUNCH | 預設 false；依正式發布程序明確確認後才啟用，不取代管理後台法律閘門 |
| PDF_FONT_PATH | 主機須提供可嵌入的合法繁體中文字型；Windows 本機使用 `C:/Windows/Fonts/msjh.ttc`，其他主機請指定可用字型路徑 |
| PDF_FONT_FAMILY | 若使用 TTC 字型集合，可指定字型名稱；本機預設 MicrosoftJhengHeiRegular |
| 平台法律設定 | 真實營業人、統編、客服、地址、食品登錄、交易主體、付款、退換貨、個資、供應商揭露與專業確認 |

字型必須在部署容器／主機存在且允許相應使用，不要把 Windows 系統字型檔擅自複製到公開儲存庫。PDF 需先實測中文字、分頁與角色隔離。

## 上線程序

1. 完成 [LEGAL_CHECKLIST.md](LEGAL_CHECKLIST.md)，取得適合的專業審閱；這不是法遵證明。
2. 建立正式管理員、供應商與客戶，停用 Demo 使用者，確認密碼與角色。
3. 以供應商正式檔案設定 SKU、MOQ、供貨、成本、價格／佣金、帳期、配送與授權來源。
4. 在管理後台填妥營業與政策資料，完成發布確認，再執行 `launch:check`。
5. 執行備份／還原演練、權限檢查、不同客戶與供應商文件隔離、完整下單／彙總／收款流程。
6. 人工確認正式網域、TLS、cookie、檔案與圖片託管、錯誤監控、日誌保存與資安政策，再由管理者發布。

法律資料未完成、Demo 未關閉或授權未就緒時，不應正式發布。啟用發布閘門只代表完成系統要求的欄位，不代表系統自動認定法律合規。

`npm run launch:check` 會實際檢查環境與資料庫：正式 HTTPS APP_URL、`DEMO_MODE=false`、`ALLOW_PUBLIC_LAUNCH=true`、管理後台 launchReady、法律欄位、啟用的 Demo 帳號、未授權上架商品、圖片授權與 DROP_SHIP。未完成時回傳 `BLOCKED_AS_DESIGNED` 及非零結束碼；通過也只代表技術欄位完整，不是法律合規證明。

## 後續營運工作

MVP 未提供密碼重設郵件／MFA／SSO、線上刷卡、物流／LINE／會計 API、POS、正式電子發票或法定帳冊。正式大量交易前，另需壓力測試、資料保存／刪除程序、持續資安檢測、權限稽核、客服及故障處理流程。資料庫金額與訂單功能不取代稅務／會計軟體。
