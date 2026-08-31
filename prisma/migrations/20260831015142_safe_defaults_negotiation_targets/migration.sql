-- AlterTable
ALTER TABLE "PlatformSetting" ALTER COLUMN "commissionRate" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "negotiationTargetAmount" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VolumeTier" ALTER COLUMN "commissionRate" SET DEFAULT 0;
