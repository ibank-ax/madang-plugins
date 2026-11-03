import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, realpathSync, constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => `${JSON.stringify(value, null, 2)}\n`;
const fail = () => { throw new Error('aca_plugin_export_refused'); };
const inputPaths = ['plugins/aca/source.json', 'plugins/aca/README.md',
  'plugins/aca/skills/setup/SKILL.md', 'plugins/aca/skills/read/SKILL.md',
  'plugins/aca/export-allowlist.json', 'plugins/aca/provenance.json', 'plugins/aca/export.mjs'];
const engines = ['claude', 'codex', 'cursor'];
const manifestFolder = engine => engine === 'claude' ? '.claude-plugin' : engine === 'codex' ? '.codex-plugin' : '.cursor-plugin';
const mcpFile = engine => engine === 'claude' ? '.mcp.json' : engine === 'codex' ? 'codex-mcp.json' : 'mcp.json';
const git = (root, args) => execFileSync('git', ['-C', root, ...args],
  { maxBuffer: 262144, stdio: ['ignore', 'pipe', 'pipe'] });

/** Same Host grammar/reserved set as the approved provider exporter. No default,
 * environment lookup, registry discovery, login, bridge or network connection. */
export function validOrganizationHost(host) {
  return typeof host === 'string' && /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]\.aca\.madang\.ai$/.test(host)
    && !['admin', 'www', 'api', 'app', 'auth', 'login', 'sso', 'oauth', 'mcp', 'test', 'dev', 'demo', 'staging'].includes(host.split('.')[0]);
}

function inputs(root, commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) fail();
  const repository = realpathSync(root), blobs = new Map();
  for (const relative of inputPaths) {
    const mode = git(repository, ['ls-tree', commit, '--', relative]).toString('utf8');
    if (!mode.startsWith('100644 blob ') && !mode.startsWith('100755 blob ')) fail();
    blobs.set(relative, git(repository, ['show', `${commit}:${relative}`]));
  }
  if (!readFileSync(fileURLToPath(import.meta.url)).equals(blobs.get('plugins/aca/export.mjs'))) fail();
  const source = JSON.parse(blobs.get(inputPaths[0]).toString('utf8'));
  const keys = ['schemaVersion', 'name', 'displayName', 'version', 'sourceRepository', 'endpointPath',
    'scope', 'tools', 'transport', 'organizationOriginRequired', 'familyDiscovery'];
  if (Object.keys(source).length !== keys.length || Object.keys(source).some(key => !keys.includes(key))
    || source.schemaVersion !== 1 || source.name !== 'aca' || source.displayName !== 'ACA.MADANG'
    || !/^\d+\.\d+\.\d+$/.test(source.version) || source.endpointPath !== '/mcp'
    || source.scope !== 'aca:read' || JSON.stringify(source.tools) !== '["goals_summary_get"]'
    || source.sourceRepository !== 'https://github.com/ibank-ax/aca.madang.ai'
    || source.transport !== 'native-http' || source.organizationOriginRequired !== true
    || source.familyDiscovery !== 'unavailable') fail();
  const provenance = JSON.parse(blobs.get('plugins/aca/provenance.json').toString('utf8'));
  if (provenance.format !== 'aca-public-package-source-v1'
    || provenance.providerRepository !== 'ibank-ax/aca.madang.ai'
    || provenance.providerSource !== 'ccb0774b90eba58c94a7f752d2d3d92fb322c8a8'
    || provenance.endpointStatus !== 'tenant_variant_pending' || provenance.organizationOriginRequired !== true
    || provenance.operationalEnabled !== false || provenance.oauthAccepted !== false
    || provenance.threeIdeInstalled !== false || provenance.actualReadAccepted !== false) fail();
  // These approved public templates are byte-preserved from the provider source.
  for (const relative of [inputPaths[0], inputPaths[2], inputPaths[3], inputPaths[4]]) {
    if (provenance.providerInputSha256?.[relative] !== sha(blobs.get(relative))) fail();
  }
  return { repository, source, provenance, blobs,
    inputHashes: Object.fromEntries([...blobs].map(([name, bytes]) => [name, sha(bytes)])) };
}

function manifest(source, engine, configured) {
  return { name: source.name, version: source.version,
    description: configured ? 'ACA.MADANG 현재 권한의 목표 현황 집계 읽기' : 'ACA.MADANG 조직별 설정 필요 · MCP 미설정',
    author: { name: 'iBank AX 솔루션사업본부' }, skills: './skills/',
    ...(engine === 'codex' ? {
      interface: { displayName: source.displayName, shortDescription: '조직별 설정 후 목표 현황 집계 읽기',
        developerName: 'iBank AX 솔루션사업본부', category: 'Productivity' },
      ...(configured ? { mcpServers: `./${mcpFile(engine)}` } : {}),
    } : { displayName: source.displayName }) };
}

