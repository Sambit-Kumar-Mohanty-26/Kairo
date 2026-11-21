/**
 * Unit Tests for Kairo Active Mitigation Engine & Host Firewall Driver.
 * Run with: npx tsx src/services/mitigationDriver.test.ts
 */

import assert from "node:assert/strict";
import { MitigationDriver } from "./mitigationDriver.js";

async function runTests() {
  const driver = new MitigationDriver();

  console.log("=== Testing MitigationDriver Security & Invariants ===");

  // 1. IP Validation
  assert.equal(driver.validateIp("192.168.1.100").valid, true);
  assert.equal(driver.validateIp("10.0.0.5").valid, true);
  assert.equal(driver.validateIp("2001:db8::1").valid, true);
  assert.equal(driver.validateIp("").valid, false, "Empty string must be rejected");
  assert.equal(driver.validateIp("not-an-ip").valid, false, "Malformed string must be rejected");
  assert.equal(driver.validateIp("192.168.1.1; rm -rf /").valid, false, "Command injection must be rejected");
  assert.equal(driver.validateIp("999.999.999.999").valid, false, "Out of range IP must be rejected");

  // 2. Immutability Whitelist Protection
  assert.equal(driver.validateIp("127.0.0.1").valid, false, "Loopback must be protected");
  assert.equal(driver.validateIp("127.0.1.1").valid, false, "127.x.x.x must be protected");
  assert.equal(driver.validateIp("::1").valid, false, "IPv6 loopback must be protected");
  assert.equal(driver.validateIp("localhost").valid, false, "localhost must be protected");
  assert.equal(driver.validateIp("8.8.8.8").valid, false, "Critical DNS must be protected");
  assert.equal(driver.validateIp("1.1.1.1").valid, false, "Critical DNS must be protected");

  console.log("✓ IP validation and whitelist protections passed");

  // 3. Block Command Execution Handling
  const blockResult = await driver.blockIp("198.51.100.77", "TEST_SUITE");
  assert.ok(blockResult.driver === "netsh" || blockResult.driver === "iptables");
  console.log(`✓ OS Firewall driver execution tested (${blockResult.driver})`);

  // 4. Unblock Command Execution Handling
  const unblockResult = await driver.unblockIp("198.51.100.77");
  assert.ok(unblockResult.driver === "netsh" || unblockResult.driver === "iptables");
  console.log(`✓ OS Firewall driver release tested (${unblockResult.driver})`);

  // 5. Attempting to block loopback must return safe failure
  const safeFail = await driver.blockIp("127.0.0.1");
  assert.equal(safeFail.success, false);
  assert.ok(safeFail.error?.includes("whitelist"));
  console.log("✓ Safety invariant preventing system lockout verified");

  console.log("\nAll 5 MitigationDriver test suites passed successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
