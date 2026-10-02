#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const jsonCache = new Map();
const files = [];
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const catalogs = [
  { platform: 'claude', file: '.claude-plugin/marketplace.json', manifest: '.claude-plugin/plugin.json' },
  { platform: 'codex', file: '.agents/plugins/marketplace.json', manifest: 'plugin.json', fallback: '.codex-plugin/plugin.json' },
  { platform: 'cursor', file: '.cursor-plugin/marketplace.json', manifest: '.cursor-plugin/plugin.json' },
];
const devPaths = { claude: 'plugins/madang', codex: 'plugins/madang-codex', cursor: 'plugins/madang-cursor' };
const devSkills = { claude: ['start', 'go', 'fix', 'next', 'runbook'], codex: ['dev-start', 'dev-go', 'dev-fix', 'dev-next', 'dev-runbook'], cursor: ['dev-start', 'dev-go', 'dev-fix', 'dev-next', 'dev-runbook'] };
const devEndpoint = 'https://dev.madang.ai/mcp';
const docsPaths = { claude: 'plugins/docs/claude', codex: 'plugins/docs/codex', cursor: 'plugins/docs/cursor' };
const docsSkills = { claude: ['knowledge', 'setup'], codex: ['docs-knowledge', 'docs-setup'], cursor: ['docs-knowledge', 'docs-setup'] };
const forbiddenSegments = new Set(['apps', 'packages', 'node_modules', '.madang', '.venv', '__pycache__']);
const publicRootDirectories = new Set(['.agents', '.claude-plugin', '.cursor-plugin', '.github', 'plugins', 'products', 'scripts', 'assets']);
const secretRules = [
  ['개인키', /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g],
  ['GitHub 토큰', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['MADANG 토큰', /\bmdg_(?:pat|oat|ort)_[A-Za-z0-9_-]{20,}\b/g],
  ['DOCS MCP 토큰', /\bdocs_madang_(?:mcp|oauth_at|oauth_rt)_[A-Za-z0-9_-]{20,}\b/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g],
  ['API 키', /\bsk-(?:proj-|org-)?[A-Za-z0-9_-]{24,}\b/g],
  ['URL 자격증명', /https?:\/\/[^\s/@:]+:[^\s/@]+@/g],
];
const textExtensions = new Set(['.json', '.md', '.mdc', '.mjs', '.js', '.ts', '.tsx', '.yml', '.yaml', '.txt', '.toml', '.sh', '.svg']);
const relative = (absolute) => path.relative(root, absolute).split(path.sep).join('/');
const fail = (where, reason) => failures.push(`${where}: ${reason}`);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function safePath(absolute, where) {
  const rel = path.relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) { fail(where, '경로가 공개 저장소를 벗어나요'); return false; }
  let current = root;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) { fail(where, '참조 경로가 없어요'); return false; }
    if (fs.lstatSync(current).isSymbolicLink()) { fail(where, '참조 경로에 심볼릭 링크가 있어요'); return false; }
  }
  return true;
}

function inspectTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const rel = relative(absolute);
    if (rel === '.git') continue;
    if (entry.isSymbolicLink()) { fail(rel, '심볼릭 링크는 공개 패키지에 포함할 수 없어요'); continue; }
    const segments = rel.split('/');
    const badDirectory = segments.some((segment) => forbiddenSegments.has(segment)) || (directory === root && entry.isDirectory() && !publicRootDirectories.has(entry.name)) || rel === 'docs/env' || rel.startsWith('docs/env/') || rel.includes('/docs/env/');
    const badFile = /^\.env(?:\.|$)/i.test(entry.name) || /\.(?:pem|key|p12|pfx|jks|sqlite|sqlite3|db)$/i.test(entry.name) || ['.DS_Store', 'AGENTS.md', 'CLAUDE.md', 'credentials.json', 'auth.json'].includes(entry.name) || (entry.name === '.git' && rel !== '.git');
    if (badDirectory || badFile) { fail(rel, '제품 소스·환경·키·캐시 파일은 공개 배포 대상이 아니에요'); continue; }
    if (entry.isDirectory()) inspectTree(absolute);
    else if (entry.isFile()) files.push(absolute);
    else fail(rel, '일반 파일과 폴더만 포함할 수 있어요');
  }
}

