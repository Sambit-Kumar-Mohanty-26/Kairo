/**
 * Kairo Active Mitigation Service (IPS Quarantine Manager).
 *
 * Coordinates:
 * 1. Host OS firewall drop rules (via MitigationDriver)
 * 2. Database audit records (via Prisma quarantine_rules)
 * 3. Layer 4 in-memory threat intelligence synchronization (via ML service)
 */

import { prisma } from "../db.js";
import { callModel } from "../model.js";
import { mitigationDriver, DriverResult } from "./mitigationDriver.js";

export interface QuarantineRequest {
  organizationId: string;
  sourceIp: string;
  reason: string;
  attack?: string;
  risk?: number;
  severity?: string;
  flowId?: string;
  sensorId?: string;
  expiresInMinutes?: number;
}

export interface ReleaseRequest {
  organizationId: string;
  ruleId?: string;
  sourceIp?: string;
  unblockedBy?: string;
}

export class MitigationService {
  /**
   * Enforce quarantine on a malicious IP address across the OS firewall,
   * database audit trail, and distributed Layer 4 threat intelligence.
   */
  public async quarantineIp(req: QuarantineRequest): Promise<{
    rule: any;
    driverResult: DriverResult;
    layer4Synced: boolean;
  }> {
    const { organizationId, sourceIp, reason, attack, risk = 0, severity, flowId, sensorId, expiresInMinutes } = req;

    // 1. Validate IP safety
    const check = mitigationDriver.validateIp(sourceIp);
    if (!check.valid) {
      throw new Error(check.reason);
    }

    // 2. Check if already actively quarantined
    const existing = await prisma.quarantineRule.findFirst({
      where: {
        organizationId,
        sourceIp,
        status: "active",
      },
    });

    if (existing) {
      return {
        rule: existing,
        driverResult: {
          success: true,
          driver: process.platform === "win32" ? "netsh" : "iptables",
          command: "noop",
          output: "IP is already actively quarantined.",
        },
        layer4Synced: true,
      };
    }

    // 3. Enforce Host OS Firewall Rule
    const driverResult = await mitigationDriver.blockIp(sourceIp, reason);

    // 4. Calculate expiration if temporary quarantine
    let expiresAt: Date | null = null;
    if (expiresInMinutes && expiresInMinutes > 0) {
      expiresAt = new Date(Date.now() + expiresInMinutes * 60_000);
    }

    // 5. Persist to PostgreSQL Quarantine Audit Table
    const rule = await prisma.quarantineRule.create({
      data: {
        organizationId,
        sourceIp,
        reason,
        attack,
        risk,
        severity,
        flowId,
        sensorId,
        status: "active",
        expiresAt,
      },
    });

    // 6. Broadcast to Layer 4 Threat Intelligence (O(1) ~50ns in-memory interception)
    let layer4Synced = false;
    try {
      await callModel("/threat-intel/indicators", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          indicator: sourceIp,
          reason: `Auto-IPS Quarantine: ${reason} (Risk: ${risk})`,
        }),
      });
      layer4Synced = true;
    } catch {
      // Background ML broadcast failure does not abort host firewall rule
      layer4Synced = false;
    }

    return { rule, driverResult, layer4Synced };
  }

  /**
   * Release an IP address from active quarantine.
   */
  public async releaseIp(req: ReleaseRequest): Promise<{
    rule: any;
    driverResult: DriverResult;
  }> {
    const { organizationId, ruleId, sourceIp, unblockedBy = "admin" } = req;

    let targetRule: any = null;

    if (ruleId) {
      targetRule = await prisma.quarantineRule.findFirst({
        where: { id: ruleId, organizationId },
      });
    } else if (sourceIp) {
      targetRule = await prisma.quarantineRule.findFirst({
        where: { sourceIp, organizationId, status: "active" },
      });
    }

    if (!targetRule) {
      throw new Error("Active quarantine rule not found for the specified target.");
    }

    // 1. Remove Host OS Firewall Rule
    const driverResult = await mitigationDriver.unblockIp(targetRule.sourceIp);

    // 2. Update Database Record
    const updated = await prisma.quarantineRule.update({
      where: { id: targetRule.id },
      data: {
        status: "released",
        unblockedAt: new Date(),
        unblockedBy,
      },
    });

    return { rule: updated, driverResult };
  }

  /**
   * List quarantine rules for an organization with optional status filtering.
   */
  public async listQuarantines(organizationId: string, status?: string) {
    const where: any = { organizationId };
    if (status && status !== "all") {
      where.status = status;
    }
    return prisma.quarantineRule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        sensor: {
          select: { name: true },
        },
      },
    });
  }

  /**
   * Operational statistics on active quarantine coverage.
   */
  public async getQuarantineStats(organizationId: string) {
    const [totalActive, totalReleased, totalAuto, recentBlocks] = await Promise.all([
      prisma.quarantineRule.count({
        where: { organizationId, status: "active" },
      }),
      prisma.quarantineRule.count({
        where: { organizationId, status: "released" },
      }),
      prisma.quarantineRule.count({
        where: { organizationId, reason: { startsWith: "AUTOMATED" } },
      }),
      prisma.quarantineRule.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          sourceIp: true,
          attack: true,
          risk: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      activeBlocks: totalActive,
      releasedBlocks: totalReleased,
      automatedBlocks: totalAuto,
      recentBlocks,
      firewallDriver: process.platform === "win32" ? "netsh (Windows AdvFirewall)" : "iptables (Linux Netfilter)",
    };
  }
}

export const mitigationService = new MitigationService();
