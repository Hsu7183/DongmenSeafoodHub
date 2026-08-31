# 昊鼎來源資料與授權閘門

預設 `SUPPLIER_CONTENT_AUTHORIZED=false`。開發及測試未下載、部署任何第三方商品圖片或文案。網站零售價格永遠不是供應商成本。

## 未授權預覽

```powershell
npm run haoding:preview
```

只讀取一次 `https://www.haodingfisheries.com/products` 公開頁面，暫存 HTML 於記憶體，再寫出 `.runtime/haoding/preview.json`。輸出只有來源 URL、擷取時間、頁面元素數量及少量商品頁 URL；不儲存 HTML、文案、價格、圖片 URL 或圖片，不匯入資料庫。無遞迴爬取、無自動重新導向、無定時工作。

## 正式授權匯入

優先向供應商索取 CSV、Excel、API 或原始圖片資料夾。取得授權後，由管理員準備 `authorized-products.json` 並引用授權文件；本版不會自行啟用大量網站爬取。

```json
{
  "supplierId": "管理員建立的供應商 ID",
  "authorizationConfirmed": true,
  "authorizationReference": "由管理員填入的授權文件編號／儲存位置",
  "authorizedImageHosts": [],
  "rows": [{
    "sku": "供應商 SKU",
    "supplierProductId": "原始商品 ID",
    "supplierProductCode": "供應商商品編號",
    "name": "經授權的商品名稱",
    "specification": "經確認的規格",
    "sourceUrl": "https://www.haodingfisheries.com/products/原始商品路徑"
  }]
}
```

另提供 `HaodingWholesalePrice.xlsx`，第一工作表欄位：`sku`、`supplier_cost`、`base_wholesale_price`，選填 `suggested_price`。金額必須是數字儲存格，不能使用公式或官網零售價代替；SKU 不得重複，每個匯入 SKU 都必須有正式議定成本。

```powershell
# 只有取得授權後才可在 .env 設為 true。
node --env-file=.env scripts/haoding/sync.mjs --manifest authorized-products.json --wholesale HaodingWholesalePrice.xlsx --confirm-authorization
```

先產出 `.runtime/haoding/authorized-import.json`，不變更資料庫。檢查內容後，在安全的環境變數設定 `SYNC_ADMIN_EMAIL`、`SYNC_ADMIN_PASSWORD`，加上 `--apply`，由 SUPER_ADMIN 經後端權限及稽核 API 正式匯入。帳號密碼不接受命令列參數；非 localhost 目標必須使用 HTTPS。

圖片僅使用授權清單中的 HTTPS URL，不在此腳本批量下載。若授權不涵蓋遠端顯示，請先改用供應商提供的原始圖片與自有合法託管流程，勿填入 URL。授權到期／撤回時應下架相關資料與圖片，並由管理員保存處理紀錄。
