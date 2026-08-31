# 下單、攤位身分與集中採購

2026-08-31 第二階段，延續既有 React + TypeScript + Vite + Cloudflare Worker + D1 + Drizzle。未重寫網站、未接入或雙寫原完整版 PostgreSQL。GitHub Pages 入口與 Sites 實際網址維持不變。

## 已完成：顧客操作

- `/`：下單／統計兩個大入口，附我的訂單連結。
- `/login`：選攤位／店名、輸入 4 位數 PIN。管理者先建立帳戶，不開放自行搶註冊，不需要 Email。
- `/order`：單欄大圖片，商品名稱 24–26px、規格 20px、加減按鈕 56px。搜尋、保存方式、分類、常買及數量控制；確認後送單。攤名取自登入帳戶，不接受前端冒填。
- 常買以本人未取消且仍有有效數量的歷史訂單計算購買頻率，最多 20 項可訂商品；沒有歷史時直接顯示全部。
- `/my-orders`：本人歷史訂單，可載入更早記錄；每單有「再訂一次」。重訂將仍可訂且 SKU／名稱／規格／單位未變的商品與原有效數量帶回下單頁，仍須客戶確認送出，不會直接再建立訂單。
- 已下架或規格變更的重訂商品明確列出，不自動替代。既有草稿按 customer_id 隔離；舊分頁的攤位若與現行 Cookie 不同，後端拒絕誤送。
- `/receipt/:id`：讀取本人訂單、下載 PDF、列印。SUBMITTED 可修改數量及備註，填 0 移除項目；新增其他商品請另外下單。亦可取消整張訂單。修改中停用下載／列印，更新或離開時提醒未存內容。
- 原訂量、目前有效訂購量、實際配貨量分開保存與顯示。短配時可明確確認新版配貨，確認後仍可查看實配數量。
- `/stats`：日期區間內有效訂單需求總量；排除 CANCELLED 與已移除項目，不同商品快照／規格／單位分開計算，每 30 秒更新。完成單仍屬該日期區間的歷史有效需求；此總表不是未採購待辦清單，也不是實配數量表。

## 已完成：管理者操作

管理功能全部放在 `/admin`，每個管理 API 都在後端檢查獨立管理 session，不靠隱藏按鈕保護。

1. `/admin/orders`：以獨立管理密碼登入。展開「攤位管理」，新增攤名與 PIN；可重設 PIN、停用／啟用。重設或停用會撤銷該攤位所有裝置的登入。
2. 依日期查詢訂單；卡片顯示編號、攤位、時間、有效商品項數、狀態及修改紀錄。每次載入 100 張，可繼續載入。
3. 選取 SUBMITTED 訂單，按「截單」並確認；只鎖定所選且版號仍一致的訂單，轉為 LOCKED。
4. `/admin/purchasing`：選 LOCKED 訂單，先看集中需求與各攤分量，再按「建立本次採購批次」。整批原子建立後訂單轉 PURCHASING。
5. `/admin/purchasing/:id`：輸入供應商可供量、各攤實配量。需求 60、可供 50，須將 50 分配完成；每攤不能超過其需求，總配量不得超過可供量。可供 0 與尚未輸入分開處理。本輪不處理超出需求的額外進貨。
6. 儲存供應與配貨後，訂單轉 SUPPLIER_CONFIRMED。任何短配的訂單標記 PENDING，顧客在自己的訂單按「確認配貨數量」後為 ACCEPTED。再改配貨會產生新版本並重新要求確認，不能默默沿用舊確認。
7. 所有短配已確認後，管理者才可完成批次與訂單。COMPLETED 不再允許重配。未存草稿時禁止列印或完成；重新整理會提示捨棄草稿。
8. `/admin/purchasing/:id/print?view=supplier`：商品、規格、單位及供應商確認採購量。
9. `/admin/purchasing/:id/print?view=allocation`：商品、總供應量、各攤需求／分配量與待確認狀態。

兩份管理列印頁只讀已儲存的批次資料；不含客戶售價、供應商成本、毛利或佣金。這些操作不會自動傳送訊息或採購單給昊鼎。

