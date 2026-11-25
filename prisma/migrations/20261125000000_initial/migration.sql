BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('FREE', 'ACTIVE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'DELIVERED');

-- CreateEnum
CREATE TYPE "MenuTag" AS ENUM ('GLUTEN_FREE', 'DAIRY', 'NUTS', 'SHELLFISH', 'VEGAN');

-- CreateEnum
CREATE TYPE "ModifierKind" AS ENUM ('SIZE', 'EXTRA');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD_ONLINE', 'POS_AT_TABLE', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'KITCHEN', 'WAITER');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'GTQ',
    "timeZone" TEXT NOT NULL DEFAULT 'America/Guatemala',
    "taxBps" INTEGER NOT NULL DEFAULT 0,
    "wifiSsid" TEXT,
    "wifiPassword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMembership" (
    "restaurantId" TEXT NOT NULL,
    "identityId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,

    CONSTRAINT "StaffMembership_pkey" PRIMARY KEY ("restaurantId","identityId","role")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "tableCode" TEXT NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'FREE',

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "TableSession" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "guestCount" INTEGER NOT NULL,
    "hostName" TEXT,
    "hostTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TableSession_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "KitchenStation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "KitchenStation_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "priceCents" INTEGER NOT NULL,
    "spiceLevel" INTEGER NOT NULL DEFAULT 0,
    "tags" "MenuTag"[] DEFAULT ARRAY[]::"MenuTag"[],
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "MenuModifier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "kind" "ModifierKind" NOT NULL,
    "name" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL,
    "tags" "MenuTag"[] DEFAULT ARRAY[]::"MenuTag"[],
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MenuModifier_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxBps" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "tags" "MenuTag"[] DEFAULT ARRAY[]::"MenuTag"[],
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "preparingAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "OrderItemModifier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "kind" "ModifierKind" NOT NULL,
    "name" TEXT NOT NULL,
    "priceDeltaCents" INTEGER NOT NULL,
    "tags" "MenuTag"[] DEFAULT ARRAY[]::"MenuTag"[],

    CONSTRAINT "OrderItemModifier_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "ServiceAlert" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "responseTimeSeconds" INTEGER,

    CONSTRAINT "ServiceAlert_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "tipCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "equalPartySize" INTEGER,
    "equalShareIndex" INTEGER,
    "receiptEmail" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "restaurantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("restaurantId","paymentId","orderItemId")
);

-- CreateTable
CREATE TABLE "SessionReview" (
    "restaurantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionReview_pkey" PRIMARY KEY ("restaurantId","sessionId")
);

-- CreateTable
CREATE TABLE "TriviaQuestion" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TriviaQuestion_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "TriviaRound" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TriviaRound_pkey" PRIMARY KEY ("restaurantId","id")
);

