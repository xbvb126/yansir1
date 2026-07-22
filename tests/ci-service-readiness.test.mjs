import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExpectedApi, isExpectedWeb } from '../infra/service-readiness.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const server = createServer((request, response) => {
  if (request.url === '/api-ok') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', database: { connected: false } }));
    return;
  }
  if (request.url === '/api-wrong') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: 'another-app' }));
    return;
  }
  if (request.url === '/web-ok') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><script type="module" src="/assets/index-abc123.js"></script>');
    return;
  }
  if (request.url === '/web-wrong') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Another app</title>');
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('not found');
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  assert.equal(await isExpectedApi(`${baseUrl}/api-ok`), true);
  assert.equal(await isExpectedApi(`${baseUrl}/api-wrong`), false);
  assert.equal(await isExpectedApi(`${baseUrl}/missing`), false);
  assert.equal(await isExpectedWeb(`${baseUrl}/web-ok`), true);
  assert.equal(await isExpectedWeb(`${baseUrl}/web-wrong`), false);
  assert.equal(await isExpectedWeb(`${baseUrl}/missing`), false);
} finally {
  server.close();
  await once(server, 'close');
}

const runner = readFileSync(path.join(repoRoot, 'infra', 'run-plan-e2e-ci.mjs'), 'utf8');
assert.match(runner, /import\s+\{\s*isExpectedApi,\s*isExpectedWeb\s*\}/);
assert.ok(runner.includes('isExpectedApi(healthUrl)'), 'runner should validate the API health identity');
assert.ok(runner.includes('isExpectedWeb(webBaseUrl)'), 'runner should validate the Web identity');
assert.ok(!runner.includes('isReachable'), 'runner should not use the old status-only reachability check');

console.log('CI service readiness tests passed');