## 狀態與資料一致性

| 狀態 | 意義 | 顧客可改量／取消 |
|---|---|---|
| SUBMITTED | 已送出，尚未截單 | 可以 |
| LOCKED | 管理者已截單 | 不可以 |
| PURCHASING | 已建立集中採購批次 | 不可以 |
| SUPPLIER_CONFIRMED | 已填供應與各攤配貨 | 只可確認自己的短配版本 |
| COMPLETED | 完成交貨 | 不可以 |
| CANCELLED | 已取消，排除有效需求 | 不可以 |

- `portal_orders.revision` 作樂觀鎖，修改、取消、截單、配貨與完成均追加 revision 紀錄。
- `portal_order_items.quantity` 保留原量，`current_quantity` 保存現行需求，0 表示移除。修改紀錄保留前後快照、時間與來源；不刪訂單或明細。
- 狀態與版號檢查置於 D1 原子 batch 的 CHECK guard，檢查不符會讓整批回滾；不是只先查再更新。
- `purchase_allocations.order_item_id` 有唯一約束，避免同明細重複採購。本輪沒有取消採購批次／重新採購功能，所以採用全期間唯一，不刪 allocation。
- 批次有唯一操作鍵與請求雜湊；同內容重試回原批次，不同內容或另一有效批次重複採購會被拒絕。
- 配貨上限另有 SQLite trigger 保護。重新配貨在同一交易內先清零、再寫供應量及完整分配，不會對外暴露中間狀態。
- 訂單與批次各自以同一 D1 batch 讀取表頭、明細與紀錄，避免回傳混合版本。
- 管理配貨請求上限 1.5 MB，普通顧客請求維持 25 KB。集中明細使用 JSON 批次寫入，避免逐品項大量 statement；已實測 50 張 × 8 商品。

## 資料模型

保留 `portal_products`、`portal_orders`、`portal_order_items`，以 additive migration 新增：

- `portal_customers`：id、stall_name、pin_hash、active、created_at、updated_at、auth_version。
- `portal_sessions`：隨機 token 的雜湊、角色、customer_id、登入版本與到期時間。
- `portal_login_limits`：帳戶與來源登入限流。
- `portal_order_revisions`：修改、取消、截單、採購、配貨與客戶確認紀錄。
- `purchase_batches`：批次編號、版號、狀態、唯一操作鍵與時間。
- `purchase_batch_items`：商品／SKU／規格／單位快照、requested_quantity、supplier_confirmed_quantity。
- `purchase_allocations`：order_id、order_item_id、需求量、實配量。
- `purchase_batch_events`：配貨修改前後快照與管理來源。
- `portal_atomic_guards`：D1 batch 內的暫時一致性檢查；成功交易會清除，失敗整批回滾。

`drizzle/0001_tough_barracuda.sql` 只新增表、欄位與索引；`0002_allocation_guards.sql` 保留遷移位置。配貨 trigger 位於 `portal/constraints.sql`，由 Worker 啟動以完整 statement 安裝，成功後才處理任何 Portal API；若安裝失敗則拒絕服務，不會略過保護。此方式避免正式部署的 migration 匯入器拆開 trigger 內的分號而出錯。開發與正式使用同一份 SQL，不刪除舊資料；正式打包同時包含 Drizzle migration 與 Worker 內的保護 SQL。

## 身分、安全與舊訂單

PIN 使用每戶隨機 salt、Worker secret pepper 及版本化 PBKDF2-SHA256（100,000 次）。此成本已經實際 Worker 登入／重設驗證，不宣稱等同更高成本的密碼建議。4 位 PIN 本身熵低，正式營運仍須評估使用風險與濫用監控。

每戶每 15 分鐘最多 5 次驗證，來源另有客戶登入 50 次上限；登入嘗試原子記錄，換 Cookie 或並行嘗試不重置帳戶額度。成功只清該帳戶桶，不清來源計數。管理者的長隨機密碼另按來源限流，不共用所有管理者的 5 次桶。來源使用 Cloudflare 的 CF-Connecting-IP，正式主機須確保此 header 由平台提供、不能被訪客偽造。

