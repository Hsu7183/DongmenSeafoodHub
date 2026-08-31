-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'SALES', 'CUSTOMER', 'SUPPLIER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'ORDERED_TO_SUPPLIER', 'PREPARING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customerId" TEXT,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "stallName" TEXT NOT NULL,
    "marketName" TEXT NOT NULL DEFAULT '東門市場',
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lineId" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "taxId" TEXT NOT NULL DEFAULT '',
    "invoiceTitle" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "deliveryAddress" TEXT NOT NULL,
    "customerType" TEXT NOT NULL DEFAULT 'MARKET_STALL',
    "priceLevel" TEXT NOT NULL DEFAULT 'LEVEL_B',
    "salesOwner" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL DEFAULT '7天',
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "authorizationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierProductCode" TEXT NOT NULL DEFAULT '',
    "supplierProductId" TEXT NOT NULL DEFAULT '',
    "supplierUrl" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL DEFAULT 'DEMO',
    "sourceUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorizationStatus" TEXT NOT NULL DEFAULT 'DEMO',
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT '',
    "storageMethod" TEXT NOT NULL DEFAULT '冷凍',
    "temperature" TEXT NOT NULL DEFAULT '-18°C 以下',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "imageSource" TEXT NOT NULL DEFAULT 'PLACEHOLDER',
    "imageAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "supplierStockStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "weight" TEXT NOT NULL DEFAULT '',
    "packageUnit" TEXT NOT NULL DEFAULT '包',
    "caseQuantity" INTEGER NOT NULL DEFAULT 10,
    "moq" INTEGER NOT NULL DEFAULT 1,
    "supplierCost" DECIMAL(14,2) NOT NULL,
    "baseWholesalePrice" DECIMAL(14,2) NOT NULL,
    "suggestedPrice" DECIMAL(14,2) NOT NULL,
    "commissionRate" DECIMAL(7,4),
    "fixedCommission" DECIMAL(14,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceLevel" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'FIXED',
    "value" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "PriceLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPrice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeTier" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER,
    "supplierDiscount" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "commissionRate" DECIMAL(7,4) NOT NULL DEFAULT 0.05,
    "rebateRate" DECIMAL(7,4) NOT NULL DEFAULT 0,

    CONSTRAINT "VolumeTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'SUBMITTED',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "businessModelSnapshot" TEXT NOT NULL DEFAULT 'COMMISSION',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "totalCost" DECIMAL(14,2) NOT NULL,
    "grossProfit" DECIMAL(14,2) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "serviceFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryMethod" TEXT NOT NULL DEFAULT 'supplier_delivery',
    "deliveryDate" TIMESTAMP(3) NOT NULL,
    "deliveryTime" TEXT NOT NULL DEFAULT '06:00–10:00',
    "deliveryAddress" TEXT NOT NULL,
    "driver" TEXT NOT NULL DEFAULT '',
    "shippingFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "trackingNote" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "paymentTerms" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "packageUnit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplierCostSnapshot" DECIMAL(14,2) NOT NULL,
    "customerPriceSnapshot" DECIMAL(14,2) NOT NULL,
    "commissionRateSnapshot" DECIMAL(7,4) NOT NULL,
    "commissionAmountSnapshot" DECIMAL(14,2) NOT NULL,
    "rebateRateSnapshot" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "rebateAmountSnapshot" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "totalCost" DECIMAL(14,2) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "specification" TEXT NOT NULL,
    "packageUnit" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "supplierCost" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseAllocation" (
    "id" TEXT NOT NULL,
    "purchaseOrderItemId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PurchaseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderAmount" DECIMAL(14,2) NOT NULL,
    "commissionRate" DECIMAL(7,4) NOT NULL,
    "commissionAmount" DECIMAL(14,2) NOT NULL,
    "rebateAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "paymentTerms" TEXT NOT NULL,
    "deliveryTerms" TEXT NOT NULL DEFAULT '供應商直送；交貨日期另行確認',
    "notes" TEXT NOT NULL DEFAULT '',
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "businessModel" TEXT NOT NULL DEFAULT 'COMMISSION',
    "inventoryMode" TEXT NOT NULL DEFAULT 'DROP_SHIP',
    "commissionRate" DECIMAL(7,4) NOT NULL DEFAULT 0.05,
    "serviceFee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "businessName" TEXT NOT NULL DEFAULT '',
    "taxId" TEXT NOT NULL DEFAULT '',
    "customerServicePhone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "foodRegistrationNumber" TEXT NOT NULL DEFAULT '',
    "tradingEntity" TEXT NOT NULL DEFAULT '',
    "paymentMethods" TEXT NOT NULL DEFAULT '',
    "returnsPolicy" TEXT NOT NULL DEFAULT '',
    "privacyPolicy" TEXT NOT NULL DEFAULT '',
    "supplierDisclosure" TEXT NOT NULL DEFAULT '',
    "legalReviewConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "launchReady" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailySequence_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'LINE_FUTURE',
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_customerId_key" ON "User"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_key_createdAt_idx" ON "LoginAttempt"("key", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE INDEX "Product_supplierId_active_idx" ON "Product"("supplierId", "active");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "PriceLevel_level_variantId_key" ON "PriceLevel"("level", "variantId");

-- CreateIndex
CREATE INDEX "CustomerPrice_customerId_variantId_validFrom_idx" ON "CustomerPrice"("customerId", "variantId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeTier_supplierId_minQuantity_key" ON "VolumeTier"("supplierId", "minQuantity");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_createdAt_status_idx" ON "Order"("createdAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_idempotencyKey_key" ON "Order"("customerId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderItem_supplierId_idx" ON "OrderItem"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_createdAt_idx" ON "PurchaseOrder"("supplierId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderItem_purchaseOrderId_variantId_key" ON "PurchaseOrderItem"("purchaseOrderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseAllocation_orderItemId_key" ON "PurchaseAllocation"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Commission_orderId_supplierId_key" ON "Commission"("orderId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_customerId_variantId_key" ON "Favorite"("customerId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_quoteNumber_key" ON "Quotation"("quoteNumber");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceLevel" ADD CONSTRAINT "PriceLevel_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrice" ADD CONSTRAINT "CustomerPrice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrice" ADD CONSTRAINT "CustomerPrice_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeTier" ADD CONSTRAINT "VolumeTier_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAllocation" ADD CONSTRAINT "PurchaseAllocation_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseAllocation" ADD CONSTRAINT "PurchaseAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
