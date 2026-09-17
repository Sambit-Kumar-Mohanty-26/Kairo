-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "networks" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "cidr" VARCHAR(43) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "last_seen_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detections" (
    "id" UUID NOT NULL,
    "sensor_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "flow_id" VARCHAR(64) NOT NULL,
    "attack" VARCHAR(20) NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "risk" SMALLINT NOT NULL,
    "severity" VARCHAR(10) NOT NULL,
    "features" JSONB NOT NULL,
    "model_tag" VARCHAR(40) NOT NULL,
    "source_ip" VARCHAR(45) NOT NULL,
    "source_port" INTEGER NOT NULL,
    "target_ip" VARCHAR(45) NOT NULL,
    "target_port" INTEGER NOT NULL,
    "protocol" VARCHAR(8) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detection_events" (
    "id" UUID NOT NULL,
    "detection_id" UUID NOT NULL,
    "user_id" UUID,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detection_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_rollups" (
    "id" UUID NOT NULL,
    "sensor_id" UUID NOT NULL,
    "minute" TIMESTAMPTZ(3) NOT NULL,
    "flows" INTEGER NOT NULL DEFAULT 0,
    "attacks" INTEGER NOT NULL DEFAULT 0,
    "bytes" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "flow_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offices_organization_id_name_key" ON "offices"("organization_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "networks_office_id_name_key" ON "networks"("office_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sensors_key_hash_key" ON "sensors"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "sensors_network_id_name_key" ON "sensors"("network_id", "name");

-- CreateIndex
CREATE INDEX "detections_organization_id_created_at_idx" ON "detections"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "detections_organization_id_status_idx" ON "detections"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "detections_sensor_id_flow_id_key" ON "detections"("sensor_id", "flow_id");

-- CreateIndex
CREATE INDEX "detection_events_detection_id_idx" ON "detection_events"("detection_id");

-- CreateIndex
CREATE UNIQUE INDEX "flow_rollups_sensor_id_minute_key" ON "flow_rollups"("sensor_id", "minute");

-- AddForeignKey
ALTER TABLE "offices" ADD CONSTRAINT "offices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "networks" ADD CONSTRAINT "networks_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detection_events" ADD CONSTRAINT "detection_events_detection_id_fkey" FOREIGN KEY ("detection_id") REFERENCES "detections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_rollups" ADD CONSTRAINT "flow_rollups_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

