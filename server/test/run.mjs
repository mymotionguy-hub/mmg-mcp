// End-to-end test without After Effects:
//   MCP client -> built server -> HTTP -> real panel/js/bridge.js -> real host/lib (ES3, run in a Node vm)
//   -> fake AE host functions.
// Also checks every .jsx file parses as ES3.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as acorn from 'acorn';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const require = createRequire(import.meta.url);
let passed = 0;
const ok = (name) => { passed++; console.log('  ok  ' + name); };

// 1. ES3 check for all ExtendScript files
function jsxFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsxFiles(p) : p.endsWith('.jsx') ? [p] : [];
  });
}
for (const f of jsxFiles(join(repo, 'host'))) {
  acorn.parse(readFileSync(f, 'utf8'), { ecmaVersion: 3, allowReserved: true });
  ok('ES3 parse ' + f.slice(repo.length + 1));
}

// 2. Fake ExtendScript engine: real json.jsx + core.jsx, fake AE functions
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ctx = vm.createContext({});
ctx.$ = { global: ctx };
vm.runInContext(readFileSync(join(repo, 'host/lib/json.jsx'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(repo, 'host/lib/core.jsx'), 'utf8'), ctx);
ctx.BridgeTalk = { appName: 'aftereffects' };
ctx.CompItem = function () {};
const undo = { begin: 0, end: 0 };
ctx.app = {
  version: '25.0x1', project: { file: null, numItems: 2, activeItem: null },
  beginUndoGroup() { undo.begin++; }, endUndoGroup() { undo.end++; },
};
vm.runInContext(readFileSync(join(repo, 'host/lib/find.jsx'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(repo, 'host/ae/batch.jsx'), 'utf8'), ctx);
const fakeFns = {
  ae_getCompState(a) {
    if (a.comp && a.comp !== 'Main "Comp"\u2028') this.fail('No comp named "' + a.comp + '".');
    return { comp: { name: a.comp || 'Main', width: 1920, height: 1080, fps: 25 }, layers: [{ index: 1, name: 'Títle ✓', type: 'text' }] };
  },
  ae_setTransform(a) {
    return ctx.MMG.ae.undo('Set transform', () => {
      if (a.layer === 99) this.fail('Layer 99 does not exist.');
      return { layer: { index: a.layer, transform: a.props } };
    });
  },
  ae_exportFrame(a) {
    writeFileSync(a.path, PNG);
    return { comp: 'Main', time: a.time ?? 0, width: 1920, height: 1080 };
  },
};
for (const [k, f] of Object.entries(fakeFns)) ctx.MMG.fns[k] = function (a) { return f.call(ctx.MMG, a); };

// JSON polyfill round trip
const sample = { s: 'a"b\\c\n\u2028é', n: 1.5, b: true, z: null, arr: [1, 'x', null], o: { k: [] } };
assert.deepEqual(JSON.parse(JSON.stringify(ctx.MMG.JSON.parse(ctx.MMG.JSON.stringify(sample)))), sample);
assert.deepEqual(JSON.parse(ctx.MMG.JSON.stringify(sample)), sample);
ok('MMG.JSON round trip');

// 3. Real panel bridge on a test port
const AE_PORT = 47921, PPRO_PORT = 47922;
const bridge = require(join(repo, 'panel/js/bridge.js'));
const server = bridge.start({
  port: AE_PORT, appName: 'After Effects', appVersion: '25.0', panelVersion: '0.1.0',
  evalScript: async (code) => vm.runInContext(code, ctx),
});
await new Promise((r) => server.on('listening', r));

let res = await fetch(`http://127.0.0.1:${AE_PORT}/call`, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"fn":"common_status"}',
});
assert.equal(res.status, 403);
res = await fetch(`http://127.0.0.1:${AE_PORT}/call`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"fn":"common_status"}' });
assert.equal(res.status, 415);
ok('bridge refuses browser requests');

