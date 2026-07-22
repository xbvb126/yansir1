import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function assertCommandIncludes(command, expectedParts, label) {
  assert.equal(typeof command, 'string', `${label} should be a package script`);
  for (const part of expectedParts) {
    assert.ok(command.includes(part), `${label} should include ${part}; got: ${command}`);
  }
}

function testRootCiScriptRunsAllPlanChecksBeforeDeploy() {
  assertCommandIncludes(
    packageJson.scripts['test:api:core'],
    [
      'test:market-stream',
      'test:market-symbol-discovery',
      'test:alerts-delivery',
      'test:strict-persistence',
      'test:global-scan-schedule',
      'test:aligned-global-scanner',
      'test:strategy-contract',
      'test:entitlements'
    ],
    'test:api:core'
  );
  assertCommandIncludes(
    packageJson.scripts['test:web:core'],
    [
      'test:entitlements',
      'test:kline-confirmation',
      'test:kline-realtime',
      'test:kline-strategy-source',
      'test:radar-live',
      'test:claw-layout',
      'test:page-width',
      'test:track-record',
      'test:touch-targets',
      'test:view-routing'
    ],
    'test:web:core'
  );
  assert.equal(packageJson.scripts['test:strategy'], 'node infra/run-strategy-tests.mjs');
  assertCommandIncludes(
    packageJson.scripts['test:plans:ci'],
    [
      'npm run test:ci-service-readiness',
      'npm run test:api:core',
      'npm run test:web:core',
      'npm run test:strategy',
      'npm run build:api',
      'npm run build:web',
      'npm run test:e2e:plans:ci'
    ],
    'test:plans:ci'
  );
  assert.ok(
    packageJson.scripts['predeploy:check']?.includes('npm run test:plans:ci'),
    'predeploy:check should run test:plans:ci so deployment commands can gate on it'
  );
  assert.ok(
    !packageJson.scripts['predeploy:check']?.includes('npm run deploy:check'),
    'predeploy:check must not call deploy:check because npm predeploy:check lifecycle recurses before deploy:check'
  );
  assert.ok(
    packageJson.scripts['deploy:prod']?.startsWith('npm run predeploy:check &&'),
    'deploy:prod should explicitly run predeploy:check before restarting services'
  );
}

function testGithubWorkflowRunsPlanCiScript() {
  const workflowPath = path.join(repoRoot, '.github', 'workflows', 'plan-permissions-ci.yml');
  assert.ok(existsSync(workflowPath), 'plan permission CI workflow should exist');
  const workflow = readFileSync(workflowPath, 'utf8');
  for (const expected of [
    'pull_request:',
    'push:',
    'workflow_dispatch:',
    'actions/setup-python@v5',
    'pip install -r services/strategy/requirements.txt',
    'npm ci',
    'npm run test:plans:ci'
  ]) {
    assert.ok(workflow.includes(expected), `workflow should include ${expected}`);
  }
  assert.ok(/branches:\s*\[\s*main\s*\]/.test(workflow) || workflow.includes('- main'), 'workflow should run on main branch pushes');
}

function testStrategyLauncherUsesUnittestDiscovery() {
  const result = spawnSync(process.execPath, ['infra/run-strategy-tests.mjs', '--print-command'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || 'strategy test launcher should print its command');
  assert.match(result.stdout, /-m unittest discover services\/strategy\/tests -t services\/strategy -v/);
}

function testCiDocsExplainDeploymentGate() {
  const docPath = path.join(repoRoot, 'docs', 'plans', '2026-06-21-signal-saas-commercialization-plan.md');
  const doc = readFileSync(docPath, 'utf8');
  assert.ok(doc.includes('npm run test:plans:ci'), 'commercialization plan should document the pre-deploy CI command');
}

testRootCiScriptRunsAllPlanChecksBeforeDeploy();
testGithubWorkflowRunsPlanCiScript();
testStrategyLauncherUsesUnittestDiscovery();
testCiDocsExplainDeploymentGate();
console.log('CI plan permission wiring tests passed');