Cookie 為 HttpOnly、SameSite=Strict，HTTPS 上為 Secure；D1 只存 token SHA-256。客戶登入期限 30 天，管理者 12 小時；登入換 token、登出撤銷。PIN 重設與停用撤銷整戶 session。管理 secret 輪換也會使舊管理 session 失效。

所有新單都綁定後端驗證的 customer_id，前端傳入 expectedCustomerId 僅用來防止舊分頁誤送，不能作授權依據。讀單、重訂、改量、取消、確認配貨均檢查本人歸屬。修改 API 拒絕跨站 Origin、異常 JSON、未知欄位、非法數量及過長內容。

舊匿名訂單的 customer_id 維持 NULL，不依相同攤名自動認領。舊 dm_portal_session 只可讀原本收據；舊單未歸戶前不可截單／進入新採購批次，避免短配後無人能確認。舊資料的人工歸戶不在本輪，需另行核實操作人與原單。

公開統計只回商品有效需求，不回攤位、備註或個別訂單。攤位選單依需求公開可登入的店名，但不回 PIN hash、session 或管理資訊。客戶與管理頁分享預覽不含私密訂單內容。

## 商品與正式營運開關

目前仍只有 8 項示範商品、7 張昊鼎官網原圖；整尾透抽待補圖。保留原圖與品牌，不使用 AI 商品圖；前台不提供官網商品連結。來源只保留維護文件，示範規格不是供應商正式規格，也不以零售價作批發成本。

`SUPPLIER_CONTENT_AUTHORIZED` 及 `PORTAL_ACCEPT_LIVE_ORDERS` 預設 false；兩者均 true 且商品明確授權才會選用正式目錄。本輪未開啟。新增登入與採購工作台不代表已取得授權或已能實際營業。

## 本機及部署

使用 Node.js 24，安裝專案套件。複製 `.dev.vars.example` 為 `.dev.vars`，設定兩個不同且至少 32 字元的長隨機 secret：

- `PORTAL_ADMIN_SECRET`：管理登入用，不是客戶 PIN。
- `PORTAL_PIN_PEPPER`：PIN 雜湊用，只在後端保存，不提供給攤位。

`.dev.vars`、`.env`、`.runtime`、`.wrangler` 全部不提交。正式 secret 在 Sites 設定，不寫 hosting.json；正式與本機不得共用 secret。更換 PIN pepper 會使舊 PIN 驗證失效，必須安排全戶 PIN 重設；不要任意輪換。

- `npm run dev`：本機下單網站，預設 127.0.0.1:5173；改本機 secret 後重啟。
- `npm run typecheck`、`npm run lint`、`npm run build`、`npm run test:portal`：本輪必要驗證，全部成功後才同步／部署。
- `npm run portal:migrate`：資料結構改動後生成並檢查 SQL。
- `npm run test:portal`：只允許 localhost，實際 Worker、D1、PIN、跨裝置、競態、配貨與 PDF 驗收；本機直接 SQL 僅建立明確 TEST fixtures，不碰正式站。

## 已驗證與尚未完成

171 項驗收通過；涵蓋跨裝置、跨攤權限、重試、修改／取消／截單競態、需求 60 配 50、超配拒絕、短配確認與重配失效、零供應、常買 20 項、規格變更重訂、50×8 大批次、舊資料 migration、PIN 重設／停用／登出、並行猜 PIN 限流。PDF 有一般、多頁、短配、取消四種樣本，具體檢查見 TEST_REPORT.md。

尚未完成：完整手機實機與長輩試用、自動瀏覽器端到端操作、管理列印頁的實際瀏覽器列印驗證、正式帳戶建置、舊單人工歸戶、採購批次取消、短配拒絕協商、完整供應商目錄與授權、備份還原演練、正式主機限流／容量評估。

正式營運前仍須確認交易主體、營業／食品資料、價格與交易條件、退換貨／冷鏈責任及隱私政策；4 位 PIN 與公開總量是否適用亦需經營者決定。未加入金流、LINE API、ERP、POS、複雜 Dashboard 或原版 PostgreSQL 同步。