function readJson(absolute) {
  if (jsonCache.has(absolute)) return jsonCache.get(absolute);
  if (!safePath(absolute, relative(absolute))) return null;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) { fail(relative(absolute), 'JSON 파일이 없어요'); return null; }
  try {
    const value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    if (!object(value)) { fail(relative(absolute), 'JSON 루트는 객체여야 해요'); return null; }
    jsonCache.set(absolute, value);
    return value;
  } catch { fail(relative(absolute), 'JSON 파싱에 실패했어요'); return null; }
}

function resolveInside(base, value, where) {
  if (typeof value !== 'string' || !value.startsWith('./') || value.includes('\\') || value.split('/').includes('..')) { fail(where, '경로는 ./로 시작하며 ..가 없는 상대 경로여야 해요'); return null; }
  const resolved = path.resolve(base, value);
  const rel = path.relative(base, resolved);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) { fail(where, '경로가 패키지 루트를 벗어나요'); return null; }
  if (!safePath(resolved, where)) return null;
  return resolved;
}

function checkManifestPaths(value, base, where) {
  if (typeof value === 'string' && value.startsWith('./')) resolveInside(base, value, where);
  else if (Array.isArray(value)) value.forEach((item, index) => checkManifestPaths(item, base, `${where}[${index}]`));
  else if (object(value)) for (const [key, item] of Object.entries(value)) checkManifestPaths(item, base, `${where}.${key}`);
}

function checkHttps(value, where, expected) {
  if (typeof value !== 'string') { fail(where, 'MCP URL이 문자열이 아니에요'); return; }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname) fail(where, 'MCP URL은 HTTPS여야 해요');
    if (url.username || url.password) fail(where, 'MCP URL에 자격증명이 들어 있어요');
    for (const key of url.searchParams.keys()) if (/token|secret|password|api[_-]?key|authorization/i.test(key)) fail(where, 'MCP URL 쿼리에 자격증명 항목이 있어요');
    if (expected && value !== expected) fail(where, 'DEV.MADANG MCP 주소가 정본과 달라요');
  } catch { fail(where, 'MCP URL이 올바르지 않아요'); }
}

function checkMcp(config, where, expected) {
  if (!object(config)) { fail(where, 'MCP 설정은 객체여야 해요'); return 0; }
  const servers = object(config.mcpServers) ? config.mcpServers : config;
  let endpoints = 0;
  for (const [name, server] of Object.entries(servers)) {
    if (name.startsWith('$')) continue;
    if (!object(server)) { fail(`${where}.${name}`, 'MCP 서버 설정이 객체가 아니에요'); continue; }
    if ('url' in server) { checkHttps(server.url, `${where}.${name}.url`, expected); endpoints++; }
    else if (expected || typeof server.command !== 'string') fail(`${where}.${name}`, 'MCP 서버 주소 또는 실행 명령이 없어요');
  }
  return endpoints;
}

function checkSkillDirectory(directory, where) {
  if (!safePath(directory, where)) return;
  if (!fs.statSync(directory).isDirectory()) { fail(where, '스킬 경로는 폴더여야 해요'); return; }
  const entries = fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (!entries.length) fail(where, '스킬 폴더에 스킬이 없어요');
  for (const entry of entries) {
    const skill = path.join(directory, entry.name, 'SKILL.md');
    if (!safePath(skill, relative(skill))) continue;
    if (!fs.existsSync(skill) || !fs.statSync(skill).isFile()) { fail(relative(skill), 'SKILL.md가 없어요'); continue; }
    const contents = fs.readFileSync(skill, 'utf8');
    if (!/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(contents) || !/^name:\s*\S+/m.test(contents)) fail(relative(skill), '스킬 frontmatter 또는 name이 없어요');
  }
}

inspectTree(root);
for (const absolute of files) {
  const basename = path.basename(absolute);
  if (!textExtensions.has(path.extname(absolute).toLowerCase()) && basename !== '.gitignore') continue;
  const contents = fs.readFileSync(absolute, 'utf8');
  for (const [label, pattern] of secretRules) {
    pattern.lastIndex = 0;
    const match = pattern.exec(contents);
    if (match) fail(`${relative(absolute)}:${contents.slice(0, match.index).split('\n').length}`, `${label} 실제 값 패턴이 있어요(값은 출력하지 않아요)`);
  }
}

