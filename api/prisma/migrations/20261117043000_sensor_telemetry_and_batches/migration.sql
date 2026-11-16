-- AlterTable
ALTER TABLE "sensors" ADD COLUMN IF NOT EXISTS "version" VARCHAR(32),
ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "capture_status" VARCHAR(30),
ADD COLUMN IF NOT EXISTS "interface_name" VARCHAR(64),
ADD COLUMN IF NOT EXISTS "packets_observed" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "flows_extracted" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pending_batches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "queue_bytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "last_upload_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "recent_warning" VARCHAR(255);

-- CreateTable
CREATE TABLE IF NOT EXISTS "sensor_heartbeats" (
    "id" UUID NOT NULL,
    "sensor_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL,
    "capture_status" VARCHAR(30),
    "packets_observed" BIGINT NOT NULL DEFAULT 0,
    "flows_extracted" BIGINT NOT NULL DEFAULT 0,
    "pending_batches" INTEGER NOT NULL DEFAULT 0,
    "queue_bytes" BIGINT NOT NULL DEFAULT 0,
    "warning" VARCHAR(255),

    CONSTRAINT "sensor_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ingested_batches" (
    "id" UUID NOT NULL,
    "sensor_id" UUID NOT NULL,
    "batch_id" VARCHAR(64) NOT NULL,
    "flow_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingested_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sensor_heartbeats_sensor_id_created_at_idx" ON "sensor_heartbeats"("sensor_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ingested_batches_sensor_id_created_at_idx" ON "ingested_batches"("sensor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ingested_batches_sensor_id_batch_id_key" ON "ingested_batches"("sensor_id", "batch_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "detections_organization_id_started_at_idx" ON "detections"("organization_id", "started_at");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sensor_heartbeats_sensor_id_fkey') THEN
        ALTER TABLE "sensor_heartbeats" ADD CONSTRAINT "sensor_heartbeats_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ingested_batches_sensor_id_fkey') THEN
        ALTER TABLE "ingested_batches" ADD CONSTRAINT "ingested_batches_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
