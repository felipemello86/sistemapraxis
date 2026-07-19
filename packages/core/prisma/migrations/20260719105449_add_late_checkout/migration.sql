-- AlterTable
ALTER TABLE "DailyUHSelection" ADD COLUMN     "lateCheckout" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lateCheckoutEm" TIMESTAMP(3),
ADD COLUMN     "lateCheckoutHora" TEXT,
ADD COLUMN     "lateCheckoutPorNome" TEXT;

