import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportAcaPlugin, publicBootstrapFiles, exportPublicBootstrap, validOrganizationHost } from '../export.mjs';

// Remote CI only: all organization output is synthetic, never a registered site.
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const stage = mkdtempSync(path.join(os.tmpdir(), 'aca-public-fixture-'));
const fixture = { root, commit, host: 'fixture-org.aca.madang.ai' };
const sha = value => createHash('sha256').update(value).digest('hex');
const read = (out, file) => JSON.parse(readFileSync(path.join(out, file), 'utf8'));
const files = dir => readdirSync(dir).flatMap(name => {
  const file = path.join(dir, name), stat = lstatSync(file);
  assert.equal(stat.isSymbolicLink(), false);
  return stat.isDirectory() ? files(file) : [file];
});
test.after(() => rmSync(stage, { recursive: true, force: true }));

test('default variant is exactly the approved 17 regular files with native organization URLs and no credentials', () => {
  const out = path.join(stage, 'variant'), result = exportAcaPlugin({ ...fixture, out });
  assert.equal(result.files, 17);
  const allow = JSON.parse(readFileSync(path.join(root, 'plugins/aca/export-allowlist.json'), 'utf8'));
  assert.deepEqual(files(out).map(file => path.relative(out, file)).sort(), [...allow].sort());
  for (const engine of ['claude', 'codex', 'cursor']) {
    const folder = engine === 'claude' ? '.claude-plugin' : engine === 'codex' ? '.codex-plugin' : '.cursor-plugin';
    const config = engine === 'claude' ? '.mcp.json' : engine === 'codex' ? 'codex-mcp.json' : 'mcp.json';
    assert.equal(read(out, `${engine}/${folder}/plugin.json`).version, '0.1.0');
    assert.deepEqual(read(out, `${engine}/${config}`), { mcpServers: { aca: {
      ...(engine === 'claude' ? { type: 'http' } : {}), url: `https://${fixture.host}/mcp`,
    } } });
    assert.ok(readFileSync(path.join(out, engine, 'skills/aca-setup/SKILL.md'), 'utf8').includes('tenant_variant_pending'));
  }
  const receipt = read(out, 'EXPORT-RECEIPT.json'), source = read(out, 'SOURCE.json');
  assert.equal(receipt.packageCommit, commit); assert.equal(source.packageCommit, commit);
  assert.equal(source.sourceCommit, 'ccb0774b90eba58c94a7f752d2d3d92fb322c8a8');
  assert.equal(Object.keys(receipt.files).length, 16);
  for (const [file, expected] of Object.entries(receipt.files)) assert.equal(sha(readFileSync(path.join(out, file))), expected);
  assert.deepEqual(receipt.state, { exported: true, published: false, installed: false,
    oauthVerified: false, remoteReadVerified: false, hostRegistrationVerified: false });
  for (const file of files(out)) assert.equal(lstatSync(file).mode & 0o777, 0o600);
});

test('same immutable source and explicit Host reproduce every variant byte/hash', () => {
  const left = path.join(stage, 'left'), right = path.join(stage, 'right');
  exportAcaPlugin({ ...fixture, out: left }); exportAcaPlugin({ ...fixture, out: right });
  for (const file of files(left)) assert.deepEqual(readFileSync(file), readFileSync(path.join(right, path.relative(left, file))));
});

test('optional installation wrapper adds exactly three local catalogs and preserves all native configuration', () => {
  const out = path.join(stage, 'marketplace');
  assert.equal(exportAcaPlugin({ ...fixture, out, marketplace: true }).files, 20);
  for (const [engine, folder] of [['claude', '.claude-plugin'], ['codex', '.agents/plugins'], ['cursor', '.cursor-plugin']]) {
    const catalog = read(out, `${folder}/marketplace.json`);
    assert.equal(catalog.name, 'madang-aca-organization'); assert.equal(catalog.plugins.length, 1);
    assert.equal(catalog.plugins[0].name, 'aca');
    const entry = catalog.plugins[0], source = engine === 'codex' ? entry.source.path : entry.source;
    assert.equal(source, `./${engine}`);
    if (engine === 'codex') assert.equal(entry.policy.authentication, 'ON_USE');
  }
  const receipt = read(out, 'EXPORT-RECEIPT.json'); assert.equal(Object.keys(receipt.files).length, 19);
  for (const [file, expected] of Object.entries(receipt.files)) assert.equal(sha(readFileSync(path.join(out, file))), expected);
});

