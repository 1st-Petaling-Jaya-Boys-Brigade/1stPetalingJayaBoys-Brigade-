/**
 * 1st Petaling Jaya Boys' Brigade Portal - Master E2E Test Suite Runner
 * File: tests/e2e/run-e2e-suite.js
 *
 * Master CLI orchestrator executing all 4 tiers:
 * Tier 1: Feature Coverage (>= 125 tests)
 * Tier 2: Boundary & Corner Cases (>= 125 tests)
 * Tier 3: Pairwise Combinations (>= 25 tests)
 * Tier 4: Real-World Application Scenarios (>= 7 scenarios)
 *
 * CLI Options:
 *   --tier=1|2|3|4|all    Execute selected tier (default: all)
 *   --tier 1|2|3|4|all    Space-separated tier option
 *   --feature=CODE        Filter by feature code (e.g. --feature=SEC-01)
 *   --grep=PATTERN        Filter tests by description regex
 *   --bail                Halt suite execution on first test failure
 *   --verbose, -v         Enable verbose test-level timing and execution logs
 */

'use strict';

const { FEATURES } = require('./harness');
const tier1Suite = require('./tier1-feature-coverage.test');
const tier2Suite = require('./tier2-boundary-corner.test');
const tier3Suite = require('./tier3-pairwise-combinations.test');
const tier4Suite = require('./tier4-application-scenarios.test');

// ANSI Color Constants
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

const VALID_TIERS = new Set(['1', '2', '3', '4', 'all']);

function parseCliArgs(argv = process.argv.slice(2)) {
  let tier = 'all';
  let feature = null;
  let grep = null;
  let bail = false;
  let verbose = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--all') {
      tier = 'all';
      continue;
    }
    if (arg === '--bail') {
      bail = true;
      continue;
    }
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
      continue;
    }

    if (arg === '--tier' || arg.startsWith('--tier=')) {
      const val = arg === '--tier' ? argv[++i] : arg.slice('--tier='.length);
      if (val === undefined || val === '' || val.startsWith('-')) {
        return { error: 'Missing value for --tier. Allowed: 1, 2, 3, 4, all' };
      }
      tier = String(val).trim().toLowerCase();
      continue;
    }

    if (arg === '--feature' || arg.startsWith('--feature=')) {
      const val = arg === '--feature' ? argv[++i] : arg.slice('--feature='.length);
      if (val === undefined || val === '' || val.startsWith('-')) {
        return { error: 'Missing value for --feature' };
      }
      feature = String(val).trim();
      continue;
    }

    if (arg === '--grep' || arg.startsWith('--grep=')) {
      const val = arg === '--grep' ? argv[++i] : arg.slice('--grep='.length);
      if (val === undefined || val === '' || val.startsWith('-')) {
        return { error: 'Missing value for --grep' };
      }
      grep = String(val);
      continue;
    }

    if (arg.startsWith('-')) {
      return { error: `Unknown CLI flag "${arg}". Supported: --tier, --all, --feature, --grep, --bail, --verbose` };
    }
    return { error: `Unexpected positional argument "${arg}". Supported flags: --tier, --all, --feature, --grep, --bail, --verbose` };
  }

  if (!VALID_TIERS.has(tier)) {
    return { error: `Invalid --tier "${tier}". Allowed values: 1, 2, 3, 4, all` };
  }

  if (grep !== null) {
    try {
      new RegExp(grep, 'i');
    } catch (err) {
      return { error: `Invalid --grep regex "${grep}": ${err.message}` };
    }
  }

  return { tier, feature, grep, bail, verbose, help, error: null };
}

function printHeader(cli) {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  1ST PETALING JAYA BOYS' BRIGADE PORTAL - 4-TIER E2E TEST AUTOMATION SUITE   ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Mode: Opaque-Box Requirement-Driven | Target Tier: ${cli.tier.toUpperCase()}${C.reset}`);
  if (cli.feature) console.log(`${C.dim}  Feature Filter: ${cli.feature}${C.reset}`);
  if (cli.grep) console.log(`${C.dim}  Grep Pattern: ${cli.grep}${C.reset}`);
  if (cli.bail) console.log(`${C.yellow}  Bail Enabled: Aborting on first failure${C.reset}`);
  console.log('');
}