function engineFiles(data, configured, host) {
  const files = new Map(), { source, blobs } = data;
  for (const engine of engines) {
    files.set(`${engine}/${manifestFolder(engine)}/plugin.json`, encode(manifest(source, engine, configured)));
    if (configured) files.set(`${engine}/${mcpFile(engine)}`, encode({ mcpServers: { aca: {
      ...(engine === 'claude' ? { type: 'http' } : {}), url: `https://${host}/mcp`,
    } } }));
    files.set(`${engine}/README.md`, blobs.get('plugins/aca/README.md'));
    files.set(`${engine}/skills/aca-setup/SKILL.md`, Buffer.concat([
      blobs.get('plugins/aca/skills/setup/SKILL.md'),
      Buffer.from('\n공개 bootstrap은 tenant_variant_pending이며 MCP endpoint가 없다. 미설정이면 이 패키지 README의 공개 exporter·승인 Host·조직별 variant 설치 절차를 따른다. Host를 추정하거나 공용 endpoint·환경변수·bridge·token을 만들지 않는다. 실제 설치·OAuth·읽기 수용은 별도로 확인한다.\n'),
    ]));
    files.set(`${engine}/skills/aca-read/SKILL.md`, blobs.get('plugins/aca/skills/read/SKILL.md'));
  }
  return files;
}

function destination(repository, out) {
  if (!path.isAbsolute(out) || existsSync(out)) fail();
  const parent = realpathSync(path.dirname(out));
  if (out !== path.join(parent, path.basename(out)) || parent === repository
    || parent.startsWith(`${repository}${path.sep}`)) fail();
  try {
    if (git(parent, ['rev-parse', '--is-inside-work-tree']).toString('utf8').trim() === 'true') fail();
  } catch (error) { if (error.message === 'aca_plugin_export_refused') throw error; }
}

function writeNew(repository, out, files) {
  destination(repository, out);
  mkdirSync(out, { mode: 0o700 });
  for (const [relative, bytes] of files) {
    const target = path.join(out, relative), dir = path.dirname(target);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const realOut = realpathSync(out), realDir = realpathSync(dir);
    if ((realDir !== realOut && !realDir.startsWith(`${realOut}${path.sep}`)) || lstatSync(dir).isSymbolicLink()) fail();
    const fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
  }
}

function localCatalog(source, engine) {
  const entry = { name: 'aca', version: source.version,
    ...(engine === 'codex' ? { source: { source: 'local', path: './codex' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Productivity' }
      : { displayName: source.displayName, source: `./${engine}`,
        description: '승인된 조직 Host에만 연결하는 ACA native HTTP MCP' }) };
  return { name: 'madang-aca-organization', owner: { name: 'iBank AX 솔루션사업본부' }, plugins: [entry] };
}

/** Default: original 17-file organization variant. Optional local marketplace
 * adds exactly three catalogs; it never edits IDE settings or another plugin. */
export function exportAcaPlugin({ root, commit, host, out, marketplace = false }) {
  if (!validOrganizationHost(host) || typeof marketplace !== 'boolean') fail();
  const data = inputs(root, commit), { source, provenance, inputHashes } = data;
  const files = engineFiles(data, true, host);
  if (marketplace) for (const engine of engines) {
    const folder = engine === 'codex' ? '.agents/plugins' : manifestFolder(engine);
    files.set(`${folder}/marketplace.json`, encode(localCatalog(source, engine)));
  }
  files.set('SOURCE.json', encode({ ...source, sourceCommit: provenance.providerSource,
    packageRepository: 'ibank-ax/madang-plugins', packageCommit: commit,
    mcpUrl: `https://${host}/mcp`, inputHashes }));
  files.set('EXPORT-RECEIPT.json', encode({ sourceCommit: provenance.providerSource, packageCommit: commit,
    version: source.version, inputHashes, files: Object.fromEntries([...files].map(([name, bytes]) => [name, sha(bytes)])),
    state: { exported: true, published: false, installed: false, oauthVerified: false,
      remoteReadVerified: false, hostRegistrationVerified: false } }));
  const allow = JSON.parse(data.blobs.get('plugins/aca/export-allowlist.json').toString('utf8'));
  const expected = [...allow, ...(marketplace ? ['.claude-plugin/marketplace.json',
    '.agents/plugins/marketplace.json', '.cursor-plugin/marketplace.json'] : [])];
  if (!Array.isArray(allow) || allow.length !== 17 || new Set(expected).size !== expected.length
    || expected.length !== files.size || expected.some(name => !files.has(name))) fail();
  writeNew(data.repository, out, files);
  return { sourceCommit: provenance.providerSource, packageCommit: commit, version: source.version, files: files.size };
}

/** Public bootstrap has no MCP config/URL. Only remote generation consumes this
 * helper; committed public files must match its output byte for byte. */
export function publicBootstrapFiles({ root, commit }) {
  const data = inputs(root, commit), files = new Map();
  for (const [name, bytes] of engineFiles(data, false)) files.set(`plugins/aca/${name}`, bytes);
  files.set('products/aca.json', encode({ version: data.source.version, sourceCommit: data.provenance.providerSource,
    sourceRepository: data.provenance.providerRepository, platforms: engines,
    organizationOriginRequired: true, endpointStatus: 'tenant_variant_pending' }));
  return files;
}

export function exportPublicBootstrap({ root, commit, out }) {
  const files = publicBootstrapFiles({ root, commit });
  writeNew(realpathSync(root), out, files);
  return { files: files.size, sha256: Object.fromEntries([...files].map(([name, bytes]) => [name, sha(bytes)])) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (![6, 7].includes(args.length) || args[0] !== '--commit' || args[2] !== '--host' || args[4] !== '--out'
      || (args.length === 7 && args[6] !== '--marketplace')) fail();
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    process.stdout.write(encode(exportAcaPlugin({ root, commit: args[1], host: args[3], out: args[5], marketplace: args.length === 7 })));
  } catch { process.stderr.write('aca_plugin_export_refused\n'); process.exitCode = 1; }
}
