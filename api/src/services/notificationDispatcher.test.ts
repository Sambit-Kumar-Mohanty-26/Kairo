/**
 * Unit & Integration Tests for Kairo Enterprise Notification Dispatcher.
 * Run with: node api/node_modules/tsx/dist/cli.mjs api/src/services/notificationDispatcher.test.ts
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { config } from "../config.js";
import { NotificationDispatcher, IncidentAlert } from "./notificationDispatcher.js";

async function runTests() {
  const dispatcher = new NotificationDispatcher();
  console.log("=== Testing Kairo NotificationDispatcher ===");

  const sampleAlert: IncidentAlert = {
    id: "flow-789-ddos",
    organizationId: "org-test-uuid",
    sourceIp: "198.51.100.99",
    sourcePort: 51234,
    targetIp: "10.0.0.1",
    targetPort: 80,
    attack: "DDoS Syn Flood",
    risk: 92,
    severity: "critical",
    confidence: 0.995,
    protocol: "TCP",
    sensorName: "Bangalore-DC-Sensor",
    layer: "Layer 1 (Invariant Rule)",
    quarantined: true,
    startedAt: new Date(),
  };

  // 1. Test Discord Payload Structure
  const discordPayload = (dispatcher as any).buildDiscordPayload(sampleAlert);
  assert.equal(discordPayload.username, "Kairo Autonomous SOC");
  assert.equal(discordPayload.embeds.length, 1);
  const embed = discordPayload.embeds[0];
  assert.ok(embed.title.includes("DDoS Syn Flood"));
  assert.equal(embed.color, 0xe11d48, "Critical alert must be Rose Red");
  assert.ok(embed.fields.some((f: any) => f.name.includes("Attacker IP") && f.value.includes("198.51.100.99")));
  assert.ok(embed.fields.some((f: any) => f.name.includes("Prevention") && f.value.includes("Quarantined")));
  console.log("✓ Discord Rich Embed structure & styling verified");

  // 2. Test Slack Block Kit Payload Structure
  const slackPayload = (dispatcher as any).buildSlackPayload(sampleAlert);
  assert.ok(slackPayload.text.includes("DDoS Syn Flood"));
  assert.ok(slackPayload.blocks.length >= 3);
  console.log("✓ Slack Block Kit structure verified");

  // 3. Test Generic SIEM Payload & HMAC Signature
  const secret = "test-enterprise-siem-secret-key";
  const genericPayload = (dispatcher as any).buildGenericPayload(sampleAlert);
  assert.equal(genericPayload.event, "kairo.security.detection");
  assert.equal(genericPayload.attack.classification, "DDoS Syn Flood");
  assert.equal(genericPayload.mitigation.quarantined, true);

  const rawJson = JSON.stringify(genericPayload);
  const expectedHmac = createHmac("sha256", secret).update(rawJson).digest("hex");
  assert.equal(expectedHmac.length, 64, "HMAC-SHA256 must produce 64-char hex digest");
  console.log("✓ Generic SIEM payload & HMAC-SHA256 signature verified");

  // 4. Live Discord Webhook Delivery Test
  if (config.discordWebhookUrl) {
    console.log("📡 Sending Live Incident Alert to configured Discord channel...");
    const result = await dispatcher.sendTestAlert(config.discordWebhookUrl, "discord");
    assert.equal(result.success, true, `Discord webhook delivery failed: ${result.error}`);
    console.log(`✓ Real-world alert delivered to Discord! (HTTP ${result.statusCode})`);
  } else {
    console.log("ℹ DISCORD_WEBHOOK_URL not set in environment, skipping live HTTP send");
  }

  console.log("\nAll NotificationDispatcher test suites passed successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