function summarizeFeatureTier(tierResult, featureCode, minThreshold = 1) {
  if (!tierResult || !Array.isArray(tierResult.results)) {
    return { executed: 0, passed: 0, failed: 0, badge: `${C.dim} - ${C.reset}` };
  }
  const matching = tierResult.results.filter(
    (r) =>
      r.status !== 'skipped' &&
      ((Array.isArray(r.features) && r.features.includes(featureCode)) || r.featureId === featureCode)
  );
  const passed = matching.filter((r) => r.status === 'passed').length;
  const failed = matching.filter((r) => r.status === 'failed').length;
  const executed = passed + failed;

  if (executed === 0) {
    return { executed, passed, failed, badge: `${C.dim} 0 ${C.reset}` };
  }
  if (failed > 0) {
    const label = minThreshold > 1 ? `${passed}/${executed} ✖` : `✖`;
    return { executed, passed, failed, badge: `${C.red}${label}${C.reset}` };
  }
  if (passed < minThreshold) {
    return { executed, passed, failed, badge: `${C.yellow}${passed} !${C.reset}` };
  }
  const okLabel = minThreshold > 1 ? `${passed} ✔` : `✔`;
  return { executed, passed, failed, badge: `${C.green}${okLabel}${C.reset}` };
}

function printCoverageMatrix(resultsByTier) {
  console.log(`\n${C.bold}${C.blue}================================================================================${C.reset}`);
  console.log(`${C.bold}${C.blue}                       25-FEATURE COVERAGE MATRIX TABLE                         ${C.reset}`);
  console.log(`${C.bold}${C.blue}================================================================================${C.reset}`);
  console.log(`${C.bold} #  | Code      | Feature Description                | Tier 1 | Tier 2 | T3 | T4${C.reset}`);
  console.log(`${C.dim}----+-----------+------------------------------------+--------+--------+----+---${C.reset}`);

  for (let i = 0; i < FEATURES.length; i++) {
    const f = FEATURES[i];
    const num = String(i + 1).padStart(2, ' ');
    const code = f.code.padEnd(9, ' ');
    const desc = f.desc.padEnd(34, ' ').slice(0, 34);

    const t1 = summarizeFeatureTier(resultsByTier.t1, f.code, 5);
    const t2 = summarizeFeatureTier(resultsByTier.t2, f.code, 5);
    const t3 = summarizeFeatureTier(resultsByTier.t3, f.code, 1);
    const t4 = summarizeFeatureTier(resultsByTier.t4, f.code, 1);

    console.log(
      ` ${num} | ${code} | ${desc} |  ${t1.badge.padEnd(14, ' ')} |  ${t2.badge.padEnd(14, ' ')} | ${t3.badge.padEnd(11, ' ')} | ${t4.badge}`
    );
  }

  console.log(`${C.dim}----+-----------+------------------------------------+--------+--------+----+---${C.reset}`);
  console.log(` Required Thresholds: Tier 1 (≥5/feat) | Tier 2 (≥5/feat) | Tier 3 (≥25) | Tier 4 (≥7)\n`);
}

