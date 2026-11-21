import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

console.log("=== Testing Kairo Enterprise Packaging & Air-Gapped Deployment Config ===");

const filesToCheck = [
  "docker-compose.enterprise.yml",
  "deploy/Caddyfile",
  ".env.enterprise.example",
  "api/Dockerfile",
  "ml/Dockerfile",
  "frontend/Dockerfile",
];

for (const file of filesToCheck) {
  assert.ok(fs.existsSync(file), `Expected deployment file '${file}' to exist.`);
  const stats = fs.statSync(file);
  assert.ok(stats.size > 50, `File '${file}' appears too small or empty (${stats.size} bytes).`);
  console.log(`✓ Verified ${file} exists and is populated (${stats.size} bytes)`);
}

// Check docker-compose content
const composeContent = fs.readFileSync("docker-compose.enterprise.yml", "utf8");
assert.ok(composeContent.includes("postgres:16-alpine"), "Must use hardened postgres:16-alpine");
assert.ok(composeContent.includes("kairo_backend:\n    internal: true"), "Backend network must be internal (air-gapped)");
assert.ok(composeContent.includes("kairo-ml"), "Must declare kairo-ml service");
assert.ok(composeContent.includes("kairo-api"), "Must declare kairo-api service");
assert.ok(composeContent.includes("kairo-gateway"), "Must declare reverse proxy gateway");
console.log("✓ docker-compose.enterprise.yml structure & network isolation verified");

// Check Caddyfile
const caddyContent = fs.readFileSync("deploy/Caddyfile", "utf8");
assert.ok(caddyContent.includes("reverse_proxy kairo-api:8000"), "Caddyfile must route API");
assert.ok(caddyContent.includes("reverse_proxy kairo-frontend:3000"), "Caddyfile must route Web Console");
assert.ok(caddyContent.includes("X-Frame-Options \"DENY\""), "Caddyfile must enforce SOC 2 security headers");
console.log("✓ Ingress Caddyfile reverse proxy & security headers verified");

console.log("\nAll Enterprise Packaging verification checks passed successfully!\n");
