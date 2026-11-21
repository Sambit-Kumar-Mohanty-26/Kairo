/**
 * Kairo Active Mitigation Engine — Host OS Firewall Driver.
 *
 * Enforces hardware-speed L3/L4 packet dropping at the operating system level:
 * - Linux: iptables / nftables kernel netfilter drop rules
 * - Windows: netsh advfirewall inbound block rules
 *
 * Security Invariants:
 * 1. Strict IP sanitization: Reject shell metacharacters and non-IP strings.
 * 2. Whitelist protection: Critical system, loopback, and gateway IPs are immutable.
 * 3. Safe invocation: child_process.execFile prevents shell injection attacks.
 */

import { execFile } from "node:child_process";
import { isIP } from "node:net";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Critical addresses that must NEVER be quarantined to prevent system lockout
const IMMUTABLE_WHITELIST = new Set<string>([
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "localhost",
  "8.8.8.8",
  "1.1.1.1",
]);

export interface DriverResult {
  success: boolean;
  driver: "iptables" | "netsh" | "unsupported";
  command: string;
  output: string;
  error?: string;
  isMocked?: boolean;
}

export class MitigationDriver {
  private readonly platform = process.platform;

  /**
   * Validate that an indicator is a clean IPv4 or IPv6 address and not whitelisted.
   */
  public validateIp(ip: string): { valid: boolean; reason?: string } {
    const cleanIp = ip.trim();
    if (!cleanIp) {
      return { valid: false, reason: "IP address cannot be empty." };
    }
    if (isIP(cleanIp) === 0) {
      return { valid: false, reason: `Invalid IPv4/IPv6 address format: '${cleanIp}'` };
    }
    if (IMMUTABLE_WHITELIST.has(cleanIp) || cleanIp.startsWith("127.")) {
      return { valid: false, reason: `Safety check violation: '${cleanIp}' is protected by whitelist.` };
    }
    return { valid: true };
  }

  /**
   * Enforce an inbound packet drop rule on the host firewall.
   */
  public async blockIp(ip: string, reason = "KAIRO_IPS_QUARANTINE"): Promise<DriverResult> {
    const check = this.validateIp(ip);
    if (!check.valid) {
      return {
        success: false,
        driver: this.platform === "win32" ? "netsh" : "iptables",
        command: "validateIp",
        output: "",
        error: check.reason,
      };
    }

    const cleanIp = ip.trim();

    if (this.platform === "linux") {
      return this.blockLinux(cleanIp);
    } else if (this.platform === "win32") {
      return this.blockWindows(cleanIp, reason);
    } else {
      return {
        success: false,
        driver: "unsupported",
        command: "unsupported_os",
        output: "",
        error: `Host platform '${this.platform}' does not support native kernel firewall manipulation.`,
      };
    }
  }

  /**
   * Release an inbound packet drop rule from the host firewall.
   */
  public async unblockIp(ip: string): Promise<DriverResult> {
    const check = this.validateIp(ip);
    if (!check.valid) {
      return {
        success: false,
        driver: this.platform === "win32" ? "netsh" : "iptables",
        command: "validateIp",
        output: "",
        error: check.reason,
      };
    }

    const cleanIp = ip.trim();

    if (this.platform === "linux") {
      return this.unblockLinux(cleanIp);
    } else if (this.platform === "win32") {
      return this.unblockWindows(cleanIp);
    } else {
      return {
        success: false,
        driver: "unsupported",
        command: "unsupported_os",
        output: "",
        error: `Host platform '${this.platform}' does not support native kernel firewall manipulation.`,
      };
    }
  }

  /* ---------------- Linux iptables implementation ---------------- */

  private async blockLinux(ip: string): Promise<DriverResult> {
    const cmd = "iptables";
    const args = ["-I", "INPUT", "-s", ip, "-j", "DROP", "-m", "comment", "--comment", "KAIRO_IPS_QUARANTINE"];
    try {
      // First check if rule already exists to avoid duplicates
      try {
        await execFileAsync("iptables", ["-C", "INPUT", "-s", ip, "-j", "DROP"]);
        return {
          success: true,
          driver: "iptables",
          command: `${cmd} ${args.join(" ")}`,
          output: "Rule already active in iptables.",
        };
      } catch {
        // Not present, proceed to insert
      }

      const { stdout } = await execFileAsync(cmd, args);
      return {
        success: true,
        driver: "iptables",
        command: `${cmd} ${args.join(" ")}`,
        output: stdout.trim(),
      };
    } catch (err: any) {
      return {
        success: false,
        driver: "iptables",
        command: `${cmd} ${args.join(" ")}`,
        output: "",
        error: err?.stderr || err?.message || "Failed to execute iptables command (check root privileges).",
      };
    }
  }

  private async unblockLinux(ip: string): Promise<DriverResult> {
    const cmd = "iptables";
    const args = ["-D", "INPUT", "-s", ip, "-j", "DROP"];
    try {
      const { stdout } = await execFileAsync(cmd, args);
      return {
        success: true,
        driver: "iptables",
        command: `${cmd} ${args.join(" ")}`,
        output: stdout.trim(),
      };
    } catch (err: any) {
      return {
        success: false,
        driver: "iptables",
        command: `${cmd} ${args.join(" ")}`,
        output: "",
        error: err?.stderr || err?.message || "Failed to remove iptables drop rule.",
      };
    }
  }

  /* ---------------- Windows netsh implementation ---------------- */

  private async blockWindows(ip: string, reason: string): Promise<DriverResult> {
    const ruleName = `KAIRO_BLOCK_${ip.replace(/[:.]/g, "_")}`;
    const cmd = "netsh";
    const args = [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${ruleName}`,
      "dir=in",
      "action=block",
      `remoteip=${ip}`,
      `description=Kairo Automated IPS Quarantine: ${reason}`,
    ];

    try {
      // Delete existing rule with same name if any
      try {
        await execFileAsync("netsh", ["advfirewall", "firewall", "delete", "rule", `name=${ruleName}`]);
      } catch {
        // Ignored if rule does not exist yet
      }

      const { stdout } = await execFileAsync(cmd, args);
      return {
        success: true,
        driver: "netsh",
        command: `${cmd} ${args.join(" ")}`,
        output: stdout.trim(),
      };
    } catch (err: any) {
      return {
        success: false,
        driver: "netsh",
        command: `${cmd} ${args.join(" ")}`,
        output: "",
        error: err?.stderr || err?.message || "Failed to execute netsh rule (administrator privileges required).",
      };
    }
  }

  private async unblockWindows(ip: string): Promise<DriverResult> {
    const ruleName = `KAIRO_BLOCK_${ip.replace(/[:.]/g, "_")}`;
    const cmd = "netsh";
    const args = ["advfirewall", "firewall", "delete", "rule", `name=${ruleName}`];

    try {
      const { stdout } = await execFileAsync(cmd, args);
      return {
        success: true,
        driver: "netsh",
        command: `${cmd} ${args.join(" ")}`,
        output: stdout.trim(),
      };
    } catch (err: any) {
      return {
        success: false,
        driver: "netsh",
        command: `${cmd} ${args.join(" ")}`,
        output: "",
        error: err?.stderr || err?.message || "Failed to delete netsh firewall rule.",
      };
    }
  }
}

export const mitigationDriver = new MitigationDriver();
