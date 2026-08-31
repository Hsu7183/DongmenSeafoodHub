# 商業模式與價格計算

所有實際成本、成交價、佣金比例與服務費須由管理員依正式供應商／客戶約定設定。Demo 的數字只用來驗證計算，不能代表昊鼎或任何真實供應商的報價。

正式資料庫的佣金與議價目標預設為零，避免自行假設正式商業條件。Demo seed 才明確加入測試比例與目標。

## Commission Model

`BUSINESS_MODEL=COMMISSION`：供應商實際向客戶供貨，平台媒合並集中需求，依約收取供應商佣金；可另外設定服務費與返佣。Dashboard 的 GMV 是客戶成交總額，不能直接當成平台已認列營收。

```text
一般佣金 = 訂單商品成交金額 × 佣金比例
固定單位佣金 = 固定佣金 × 件數（有設定時優先）
返佣 = 商品成本合計 × 返佣比例
```

平台收益應依正式合約與商業模式判讀。佣金台帳採 `PENDING → CONFIRMED → PAID`；台帳不等於銀行對帳或法定帳冊。

## Reseller Model

`BUSINESS_MODEL=RESELLER`：平台按 supplierCost 採購，再按 customerPrice 售予客戶，收入／交易主體、發票與責任分工由正式合約與專業人員確認。

```text
GrossProfit = CustomerRevenue − SupplierCost
GrossMargin = GrossProfit ÷ CustomerRevenue
```

介面分別提供成交額、商品成本、價差毛利與佣金，不應把兩種模式的收益無條件重複相加。Order 保存下單時 businessModelSnapshot，之後切換平台設定不重寫歷史交易。服務費與運費各自保存；正式認列與稅務處理不由本 MVP 自動判定。

## 價格優先序

1. 有效期間內的 CustomerPrice。
2. 該客戶價格等級的 SKU 規則。
3. ProductVariant.baseWholesalePrice。

| PriceLevel 模式 | 計算 |
| --- | --- |
| FIXED | 固定成交價 |
| COST_PLUS | supplierCost＋固定加價 |
| MARGIN | supplierCost ÷ (1－目標毛利率) |

比例毛利率必須大於等於零且小於一。TWD 金額以 Decimal 計算並四捨五入至兩位小數。客戶只取得後端算好的本人 customerPrice，無成本、佣金、毛利、其他客戶價或原始價格等級資料。

確認叫貨前，`/api/checkout-context` 只回傳本人配送／付款資料、服務費及本版為零的運費。前端附上 `expectedTotal`，後端重新計價；若價格或服務費已變動，回應 409 要求重新確認，不建立不同金額的訂單。

## 階梯與集中採購

VolumeTier 用每個供應商的採購件數設定門檻，保存 supplierDiscount、commissionRate、rebateRate。Dashboard 顯示本月各供應商累計件數與金額、當前級距、下一級件數與差額；各 SKU 顯示件數、成交額與毛利。

每個 Supplier 另有 `negotiationTargetAmount`，由管理員設定本月採購金額議價目標。Dashboard 顯示目標金額、尚差金額與完成百分比；例如目標 NT$500,000、已採購 NT$428,000，尚差 NT$72,000。此功能是議價 KPI，不會自動套用金額返佣或改寫訂單。

MVP 的自動階梯條件仍以「件數」為基礎，依下單前已累積的本月件數選定級距，對新訂單生效。若要每月採購 NT$500,000 自動返佣、跨月追溯補差或不同交易主體分帳，應先定義合約與結算規則再擴充。

訂單價格在提交當時保存；後續累積量跨過下一門檻，不回頭改變已提交訂單。佣金、返佣、折扣與服務費的適用時間、例外與結算方式仍須於正式合同明確約定。
