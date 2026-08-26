/**
 * Test-Runner — führt alle tests/*.test.js aus.
 * Run: node tests/run.js
 * Exit-Code 1 bei mindestens einem Fehler (CI-tauglich).
 */
import { setupMocks } from './helpers.js';
setupMocks();

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.test.js'))
    .sort();

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
    const mod = await import(url.pathToFileURL(path.join(__dirname, file)).href);
    const tests = mod.tests || [];
    for (const t of tests) {
        try {
            t.fn();
            passed++;
            console.log(`  ✓ ${t.name}`);
        } catch (e) {
            failed++;
            failures.push({ suite: file, name: t.name, error: e.message });
            console.error(`  ✗ ${t.name}\n      ${e.message}`);
        }
    }
}

console.log(`\n=== ${passed} bestanden, ${failed} fehlgeschlagen (${files.length} Suites) ===`);
if (failed > 0) {
    process.exitCode = 1;
}
