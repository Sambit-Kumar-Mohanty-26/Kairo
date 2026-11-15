import { EventEmitter } from "node:events";
import { prisma } from "../db.js";
import { classify, Verdict } from "../model.js";

export interface FlowItem {
  id: string;
  started_at: Date;
  source_ip: string;
  source_port: number;
  target_ip: string;
  target_port: number;
  protocol: string;
  bytes: number;
  features: Record<string, number>;
}

export interface IngestJob {
  id: string;
  sensorId: string;
  organizationId: string;
  batchId: string;
  flows: FlowItem[];
  enqueuedAt: Date;
  retries: number;
  maxRetries: number;
}

export interface DeadLetterEntry {
  jobId: string;
  sensorId: string;
  batchId: string;
  flowsCount: number;
  failedAt: Date;
  error: string;
  retriesAttempted: number;
}

export interface QueueMetrics {
  queueDepth: number;
  activeWorkers: number;
  maxConcurrency: number;
  maxCapacity: number;
  totalProcessed: number;
  totalErrors: number;
  totalShed: number;
  deadLetterCount: number;
  circuitBreaker: {
    state: "CLOSED" | "OPEN" | "HALF_OPEN";
    consecutiveFailures: number;
    lastFailureTime: Date | null;
  };
}

class CircuitBreaker {
  public state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  public consecutiveFailures = 0;
  public lastFailureTime: Date | null = null;
  private readonly failureThreshold = 3;
  private readonly cooldownMs = 10_000;

  public canExecute(): boolean {
    if (this.state === "CLOSED") return true;
    if (this.state === "OPEN") {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime.getTime() > this.cooldownMs) {
        this.state = "HALF_OPEN";
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow probe
    return true;
  }

  public recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }

  public recordFailure(): void {
    this.consecutiveFailures += 1;
    this.lastFailureTime = new Date();
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }
}

const minuteOf = (d: Date) => new Date(Math.floor(d.getTime() / 60_000) * 60_000);

export class IngestQueueService extends EventEmitter {
  private queue: IngestJob[] = [];
  private deadLetterQueue: DeadLetterEntry[] = [];
  private activeWorkers = 0;
  private maxConcurrency = Number(process.env.INGEST_CONCURRENCY ?? 4);
  private maxCapacity = Number(process.env.INGEST_QUEUE_CAPACITY ?? 1000);
  private circuitBreaker = new CircuitBreaker();

  private totalProcessed = 0;
  private totalErrors = 0;
  private totalShed = 0;

  constructor() {
    super();
  }

  public getMetrics(): QueueMetrics {
    return {
      queueDepth: this.queue.length,
      activeWorkers: this.activeWorkers,
      maxConcurrency: this.maxConcurrency,
      maxCapacity: this.maxCapacity,
      totalProcessed: this.totalProcessed,
      totalErrors: this.totalErrors,
      totalShed: this.totalShed,
      deadLetterCount: this.deadLetterQueue.length,
      circuitBreaker: {
        state: this.circuitBreaker.state,
        consecutiveFailures: this.circuitBreaker.consecutiveFailures,
        lastFailureTime: this.circuitBreaker.lastFailureTime,
      },
    };
  }

  public getDeadLetters(limit = 50): DeadLetterEntry[] {
    return this.deadLetterQueue.slice(-limit);
  }

  public canEnqueue(): boolean {
    return this.queue.length < this.maxCapacity;
  }

  public enqueue(job: Omit<IngestJob, "id" | "enqueuedAt" | "retries" | "maxRetries">): IngestJob {
    if (!this.canEnqueue()) {
      this.totalShed += 1;
      throw new Error("INGEST_QUEUE_OVERFLOW: Ingestion queue capacity exceeded; backpressure shed applied");
    }

    const fullJob: IngestJob = {
      ...job,
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      enqueuedAt: new Date(),
      retries: 0,
      maxRetries: 3,
    };

    this.queue.push(fullJob);
    this.processNext();
    return fullJob;
  }

  private async processNext(): Promise<void> {
    if (this.activeWorkers >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    if (!this.circuitBreaker.canExecute()) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeWorkers += 1;

    try {
      await this.executeJob(job);
      this.circuitBreaker.recordSuccess();
      this.totalProcessed += 1;
    } catch (err: any) {
      this.totalErrors += 1;
      const isCircuitError = err?.status === 503 || err?.message?.includes("model service");
      if (isCircuitError) {
        this.circuitBreaker.recordFailure();
      }

      if (job.retries < job.maxRetries) {
        job.retries += 1;
        // Exponential backoff requeue
        const delay = Math.pow(2, job.retries) * 500;
        setTimeout(() => {
          this.queue.unshift(job);
          this.processNext();
        }, delay);
      } else {
        // Route to DLQ
        this.deadLetterQueue.push({
          jobId: job.id,
          sensorId: job.sensorId,
          batchId: job.batchId,
          flowsCount: job.flows.length,
          failedAt: new Date(),
          error: String(err?.message || err),
          retriesAttempted: job.retries,
        });
        if (this.deadLetterQueue.length > 500) {
          this.deadLetterQueue.shift();
        }
      }
    } finally {
      this.activeWorkers -= 1;
      setImmediate(() => this.processNext());
    }
  }

  public async executeJob(job: IngestJob): Promise<{ accepted: number; attacks: number }> {
    const { flows, sensorId, organizationId, batchId } = job;

    const verdicts = await classify(flows.map((f) => f.features));

    const detections = flows
      .map((f, i) => ({ f, v: verdicts[i] }))
      .filter(({ v }) => v.attack !== "Normal")
      .map(({ f, v }) => ({
        sensorId,
        organizationId,
        flowId: f.id,
        attack: v.attack,
        confidence: v.confidence,
        risk: v.risk,
        severity: v.severity,
        features: v.features,
        modelTag: v.model,
        sourceIp: f.source_ip,
        sourcePort: f.source_port,
        targetIp: f.target_ip,
        targetPort: f.target_port,
        protocol: f.protocol,
        startedAt: f.started_at,
      }));

    const buckets = new Map<number, { flows: number; attacks: number; bytes: number }>();
    for (const [i, f] of flows.entries()) {
      const key = minuteOf(f.started_at).getTime();
      const b = buckets.get(key) ?? { flows: 0, attacks: 0, bytes: 0 };
      b.flows += 1;
      b.bytes += f.bytes;
      if (verdicts[i].attack !== "Normal") b.attacks += 1;
      buckets.set(key, b);
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.detection.createMany({ data: detections, skipDuplicates: true }),
      ...[...buckets].map(
        ([ms, b]) => prisma.$executeRaw`
          INSERT INTO flow_rollups (id, sensor_id, minute, flows, attacks, bytes)
          VALUES (gen_random_uuid(), ${sensorId}::uuid, ${new Date(ms)}, ${b.flows}, ${b.attacks}, ${b.bytes})
          ON CONFLICT (sensor_id, minute) DO UPDATE
            SET flows   = flow_rollups.flows   + EXCLUDED.flows,
                attacks = flow_rollups.attacks + EXCLUDED.attacks,
                bytes   = flow_rollups.bytes   + EXCLUDED.bytes`,
      ),
      prisma.ingestedBatch.create({
        data: {
          sensorId,
          batchId,
          flowCount: flows.length,
          createdAt: now,
        },
      }),
      prisma.sensor.update({
        where: { id: sensorId },
        data: {
          lastSeenAt: now,
          lastUploadAt: now,
          lastBatchId: batchId,
          status: "online",
        },
      }),
    ]);

    return { accepted: flows.length, attacks: detections.length };
  }
}

export const ingestQueue = new IngestQueueService();
