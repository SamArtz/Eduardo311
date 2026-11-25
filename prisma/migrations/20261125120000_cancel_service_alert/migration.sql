BEGIN;

ALTER TABLE "ServiceAlert" ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "ServiceAlert"
  ADD CONSTRAINT "ServiceAlert_cancelled_check"
  CHECK ("cancelledAt" IS NULL OR ("resolvedAt" IS NULL AND "cancelledAt" >= "createdAt"));

DROP INDEX "ServiceAlert_one_pending_per_session";
CREATE UNIQUE INDEX "ServiceAlert_one_pending_per_session"
ON "ServiceAlert" ("restaurantId", "sessionId")
WHERE "resolvedAt" IS NULL AND "cancelledAt" IS NULL;

COMMIT;