const products = new Map();
const productsDirectory = path.join(root, 'products');
if (!safePath(productsDirectory, 'products/') || !fs.statSync(productsDirectory).isDirectory()) fail('products/', '제품 등록 메타데이터 폴더가 없어요');
else {
  for (const entry of fs.readdirSync(productsDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const id = entry.name.slice(0, -5);
    const file = path.join(productsDirectory, entry.name);
    const metadata = readJson(file);
    if (!metadata) continue;
    if (typeof metadata.version !== 'string' || !semver.test(metadata.version)) fail(relative(file), '제품 version이 올바른 버전 형식이 아니에요');
    if (typeof metadata.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/i.test(metadata.sourceCommit)) fail(relative(file), 'sourceCommit은 40자리 Git SHA여야 해요');
    products.set(id, metadata);
  }
  if (!products.size) fail('products/', '등록된 제품이 없어요');
}

let pluginCount = 0;
const devPlatforms = new Set();
const docsPlatforms = new Set();
for (const catalog of catalogs) {
  const absolute = path.join(root, catalog.file);
  const data = readJson(absolute);
  if (!data) continue;
  if (data.name !== 'madang') fail(catalog.file, '마켓플레이스 이름 madang을 유지해야 해요');
  if (!Array.isArray(data.plugins) || !data.plugins.length) { fail(catalog.file, 'plugins 목록이 없거나 비어 있어요'); continue; }
  const names = new Set();
  for (const [entryIndex, entry] of data.plugins.entries()) {
    pluginCount++;
    if (!object(entry) || typeof entry.name !== 'string' || !entry.name) { fail(catalog.file, '플러그인 name이 없어요'); continue; }
    const where = `${catalog.file} plugins[${entryIndex}]`;
    if (catalog.platform === 'codex' && object(entry.policy) && Object.hasOwn(entry.policy, 'authentication') && !['ON_INSTALL', 'ON_USE'].includes(entry.policy.authentication)) fail(`${where}.policy.authentication`, 'Codex 인증 정책은 ON_INSTALL 또는 ON_USE여야 해요');
    if (names.has(entry.name)) fail(where, '플러그인 이름이 겹쳐요');
    names.add(entry.name);
    const source = typeof entry.source === 'string' ? entry.source : object(entry.source) && entry.source.source === 'local' ? entry.source.path : null;
    const packageRoot = resolveInside(root, source, where);
    if (!packageRoot) continue;
    if (!fs.statSync(packageRoot).isDirectory()) { fail(where, '플러그인 source는 패키지 폴더여야 해요'); continue; }
    const productId = entry.name === 'dev' ? 'dev-madang' : entry.product ?? entry.name;
    const product = typeof productId === 'string' ? products.get(productId) : null;
    if (!product) fail(where, '연결된 제품 등록 메타데이터가 없어요');
    const isDev = productId === 'dev-madang';
    const isDocs = productId === 'docs';
    if (isDev) {
      devPlatforms.add(catalog.platform);
      if (entry.name !== 'dev' || relative(packageRoot) !== devPaths[catalog.platform]) fail(where, 'DEV.MADANG 설치 이름 또는 패키지 경로가 달라요');
    }
    if (isDocs) {
      docsPlatforms.add(catalog.platform);
      if (entry.name !== 'docs' || relative(packageRoot) !== docsPaths[catalog.platform]) fail(where, 'DOCS.MADANG 설치 이름 또는 패키지 경로가 달라요');
      if (catalog.platform === 'codex' && fs.existsSync(path.join(packageRoot, 'plugin.json'))) fail(where, 'DOCS Codex의 env_vars 설정은 .codex-plugin 매니페스트에서 읽어야 해요. root Agent Plugin 매니페스트와 혼용하면 MCP가 누락돼요');
    }
    const primaryPath = path.join(packageRoot, catalog.manifest);
    const manifestPath = fs.existsSync(primaryPath) ? primaryPath : catalog.fallback ? path.join(packageRoot, catalog.fallback) : primaryPath;
    const manifest = readJson(manifestPath);
    if (!manifest) continue;
    const manifests = [{ value: manifest, file: manifestPath }];
    if (catalog.platform === 'codex') {
      const overlayPath = path.join(packageRoot, '.codex-plugin/plugin.json');
      if (overlayPath !== manifestPath && fs.existsSync(overlayPath)) { const overlay = readJson(overlayPath); if (overlay) manifests.push({ value: overlay, file: overlayPath }); }
    }
    let endpointCount = 0;
    const skillDirectories = new Set();
    const mcpFiles = new Set();
    for (const item of manifests) {
      const label = relative(item.file);
      if (item.value.name !== entry.name) fail(label, '매니페스트 name과 카탈로그 name이 달라요');
      if (typeof item.value.version !== 'string' || !semver.test(item.value.version)) fail(label, '매니페스트 version이 올바르지 않아요');
      if (item.value.version !== entry.version) fail(label, '매니페스트와 카탈로그 version이 달라요');
      if (product && item.value.version !== product.version) fail(label, '매니페스트와 제품 등록 version이 달라요');
      checkManifestPaths(item.value, packageRoot, label);
      if (typeof item.value.skills === 'string') { const directory = resolveInside(packageRoot, item.value.skills, `${label}.skills`); if (directory) skillDirectories.add(directory); }
      else if (Array.isArray(item.value.skills)) for (const skillPath of item.value.skills) { const directory = resolveInside(packageRoot, skillPath, `${label}.skills`); if (directory) skillDirectories.add(directory); }
      if (typeof item.value.mcpServers === 'string') { const file = resolveInside(packageRoot, item.value.mcpServers, `${label}.mcpServers`); if (file) mcpFiles.add(file); }
      else if (object(item.value.mcpServers)) endpointCount += checkMcp(item.value.mcpServers, `${label}.mcpServers`, isDev ? devEndpoint : null);
    }
    const conventionalSkills = path.join(packageRoot, 'skills');
    if (!skillDirectories.size && fs.existsSync(conventionalSkills)) skillDirectories.add(conventionalSkills);
    for (const directory of skillDirectories) checkSkillDirectory(directory, relative(directory));
    for (const filename of ['mcp.json', '.mcp.json']) { const file = path.join(packageRoot, filename); if (fs.existsSync(file)) mcpFiles.add(file); }
    for (const file of mcpFiles) { const config = readJson(file); if (config) endpointCount += checkMcp(config, relative(file), isDev ? devEndpoint : null); }
    if (isDev) {
      if (!endpointCount) fail(where, 'DEV.MADANG MCP 연결이 없어요');
      for (const name of devSkills[catalog.platform]) if (!fs.existsSync(path.join(packageRoot, 'skills', name, 'SKILL.md'))) fail(where, `DEV.MADANG 필수 스킬 ${name}이 없어요`);
    }
    if (isDocs) {
      for (const name of docsSkills[catalog.platform]) if (!fs.existsSync(path.join(packageRoot, 'skills', name, 'SKILL.md'))) fail(where, `DOCS.MADANG 필수 스킬 ${name}이 없어요`);
      const bridge = path.join(packageRoot, 'scripts/mcp-bridge.mjs');
      if (!safePath(bridge, relative(bridge))) continue;
      const contents = fs.readFileSync(bridge, 'utf8');
      if (!contents.includes('process.env.DOCS_MADANG_MCP_URL') || !contents.includes('mcp-remote@0.14.3')) fail(relative(bridge), '조직 URL 환경변수 또는 고정 MCP 브릿지 버전이 없어요');
      let server;
      if (catalog.platform === 'claude') server = manifest.mcpServers?.docs;
      else {
        const file = path.join(packageRoot, catalog.platform === 'codex' ? 'codex-mcp.json' : 'mcp.json');
        server = readJson(file)?.mcpServers?.docs;
      }
      const expectedArg = catalog.platform === 'claude' ? '${CLAUDE_PLUGIN_ROOT}/scripts/mcp-bridge.mjs' : catalog.platform === 'cursor' ? '${CURSOR_PLUGIN_ROOT}/scripts/mcp-bridge.mjs' : 'scripts/mcp-bridge.mjs';
      if (!object(server) || server.command !== 'node' || JSON.stringify(server.args) !== JSON.stringify([expectedArg]) || 'url' in server) fail(where, 'DOCS MCP는 조직 URL을 읽는 stdio 브릿지여야 해요');
      if (catalog.platform === 'codex' && (server?.cwd !== '.' || !server?.env_vars?.includes('DOCS_MADANG_MCP_URL'))) fail(where, 'Codex 플러그인 경로와 조직 URL 전달 설정이 없어요');
    }
  }
}
if (products.has('dev-madang')) for (const platform of Object.keys(devPaths)) if (!devPlatforms.has(platform)) fail('products/dev-madang.json', `${platform} 카탈로그에 DEV.MADANG이 없어요`);
if (products.has('docs')) for (const platform of Object.keys(docsPaths)) if (!docsPlatforms.has(platform)) fail('products/docs.json', `${platform} 카탈로그에 DOCS.MADANG이 없어요`);

if (failures.length) {
  console.error(`공개 플러그인 검증 실패 ${failures.length}건`);
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else console.log(`공개 플러그인 검증 통과: 제품 ${products.size}개, 카탈로그 ${catalogs.length}개, 플랫폼별 플러그인 ${pluginCount}개, 파일 ${files.length}개`);
