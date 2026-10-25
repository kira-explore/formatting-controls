import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { join } from "node:path";
import * as vscode from "vscode";
import type { Dashboard } from "../../src/dashboard";

export async function profileDashboard(dashboard: Dashboard): Promise<void> {
  const directory = process.env.FORMATTING_CONTROLS_REPORT_DIR;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  await dashboard.snapshot();
  const session = new Session();
  session.connect();
  try {
    await session.post("Profiler.enable");
    await session.post("Profiler.start");
    const cpu = process.cpuUsage();
    const samples: number[] = [];
    for (let i = 0; i < 40; i++) {
      const start = performance.now();
      await dashboard.snapshot();
      samples.push(performance.now() - start);
    }
    const elapsed = process.cpuUsage(cpu);
    const { profile } = await session.post("Profiler.stop");
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Infinity;
    const report = {
      host: vscode.version,
      platform: process.platform,
      arch: process.arch,
      operation: "warm complete dashboard snapshot",
      samples: samples.length,
      medianMs: samples[Math.floor(samples.length / 2)],
      p95Ms: p95,
      maxMs: samples.at(-1),
      cpuUserMs: elapsed.user / 1000,
      cpuSystemMs: elapsed.system / 1000,
      heapUsedBytes: process.memoryUsage().heapUsed,
    };
    writeFileSync(
      join(directory, "performance.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    writeFileSync(
      join(directory, "dashboard.cpuprofile"),
      JSON.stringify(profile),
    );
    assert.ok(p95 < 500, `Warm dashboard snapshot p95 exceeds 500 ms: ${p95}`);
    console.log("Dashboard profile:", JSON.stringify(report));
  } finally {
    session.disconnect();
  }
}