-- CreateTable
CREATE TABLE "TriviaAnswer" (
    "restaurantId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaAnswer_pkey" PRIMARY KEY ("restaurantId","roundId","sessionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_slug_key" ON "Restaurant"("slug");

-- CreateIndex
CREATE INDEX "DiningTable_restaurantId_status_idx" ON "DiningTable"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_restaurantId_number_key" ON "DiningTable"("restaurantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_restaurantId_tableCode_key" ON "DiningTable"("restaurantId", "tableCode");

-- CreateIndex
CREATE UNIQUE INDEX "TableSession_hostTokenHash_key" ON "TableSession"("hostTokenHash");

-- CreateIndex
CREATE INDEX "TableSession_restaurantId_tableId_status_idx" ON "TableSession"("restaurantId", "tableId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenStation_restaurantId_name_key" ON "KitchenStation"("restaurantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_restaurantId_name_key" ON "Category"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_restaurantId_stationId_idx" ON "MenuItem"("restaurantId", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_restaurantId_categoryId_name_key" ON "MenuItem"("restaurantId", "categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "MenuModifier_restaurantId_menuItemId_kind_name_key" ON "MenuModifier"("restaurantId", "menuItemId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Order_restaurantId_sessionId_requestId_key" ON "Order"("restaurantId", "sessionId", "requestId");

-- CreateIndex
CREATE INDEX "OrderItem_restaurantId_orderId_idx" ON "OrderItem"("restaurantId", "orderId");

-- CreateIndex
CREATE INDEX "OrderItem_restaurantId_stationId_status_idx" ON "OrderItem"("restaurantId", "stationId", "status");

-- CreateIndex
CREATE INDEX "OrderItemModifier_restaurantId_orderItemId_idx" ON "OrderItemModifier"("restaurantId", "orderItemId");

-- CreateIndex
CREATE INDEX "ServiceAlert_restaurantId_resolvedAt_createdAt_idx" ON "ServiceAlert"("restaurantId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_restaurantId_status_paidAt_idx" ON "Payment"("restaurantId", "status", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_restaurantId_sessionId_requestId_key" ON "Payment"("restaurantId", "sessionId", "requestId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_restaurantId_orderItemId_idx" ON "PaymentAllocation"("restaurantId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "TriviaQuestion_restaurantId_prompt_key" ON "TriviaQuestion"("restaurantId", "prompt");

-- CreateIndex
CREATE INDEX "TriviaRound_restaurantId_startsAt_endsAt_idx" ON "TriviaRound"("restaurantId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TableSession" ADD CONSTRAINT "TableSession_restaurantId_tableId_fkey" FOREIGN KEY ("restaurantId", "tableId") REFERENCES "DiningTable"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenStation" ADD CONSTRAINT "KitchenStation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_categoryId_fkey" FOREIGN KEY ("restaurantId", "categoryId") REFERENCES "Category"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_restaurantId_stationId_fkey" FOREIGN KEY ("restaurantId", "stationId") REFERENCES "KitchenStation"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuModifier" ADD CONSTRAINT "MenuModifier_restaurantId_menuItemId_fkey" FOREIGN KEY ("restaurantId", "menuItemId") REFERENCES "MenuItem"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_restaurantId_sessionId_fkey" FOREIGN KEY ("restaurantId", "sessionId") REFERENCES "TableSession"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_restaurantId_orderId_fkey" FOREIGN KEY ("restaurantId", "orderId") REFERENCES "Order"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_restaurantId_menuItemId_fkey" FOREIGN KEY ("restaurantId", "menuItemId") REFERENCES "MenuItem"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_restaurantId_stationId_fkey" FOREIGN KEY ("restaurantId", "stationId") REFERENCES "KitchenStation"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_restaurantId_orderItemId_fkey" FOREIGN KEY ("restaurantId", "orderItemId") REFERENCES "OrderItem"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAlert" ADD CONSTRAINT "ServiceAlert_restaurantId_sessionId_fkey" FOREIGN KEY ("restaurantId", "sessionId") REFERENCES "TableSession"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_restaurantId_sessionId_fkey" FOREIGN KEY ("restaurantId", "sessionId") REFERENCES "TableSession"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_restaurantId_paymentId_fkey" FOREIGN KEY ("restaurantId", "paymentId") REFERENCES "Payment"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_restaurantId_orderItemId_fkey" FOREIGN KEY ("restaurantId", "orderItemId") REFERENCES "OrderItem"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReview" ADD CONSTRAINT "SessionReview_restaurantId_sessionId_fkey" FOREIGN KEY ("restaurantId", "sessionId") REFERENCES "TableSession"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaQuestion" ADD CONSTRAINT "TriviaQuestion_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaRound" ADD CONSTRAINT "TriviaRound_restaurantId_questionId_fkey" FOREIGN KEY ("restaurantId", "questionId") REFERENCES "TriviaQuestion"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAnswer" ADD CONSTRAINT "TriviaAnswer_restaurantId_roundId_fkey" FOREIGN KEY ("restaurantId", "roundId") REFERENCES "TriviaRound"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriviaAnswer" ADD CONSTRAINT "TriviaAnswer_restaurantId_sessionId_fkey" FOREIGN KEY ("restaurantId", "sessionId") REFERENCES "TableSession"("restaurantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A released host leaves the session active with a null token hash.
CREATE UNIQUE INDEX "TableSession_one_active_per_table"
ON "TableSession" ("restaurantId", "tableId") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "ServiceAlert_one_pending_per_session"
ON "ServiceAlert" ("restaurantId", "sessionId") WHERE "resolvedAt" IS NULL;

CREATE UNIQUE INDEX "Payment_one_live_equal_share"
ON "Payment" ("restaurantId", "sessionId", "equalShareIndex")
WHERE "status" <> 'CANCELLED' AND "equalShareIndex" IS NOT NULL;

ALTER TABLE "TableSession"
  ADD CONSTRAINT "TableSession_guest_count_check" CHECK ("guestCount" BETWEEN 1 AND 20),
  ADD CONSTRAINT "TableSession_lifecycle_check" CHECK (
    ("status" = 'ACTIVE' AND "closedAt" IS NULL)
    OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "hostTokenHash" IS NULL)
  );

ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_tax_range_check" CHECK ("taxBps" BETWEEN 0 AND 10000);
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_price_spice_check" CHECK (
  "priceCents" >= 0 AND "spiceLevel" BETWEEN 0 AND 5
);
ALTER TABLE "SessionReview" ADD CONSTRAINT "SessionReview_stars_check" CHECK ("stars" BETWEEN 1 AND 5);
ALTER TABLE "ServiceAlert" ADD CONSTRAINT "ServiceAlert_resolution_check" CHECK (
  ("resolvedAt" IS NULL AND "responseTimeSeconds" IS NULL)
  OR ("resolvedAt" IS NOT NULL AND "resolvedAt" >= "createdAt" AND "responseTimeSeconds" IS NOT NULL AND "responseTimeSeconds" >= 0)
);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_share_check" CHECK (
  ("equalPartySize" IS NULL AND "equalShareIndex" IS NULL)
  OR ("equalPartySize" IS NOT NULL AND "equalShareIndex" IS NOT NULL
      AND "equalPartySize" BETWEEN 1 AND 20 AND "equalShareIndex" >= 0 AND "equalShareIndex" < "equalPartySize")
);

COMMIT;
