import crypto from "node:crypto";
import { prisma } from "../db.js";
import { config } from "../config.js";

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface DecryptedFeedbackSample {
  id: string;
  label: "BENIGN" | "MALICIOUS";
  features: Record<string, number> | number[];
  sourceIp?: string;
  destIp?: string;
  flowSummary?: string;
}

export class FeedbackQueueService {
  /**
   * Derive tenant-isolated 256-bit AES key using HMAC-SHA256.
   * This ensures tenant A can NEVER decrypt tenant B's telemetry even if DB is dumped.
   */
  private deriveTenantKey(orgId: string): Buffer {
    const masterSecret = config.jwtSecret || "kairo-enterprise-production-master-key-seed";
    return crypto
      .createHmac("sha256", masterSecret)
      .update(`kairo-tenant-feedback-v1:${orgId}`)
      .digest();
  }

  /**
   * Encrypt flow feature vector with AES-256-GCM authenticated encryption.
   */
  encryptFeatures(features: unknown, orgId: string): EncryptedPayload {
    const key = this.deriveTenantKey(orgId);
    const iv = crypto.randomBytes(12); // Standard 96-bit GCM IV
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const plaintext = Buffer.from(JSON.stringify(features), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("hex"),
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
    };
  }

  /**
   * Decrypt and verify flow feature vector with AES-256-GCM.
   * Throws if tampered or invalid tag.
   */
  decryptFeatures(payload: EncryptedPayload, orgId: string): unknown {
    const key = this.deriveTenantKey(orgId);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(payload.iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "hex")),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString("utf8"));
  }

  /**
   * Enqueue a labeled detection flow into the tenant's closed-loop fine-tuning queue.
   */
  async enqueueFeedback(params: {
    organizationId: string;
    detectionId: string;
    status: "false-positive" | "resolved";
    features: unknown;
    sourceIp?: string;
    targetIp?: string;
    attack?: string;
  }): Promise<string> {
    const { organizationId, detectionId, status, features, sourceIp, targetIp, attack } = params;

    const label = status === "false-positive" ? "BENIGN" : "MALICIOUS";
    const encrypted = this.encryptFeatures(features, organizationId);
    const flowSummary = sourceIp && targetIp ? `${sourceIp} -> ${targetIp} (${attack ?? "Flow"})` : undefined;

    const record = await prisma.modelFeedbackFlow.create({
      data: {
        organizationId,
        eventId: detectionId,
        label,
        encryptedFeatures: encrypted.ciphertext,
        iv: encrypted.iv,
        tag: encrypted.tag,
        flowSummary,
        sourceIp,
        destIp: targetIp,
        status: "QUEUED",
      },
    });

    return record.id;
  }

  /**
   * Get queue statistics and current tenant adapter info.
   */
  async getStats(orgId: string) {
    const [queuedCount, fpQueued, tpQueued, adapter] = await Promise.all([
      prisma.modelFeedbackFlow.count({
        where: { organizationId: orgId, status: "QUEUED" },
      }),
      prisma.modelFeedbackFlow.count({
        where: { organizationId: orgId, status: "QUEUED", label: "BENIGN" },
      }),
      prisma.modelFeedbackFlow.count({
        where: { organizationId: orgId, status: "QUEUED", label: "MALICIOUS" },
      }),
      prisma.tenantAdapter.findUnique({
        where: { organizationId: orgId },
      }),
    ]);

    return {
      queued: queuedCount,
      queuedFalsePositives: fpQueued,
      queuedConfirmedAttacks: tpQueued,
      adapter: adapter
        ? {
            version: adapter.version,
            sampleCount: adapter.sampleCount,
            fpCount: adapter.fpCount,
            tpCount: adapter.tpCount,
            lastTrainedAt: adapter.lastTrainedAt,
          }
        : null,
    };
  }

  /**
   * Pull and decrypt all pending feedback samples for retraining.
   */
  async pullDecryptedQueue(orgId: string): Promise<DecryptedFeedbackSample[]> {
    const pending = await prisma.modelFeedbackFlow.findMany({
      where: { organizationId: orgId, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      take: 1000,
    });

    const samples: DecryptedFeedbackSample[] = [];

    for (const item of pending) {
      try {
        const decrypted = this.decryptFeatures(
          { ciphertext: item.encryptedFeatures, iv: item.iv, tag: item.tag },
          orgId
        ) as Record<string, number> | number[];

        samples.push({
          id: item.id,
          label: item.label as "BENIGN" | "MALICIOUS",
          features: decrypted,
          sourceIp: item.sourceIp ?? undefined,
          destIp: item.destIp ?? undefined,
          flowSummary: item.flowSummary ?? undefined,
        });
      } catch (err) {
        console.error(`Failed decrypting feedback flow ${item.id}:`, err);
      }
    }

    return samples;
  }

  /**
   * Commit retrained adapter weights and mark the batch as ADAPTED.
   */
  async commitAdaptedBatch(params: {
    orgId: string;
    flowIds: string[];
    weightsJson: string;
    fpCount: number;
    tpCount: number;
  }) {
    const { orgId, flowIds, weightsJson, fpCount, tpCount } = params;

    await prisma.$transaction(async (tx) => {
      // 1. Mark batch as adapted
      if (flowIds.length > 0) {
        await tx.modelFeedbackFlow.updateMany({
          where: { id: { in: flowIds }, organizationId: orgId },
          data: { status: "ADAPTED", adaptedAt: new Date() },
        });
      }

      // 2. Upsert TenantAdapter
      const existing = await tx.tenantAdapter.findUnique({
        where: { organizationId: orgId },
      });

      if (existing) {
        await tx.tenantAdapter.update({
          where: { organizationId: orgId },
          data: {
            version: existing.version + 1,
            weightsJson,
            sampleCount: existing.sampleCount + flowIds.length,
            fpCount: existing.fpCount + fpCount,
            tpCount: existing.tpCount + tpCount,
            lastTrainedAt: new Date(),
          },
        });
      } else {
        await tx.tenantAdapter.create({
          data: {
            organizationId: orgId,
            version: 1,
            weightsJson,
            sampleCount: flowIds.length,
            fpCount,
            tpCount,
            lastTrainedAt: new Date(),
          },
        });
      }
    });
  }
}

export const feedbackQueueService = new FeedbackQueueService();