async function main() {
  const cli = parseCliArgs();
  if (cli.error) {
    console.error(`\n${C.bold}${C.red}CLI Argument Error:${C.reset} ${cli.error}\n`);
    process.exitCode = 1;
    return;
  }

  if (cli.help) {
    console.log('Usage: node tests/e2e/run-e2e-suite.js [--tier=1|2|3|4|all] [--feature=CODE] [--grep=PATTERN] [--bail] [--verbose]');
    process.exitCode = 0;
    return;
  }

  printHeader(cli);

  const suiteResults = [];
  const resultsByTier = { t1: null, t2: null, t3: null, t4: null };
  let allPassed = true;
  let abortedByBail = false;

  // Tier 1: Feature Coverage
  if (!abortedByBail && (cli.tier === '1' || cli.tier === 'all')) {
    console.log(`${C.bold}${C.cyan}▶ RUNNING TIER 1: FEATURE NOMINAL COVERAGE (≥125 Tests)...${C.reset}`);
    const r1 = await tier1Suite.run(cli);
    suiteResults.push(r1);
    resultsByTier.t1 = r1;
    if (r1.failed > 0) allPassed = false;
    const statusColor = r1.failed === 0 ? C.green : C.red;
    console.log(`  ${statusColor}Tier 1 Completed: ${r1.passed} Passed, ${r1.failed} Failed, ${r1.skipped} Skipped (${r1.duration}ms)${C.reset}\n`);
    if (cli.bail && !allPassed) abortedByBail = true;
  }

  // Tier 2: Boundary & Corner Cases
  if (!abortedByBail && (cli.tier === '2' || cli.tier === 'all')) {
    console.log(`${C.bold}${C.cyan}▶ RUNNING TIER 2: BOUNDARY & CORNER CASES (≥125 Tests)...${C.reset}`);
    const r2 = await tier2Suite.run(cli);
    suiteResults.push(r2);
    resultsByTier.t2 = r2;
    if (r2.failed > 0) allPassed = false;
    const statusColor = r2.failed === 0 ? C.green : C.red;
    console.log(`  ${statusColor}Tier 2 Completed: ${r2.passed} Passed, ${r2.failed} Failed, ${r2.skipped} Skipped (${r2.duration}ms)${C.reset}\n`);
    if (cli.bail && !allPassed) abortedByBail = true;
  }

  // Tier 3: Pairwise Combinations
  if (!abortedByBail && (cli.tier === '3' || cli.tier === 'all')) {
    console.log(`${C.bold}${C.cyan}▶ RUNNING TIER 3: PAIRWISE COMBINATIONS (≥25 Scenarios)...${C.reset}`);
    const r3 = await tier3Suite.run(cli);
    suiteResults.push(r3);
    resultsByTier.t3 = r3;
    if (r3.failed > 0) allPassed = false;
    const statusColor = r3.failed === 0 ? C.green : C.red;
    console.log(`  ${statusColor}Tier 3 Completed: ${r3.passed} Passed, ${r3.failed} Failed, ${r3.skipped} Skipped (${r3.duration}ms)${C.reset}\n`);
    if (cli.bail && !allPassed) abortedByBail = true;
  }

  // Tier 4: Application Scenarios
  if (!abortedByBail && (cli.tier === '4' || cli.tier === 'all')) {
    console.log(`${C.bold}${C.cyan}▶ RUNNING TIER 4: REAL-WORLD APPLICATION SCARIOS (≥7 Scenarios)...${C.reset}`);
    const r4 = await tier4Suite.run(cli);
    suiteResults.push(r4);
    resultsByTier.t4 = r4;
    if (r4.failed > 0) allPassed = false;
    const statusColor = r4.failed === 0 ? C.green : C.red;
    console.log(`  ${statusColor}Tier 4 Completed: ${r4.passed} Passed, ${r4.failed} Failed, ${r4.skipped} Skipped (${r4.duration}ms)${C.reset}\n`);
  }

  // Calculate totals
  const totalPassed = suiteResults.reduce((acc, s) => acc + s.passed, 0);
  const totalFailed = suiteResults.reduce((acc, s) => acc + s.failed, 0);
  const totalSkipped = suiteResults.reduce((acc, s) => acc + s.skipped, 0);
  const totalExecuted = totalPassed + totalFailed;
  const totalDuration = suiteResults.reduce((acc, s) => acc + s.duration, 0);

  if (totalExecuted > 0 && (cli.tier === 'all' || cli.tier === '1' || cli.tier === '2')) {
    printCoverageMatrix(resultsByTier);
  }

  console.log(`${C.bold}================================================================================${C.reset}`);
  console.log(`${C.bold}                          MASTER E2E EXECUTION SUMMARY                          ${C.reset}`);
  console.log(`${C.bold}================================================================================${C.reset}`);
  console.log(`  Total Test Cases Executed : ${C.bold}${totalExecuted}${C.reset}`);
  console.log(`  Passed                    : ${C.green}${C.bold}${totalPassed}${C.reset}`);
  console.log(`  Failed                    : ${totalFailed > 0 ? C.red : C.green}${C.bold}${totalFailed}${C.reset}`);
  console.log(`  Skipped                   : ${C.yellow}${totalSkipped}${C.reset}`);
  console.log(`  Total Execution Time      : ${totalDuration}ms`);
  console.log(`${C.bold}================================================================================${C.reset}`);

  if (totalExecuted === 0) {
    console.error(`\n${C.bold}${C.red}❌ E2E TEST SUITE FAILED: 0 tests matched filter${C.reset}\n`);
    process.exitCode = 1;
    return;
  }

  if (allPassed && totalFailed === 0) {
    console.log(`\n${C.bold}${C.green}🎉 ALL E2E TEST TIERS PASSED 100% CLEANLY (EXIT CODE 0)${C.reset}\n`);
    process.exitCode = 0;
  } else {
    console.error(`\n${C.bold}${C.red}❌ E2E TEST SUITE EXECUTION FAILED (${totalFailed} failure(s) detected)${C.reset}\n`);
    process.exitCode = 1;
  }
}

main()
  .then(() => {
    // Fallback safety timeout: ensure the CLI process never hangs indefinitely on lingering handles
    const safetyTimer = setTimeout(() => {
      process.exit(process.exitCode !== undefined ? process.exitCode : 0);
    }, 500);
    if (typeof safetyTimer.unref === 'function') {
      safetyTimer.unref();
    }
  })
  .catch((err) => {
    console.error('Fatal Test Runner Exception:', err);
    process.exitCode = 1;
    process.exit(1);
  });