test('missing, public, reserved, IP, URL, port, credentials and malformed Hosts are rejected before output', () => {
  const out = path.join(stage, 'invalid');
  for (const host of [undefined, '', 'aca.madang.ai', 'admin.aca.madang.ai', 'mcp.aca.madang.ai', '127.0.0.1',
    'docs.madang.ai', 'fixture-org.aca.madang.ai:443', 'https://fixture-org.aca.madang.ai',
    'name@fixture-org.aca.madang.ai', 'Fixture-org.aca.madang.ai', '-org.aca.madang.ai', 'org-.aca.madang.ai']) {
    assert.equal(validOrganizationHost(host), false);
    assert.throws(() => exportAcaPlugin({ ...fixture, host, out }), /aca_plugin_export_refused/);
    assert.equal(existsSync(out), false);
  }
});

test('existing output and files, relative paths, every Git checkout and symlink parents are preserved', () => {
  const existing = path.join(stage, 'existing'); mkdirSync(existing);
  writeFileSync(path.join(existing, 'keep'), 'unchanged');
  const another = path.join(stage, 'another'); mkdirSync(another);
  execFileSync('git', ['init', '--quiet', another]);
  const actual = path.join(stage, 'actual'); mkdirSync(actual);
  const link = path.join(stage, 'link'); symlinkSync(actual, link, 'dir');
  for (const out of [existing, 'relative', path.join(root, 'aca-refused-output'), path.join(another, 'out'), path.join(link, 'out')]) {
    assert.throws(() => exportAcaPlugin({ ...fixture, out }), /aca_plugin_export_refused/);
  }
  assert.equal(readFileSync(path.join(existing, 'keep'), 'utf8'), 'unchanged');
  assert.equal(existsSync(path.join(actual, 'out')), false);
});

test('CLI failure prints only the fixed refusal code, with no Host, Git stderr or argument echo', () => {
  for (const args of [[], ['--commit', commit, '--host', 'https://unaccepted.invalid', '--out', path.join(stage, 'cli')],
    ['--commit', 'f'.repeat(40), '--host', fixture.host, '--out', path.join(stage, 'missing-commit')]]) {
    const result = spawnSync(process.execPath, [path.join(root, 'plugins/aca/export.mjs'), ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'aca_plugin_export_refused\n');
  }
});

test('public bootstrap has exactly 13 files and never contains an MCP configuration or endpoint', () => {
  const generated = publicBootstrapFiles({ root, commit }); assert.equal(generated.size, 13);
  for (const [name, bytes] of generated) {
    assert.equal(/(?:^|\/)(?:\.mcp|mcp|codex-mcp)\.json$/.test(name), false);
    if (name.endsWith('plugin.json')) {
      const manifest = JSON.parse(bytes); assert.equal('mcpServers' in manifest, false);
      assert.equal(manifest.name, 'aca'); assert.equal(manifest.skills, './skills/');
    }
  }
  const out = path.join(stage, 'bootstrap');
  const report = exportPublicBootstrap({ root, commit, out }); assert.equal(report.files, 13);
  for (const [name, expected] of Object.entries(report.sha256)) assert.equal(sha(readFileSync(path.join(out, name))), expected);
});

test('generated public files, once present, are complete and byte-identical to this exact source', () => {
  const generated = publicBootstrapFiles({ root, commit });
  const present = [...generated.keys()].filter(name => existsSync(path.join(root, name)));
  if (!present.length) return; // First source-only commit generates the artifact; final distribution must contain all 13.
  assert.equal(present.length, 13);
  for (const [name, bytes] of generated) assert.deepEqual(readFileSync(path.join(root, name)), Buffer.from(bytes));
  const expected = [...generated.keys()].filter(name => name.startsWith('plugins/aca/'));
  const actual = ['claude', 'codex', 'cursor'].flatMap(engine => files(path.join(root, 'plugins/aca', engine)))
    .map(file => path.relative(root, file));
  assert.deepEqual(actual.sort(), expected.sort());
});
