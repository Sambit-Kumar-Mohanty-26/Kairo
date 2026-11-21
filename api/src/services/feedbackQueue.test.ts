import assert from "node:assert/strict";
import { feedbackQueueService } from "./feedbackQueue.js";

async function runTests() {
  console.log("=== Testing Kairo Closed-Loop AES-256-GCM Feedback Queue ===");

  const orgA = "00000000-0000-0000-0000-000000000001";
  const orgB = "00000000-0000-0000-0000-000000000002";

  const rawFlowFeatures = {
    duration: 1.45,
    bytes_in: 45000,
    bytes_out: 12000,
    packets_in: 32,
    packets_out: 15,
    syn_ratio: 0.05,
    dest_port: 443,
    l4_proto: 6,
  };

  // 1. Authenticated Encryption
  const encrypted = feedbackQueueService.encryptFeatures(rawFlowFeatures, orgA);
  assert.ok(encrypted.ciphertext.length > 0, "Ciphertext must not be empty");
  assert.equal(encrypted.iv.length, 24, "IV must be 12 bytes hex (24 chars)");
  assert.equal(encrypted.tag.length, 32, "GCM Tag must be 16 bytes hex (32 chars)");
  console.log("✓ AES-256-GCM authenticated encryption verified");

  // 2. Exact Decryption & Plaintext Recovery
  const decrypted = feedbackQueueService.decryptFeatures(encrypted, orgA) as typeof rawFlowFeatures;
  assert.deepEqual(decrypted, rawFlowFeatures, "Decrypted features must perfectly match input");
  console.log("✓ Authenticated decryption & plaintext recovery verified");

  // 3. Tamper Resistance (Ciphertext alteration)
  const tamperedCiphertext = {
    ...encrypted,
    ciphertext: encrypted.ciphertext.substring(0, encrypted.ciphertext.length - 2) + "ff",
  };
  assert.throws(
    () => feedbackQueueService.decryptFeatures(tamperedCiphertext, orgA),
    /Unsupported state or unable to authenticate data/,
    "Tampered ciphertext must fail GCM authentication check"
  );
  console.log("✓ Tamper detection (modified ciphertext throws) verified");

  // 4. Tamper Resistance (Tag alteration)
  const tamperedTag = {
    ...encrypted,
    tag: "00000000000000000000000000000000",
  };
  assert.throws(
    () => feedbackQueueService.decryptFeatures(tamperedTag, orgA),
    /Unsupported state or unable to authenticate data/,
    "Invalid GCM auth tag must fail authentication"
  );
  console.log("✓ Tamper detection (invalid auth tag throws) verified");

  // 5. Tenant Isolation (Decryption with different tenant key fails)
  assert.throws(
    () => feedbackQueueService.decryptFeatures(encrypted, orgB),
    /Unsupported state or unable to authenticate data/,
    "Cross-tenant decryption attempt must fail (Tenant Isolation)"
  );
  console.log("✓ Cross-tenant isolation (Tenant B cannot decrypt Tenant A's flow) verified");

  console.log("\nAll Feedback Queue Cryptographic & Integrity tests passed successfully!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