// 4. MCP client -> built server
const client = new Client({ name: 'test', version: '0' });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [join(here, '..', 'dist', 'index.js')],
  env: { ...process.env, MMG_AE_PORT: String(AE_PORT), MMG_PPRO_PORT: String(PPRO_PORT) },
}));
const text = (r) => r.content.find((c) => c.type === 'text').text;

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
assert.equal(names.length, 17);
assert.ok(names.includes('ae_batch') && names.includes('ae_animateText'));
const hostSrc = jsxFiles(join(repo, 'host')).map((f) => readFileSync(f, 'utf8')).join(' ');
for (const n of names.filter((n) => n !== 'status')) assert.ok(hostSrc.includes('MMG.fns.' + n + ' ='), 'host function missing: ' + n);
ok('lists 17 tools, each has a host function');

let r = await client.callTool({ name: 'status', arguments: {} });
let s = JSON.parse(text(r));
assert.equal(s.afterEffects.connected, true);
assert.equal(s.afterEffects.version, '25.0x1');
assert.equal(s.afterEffects.project, '(unsaved project)');
assert.equal(s.premiere.connected, false);
assert.match(s.premiere.note, /Premiere Pro is closed/);
ok('status: AE connected, Premiere not');

r = await client.callTool({ name: 'ae_getCompState', arguments: {} });
assert.equal(JSON.parse(text(r)).layers[0].name, 'Títle ✓');
r = await client.callTool({ name: 'ae_getCompState', arguments: { comp: 'Main "Comp"\u2028' } });
assert.equal(JSON.parse(text(r)).comp.name, 'Main "Comp"\u2028');
ok('ae_getCompState (incl. quotes and unicode in args)');

r = await client.callTool({ name: 'ae_getCompState', arguments: { comp: 'Nope' } });
assert.equal(r.isError, true);
assert.match(text(r), /After Effects: No comp named "Nope"/);
ok('host errors come back as plain messages');

r = await client.callTool({ name: 'ae_exportFrame', arguments: { time: 1.2 } });
const img = r.content.find((c) => c.type === 'image');
assert.equal(img.mimeType, 'image/png');
assert.equal(Buffer.from(img.data, 'base64').equals(PNG), true);
assert.equal(JSON.parse(text(r)).time, 1.2);
ok('ae_exportFrame returns the PNG');

// Batch: one undo group for nested edits, server-side validation, stop on first failure
r = await client.callTool({ name: 'ae_batch', arguments: { steps: [
  { tool: 'ae_getCompState', args: {} },
  { tool: 'ae_setTransform', args: { layer: 1, props: { opacity: 50 } } },
  { tool: 'ae_setTransform', args: { layer: 'Title', props: { scale: 80 } } },
] } });
s = JSON.parse(text(r));
assert.equal(r.isError, undefined);
assert.equal(s.completed, 3);
assert.deepEqual(s.results[1].layer.transform, { opacity: 50 });
assert.deepEqual(undo, { begin: 1, end: 1 });
ok('ae_batch runs all steps in ONE undo group');

r = await client.callTool({ name: 'ae_batch', arguments: { steps: [{ tool: 'ae_setTransform', args: { props: {} } }] } });
assert.equal(r.isError, true);
assert.match(text(r), /Step 1 \(ae_setTransform\): .*layer/s);
r = await client.callTool({ name: 'ae_batch', arguments: { steps: [{ tool: 'ae_exportFrame', args: {} }] } });
assert.equal(r.isError, true);
assert.match(text(r), /can't be used in a batch/);
assert.equal(undo.begin, 1);
ok('ae_batch rejects bad steps before touching AE');

r = await client.callTool({ name: 'ae_batch', arguments: { steps: [
  { tool: 'ae_setTransform', args: { layer: 1, props: { opacity: 10 } } },
  { tool: 'ae_setTransform', args: { layer: 99, props: { opacity: 10 } } },
] } });
s = JSON.parse(text(r));
assert.equal(r.isError, true);
assert.equal(s.completed, 1);
assert.equal(s.error.step, 2);
assert.match(s.error.message, /Layer 99/);
assert.deepEqual(undo, { begin: 2, end: 2 });
ok('ae_batch stops at the failing step and reports it');

server.close();
r = await client.callTool({ name: 'ae_getCompState', arguments: {} });
assert.equal(r.isError, true);
assert.match(text(r), /Can't reach After Effects/);
ok('closed panel gives a plain message');

await client.close();
console.log(`\nAll ${passed} checks passed.`);
