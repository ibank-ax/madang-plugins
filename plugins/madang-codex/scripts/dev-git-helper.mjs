#!/usr/bin/env node
/** DEV Git companion. Project Git credentials stay in the protected executor.
 * Codex owns its MCP OAuth tokens and refreshes them inside an ephemeral app-server context.
 * Claude's existing MCP access token is read into memory, never copied or refreshed.
 * Checkpoints contain only target IDs, request IDs, refs and artifact hashes.
 * Local Git only consumes bounded bundles; it never connects to the project provider.
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { StringDecoder } from 'node:string_decoder';

const MAX_BUNDLE = 64 * 1024 * 1024, MAX_JSON = 1024 * 1024, CHUNK_BYTES = 2 * 1024 * 1024, MAX_RPC_BYTES = 4 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/, HASH = /^[a-f0-9]{64}$/;
const COMMANDS = new Set(['clone', 'fetch', 'pull', 'prepare-push', 'push', 'status', 'resume']);
const stop = new AbortController();
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = code => Object.assign(new Error(code), { safeCode: code });
const need = (ok, code) => { if (!ok) throw fail(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const HELP = `DEV.MADANG Git helper — Node.js 22 이상과 Git이 필요해요.

기존 Claude/Codex의 DEV MCP 로그인으로 코드를 내려받고 올려요.
프로젝트 Git 토큰·키를 입력하거나 로컬에 저장하지 않아요.
Codex는 자체 app-server의 임시 메모리 컨텍스트에서 기존 OAuth 연결을 사용해요.
모델 실행·사용자 메시지·영속 채팅 생성 없이 전송하고 명령이 끝나면 컨텍스트를 종료해요.

처음 내려받기:
  node dev-git-helper.mjs clone --origin https://dev.example.com --ide codex \\
    --project 1 --issue 1 --connection <UUID> --version 1 --credential-version 1 \\
    --repository 1 --ref refs/heads/codex/check --directory /absolute/workspace \\
    --environment prod --checkpoint /absolute/private/clone.json

편집·커밋 후 승인할 산출물을 고정하기:
  node dev-git-helper.mjs prepare-push <위의 대상 옵션> \\
    --expected-old-oid <기존 40자리 SHA 또는 null> --checkpoint /absolute/private/push.json
출력한 approvalBinding으로 기존 DEV 이슈의 정확한 결정 허가를 받아요.
승인 뒤 같은 산출물만 올리기:
  node dev-git-helper.mjs push --checkpoint /absolute/private/push.json --grant <UUID> --decision <번호>

원격 변경 내려받기: clone과 같은 대상 옵션에 fetch 또는 pull을 사용하고 새 checkpoint를 지정해요.
fetch는 dev 원격 추적 참조를 갱신하고 pull은 깨끗한 작업공간에서 fast-forward만 적용해요.
일반 git은 로컬 편집·커밋에 사용하고 보호 전송에는 이 helper를 사용해요.

상태 조회: node dev-git-helper.mjs status --checkpoint /absolute/private/push.json
중단·결과 불명 재개: node dev-git-helper.mjs resume --checkpoint /absolute/private/push.json
checkpoint의 요청 키·대상·SHA는 유지해요. 새 요청으로 결과 불명을 덮지 않아요.
인증 만료·회수 시 기존 IDE에서 DEV 연결을 정상 재인증한 뒤 같은 명령을 다시 실행해요.
helper는 refresh token을 회전하거나 추가 로그인·pair·토큰 복사를 요구하지 않아요.

추가 옵션: --server <기존 MCP 서버 이름> (같은 URL의 로그인 항목이 여럿일 때 필수)
  --ide claude|codex, --purpose development|verification|operations (기본 verification)
  --wait-seconds 0..600 (기본 45). checkpoint 디렉터리는 본인 소유 0700이어야 해요.
`;
function validRef(value) {
  return typeof value === 'string' && value.startsWith('refs/heads/') && value.length <= 240
    && !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) && !['..', '@{', '//'].some(p => value.includes(p))
    && !value.endsWith('.') && value.split('/').every(p => p && !p.startsWith('.') && !p.endsWith('.lock'));
}
function originOf(value) {
  let url; try { url = new URL(value); } catch { throw fail('REMOTE_HTTPS_REQUIRED'); }
  need(url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
    && url.pathname === '/' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'REMOTE_HTTPS_REQUIRED');
  return url.origin;
}
async function privateFile(file, cap = MAX_JSON) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    need(info.isFile() && info.nlink === 1 && info.size <= cap
      && (process.getuid === undefined || info.uid === process.getuid() && (info.mode & 0o077) === 0), 'PRIVATE_FILE_REQUIRED');
    return await handle.readFile();
  } finally { await handle.close(); }
}
async function readOptional(file) {
  try { return JSON.parse((await privateFile(file)).toString('utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw fail('IDE_AUTH_STORE_UNAVAILABLE'); }
}
function child(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { timeout: 30_000, maxBuffer: MAX_BUNDLE + 65536, encoding: 'buffer',
      windowsHide: true, ...options }, (error, stdout) => {
      if (error) { reject(Object.assign(fail('LOCAL_COMMAND_FAILED'), { exitCode: error.code })); return; }
      resolve(stdout);
    });
  });
}
async function keychain(service, account) {
  if (process.platform !== 'darwin') return null;
  try {
    const bytes = await child('/usr/bin/security', ['find-generic-password', '-s', service, '-a', account, '-w'], { maxBuffer: MAX_JSON });
    try { return JSON.parse(bytes.toString('utf8').trim()); } finally { bytes.fill(0); }
  } catch (error) { if (error.exitCode === 44) return null; throw fail('IDE_AUTH_STORE_UNAVAILABLE'); }
}
function access(value, expiresAt) {
  need(typeof value === 'string' && value.length > 0 && value.length <= 16384 && !/[\r\n\0]/.test(value), 'IDE_REAUTH_REQUIRED');
  need(expiresAt === null || expiresAt === undefined || Number.isFinite(expiresAt) && expiresAt > Date.now() + 5000, 'IDE_REAUTH_REQUIRED');
  return value;
}
/** The adapter does not read project secrets, write a credential store, or rotate refresh tokens.
 * Codex's store key/schema follows codex-rs/rmcp-client/src/oauth.rs.
 * Claude's existing mcpOAuth entry is selected by exact serverUrl and optional serverName.
 */
export async function readIdeAccessToken(options) {
  const url = `${originOf(options.origin)}/mcp`, serverName = options.serverName;
  need(['codex', 'claude'].includes(options.ide), 'IDE_REQUIRED');
  if (options.ide === 'codex') {
    let names = serverName ? [serverName] : [];
    if (!names.length) {
      try {
        const bytes = await child(options.codexCommand ?? 'codex', ['mcp', 'list', '--json'], { maxBuffer: MAX_JSON });
        try {
          const entries = JSON.parse(bytes.toString('utf8'));
          if (Array.isArray(entries)) names = entries.filter(e => e?.transport?.url === url || e?.url === url).map(e => e.name).filter(n => typeof n === 'string');
        } finally { bytes.fill(0); }
      } catch { /* Plugin-only connections can be found by exact URL in the existing file store. */ }
    }
    names = [...new Set(names)]; need(names.length <= 1, 'IDE_AUTH_AMBIGUOUS');
    for (const name of names) {
      // Official builds have used both serde map orderings. They represent the same exact identity.
      const keys = [...new Set([JSON.stringify({ headers: {}, type: 'http', url }), JSON.stringify({ type: 'http', url, headers: {} })]
        .map(payload => `${name.replace(/^local:/, '')}|${digest(payload).slice(0, 16)}`))];
      const matched = [];
      for (const key of keys) {
        const entry = await keychain('Codex MCP Credentials', key);
        if (entry) { need(entry.url === url && [name, name.replace(/^local:/, '')].includes(entry.server_name), 'IDE_AUTH_TARGET_MISMATCH'); matched.push(entry); }
      }
      need(matched.length <= 1 || matched.every(e => e.token_response?.access_token === matched[0].token_response?.access_token), 'IDE_AUTH_AMBIGUOUS');
      if (matched.length) return access(matched[0].token_response?.access_token, matched[0].expires_at);
    }
    const home = options.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
    const store = await readOptional(path.join(home, '.credentials.json'));
    const allowedNames = names.flatMap(name => [name, name.replace(/^local:/, '')]);
    need(allowedNames.length > 0, 'IDE_AUTH_SERVER_REQUIRED');
    const entries = record(store) ? Object.values(store).filter(e => record(e) && (e.server_url ?? e.url) === url && !e.executor_owned
      && allowedNames.includes(e.server_name)) : [];
    need(entries.length === 1, entries.length > 1 ? 'IDE_AUTH_AMBIGUOUS' : 'IDE_REAUTH_REQUIRED');
    return access(entries[0].access_token ?? entries[0].token_response?.access_token, entries[0].expires_at);
  }
  const custom = options.claudeHome ?? process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR ?? process.env.CLAUDE_CONFIG_DIR;
  const home = custom || path.join(os.homedir(), '.claude');
  const suffix = custom ? `-${digest(home.normalize('NFC')).slice(0, 8)}` : '';
  const account = /^[A-Za-z0-9._-]+$/.test(os.userInfo().username) ? os.userInfo().username : 'claude-code-user';
  let store = await keychain(`Claude Code-credentials${suffix}`, account);
  if (!store) store = await readOptional(path.join(home, '.credentials.json'));
  const entries = record(store?.mcpOAuth) ? Object.values(store.mcpOAuth).filter(e => record(e) && e.serverUrl === url
    && (!serverName || e.serverName === serverName)) : [];
  need(entries.length === 1, entries.length > 1 ? 'IDE_AUTH_AMBIGUOUS' : 'IDE_REAUTH_REQUIRED');
  return access(entries[0].accessToken, entries[0].expiresAt);
}

async function boundedResponse(response, limit) {
  const declared = response.headers.get('content-length');
  need(declared === null || /^\d+$/.test(declared) && Number(declared) <= limit, 'RESPONSE_TOO_LARGE');
  const parts = []; let size = 0;
  if (response.body) for await (const part of response.body) { size += part.length; need(size <= limit, 'RESPONSE_TOO_LARGE'); parts.push(Buffer.from(part)); }
  return Buffer.concat(parts, size);
}
export class DevGitApi {
  constructor(options) { this.options = options; this.origin = originOf(options.origin); this.bridge = options.ide === 'codex' ? new CodexGitBridge(options) : null; }
  async close() { await this.bridge?.close(); }
  async request(route, { method = 'GET', json, bundle, payload, binary = false } = {}) {
    need(route.startsWith('/api/') && !route.includes('..') && !route.includes('?'), 'API_PATH_REJECTED');
    if (this.bridge) return this.bridge.request(route, { method, json, bundle, payload, binary });
    let token = await readIdeAccessToken(this.options), body;
    const headers = { Authorization: `Bearer ${token}`, Origin: this.origin, Accept: binary ? 'application/x-git-bundle' : 'application/json' };
    if (bundle) {
      const form = new FormData(); form.set('payload', JSON.stringify(payload));
      form.set('bundle', new Blob([bundle], { type: 'application/x-git-bundle' }), 'source.bundle'); body = form;
    } else if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    try {
      const response = await fetch(`${this.origin}${route}`, { method, headers, body, redirect: 'error', signal: AbortSignal.any([stop.signal, AbortSignal.timeout(90_000)]) });
      if (response.status === 401) { await response.body?.cancel(); throw fail('IDE_REAUTH_REQUIRED'); }
      const bytes = await boundedResponse(response, binary && response.ok ? MAX_BUNDLE : MAX_JSON);
      if (!response.ok) {
        let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { /* Never echo a response body. */ }
        throw fail(typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(value.code) ? value.code : `HTTP_${response.status}`);
      }
      if (binary) return { bytes, headers: response.headers };
      try { return JSON.parse(bytes.toString('utf8')); } catch { throw fail('API_RESPONSE_REJECTED'); }
    } catch (error) { if (error.safeCode) throw error; throw fail(stop.signal.aborted ? 'HELPER_INTERRUPTED' : 'API_RESULT_UNKNOWN'); }
    finally { token = ''; headers.Authorization = ''; }
  }
}

/** Native Codex JSON-RPC, without a model turn or extraction of an OAuth credential.
 * The one ephemeral thread exists only in this owned child process. It is never resumed,
 * persisted, sent a user message, or used for any MCP tool other than git_transfer.
 */
export class CodexGitBridge {
  constructor(options) {
    this.options = options; this.origin = originOf(options.origin); this.pending = new Map(); this.sequence = 0;
    this.buffer = ''; this.decoder = new StringDecoder('utf8'); this.closed = false; this.started = null; this.process = null; this.lastTransferAt = 0;
  }
  rejectAll(code) { for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(fail(code)); } this.pending.clear(); }
  async close() {
    if (this.closed) return; this.closed = true;
    stop.signal.removeEventListener('abort', this.onAbort);
    this.rejectAll(stop.signal.aborted ? 'HELPER_INTERRUPTED' : 'IDE_BRIDGE_CLOSED');
    const owned = this.process; if (!owned) return;
    owned.stdin.destroy(); if (owned.exitCode !== null || owned.signalCode !== null) return;
    owned.kill('SIGTERM');
    await Promise.race([this.exited, delay(3000)]);
    if (owned.exitCode === null && owned.signalCode === null) { owned.kill('SIGKILL'); await this.exited; }
  }
  send(message) {
    need(!this.closed && this.process?.stdin.writable, 'IDE_BRIDGE_UNAVAILABLE');
    const encoded = JSON.stringify(message); need(Buffer.byteLength(encoded) <= MAX_RPC_BYTES, 'TRANSFER_REQUEST_TOO_LARGE');
    this.process.stdin.write(`${encoded}\n`, error => { if (error) this.rejectAll('IDE_BRIDGE_UNAVAILABLE'); });
  }
  rpc(method, params, timeout = 90_000) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence, timer = setTimeout(() => { this.pending.delete(id); reject(fail('API_RESULT_UNKNOWN')); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ jsonrpc: '2.0', id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }
  receive(part) {
    if (this.closed) return;
    this.buffer += this.decoder.write(part);
    if (Buffer.byteLength(this.buffer) > MAX_RPC_BYTES) { this.rejectAll('TRANSFER_RESPONSE_TOO_LARGE'); this.process?.kill('SIGTERM'); return; }
    let end;
    while ((end = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      let message; try { message = JSON.parse(line); } catch { this.rejectAll('IDE_BRIDGE_PROTOCOL_REJECTED'); continue; }
      if (message.method && message.id !== undefined) {
        // A credential/login elicitation is handed back to the existing IDE; never approve it here.
        if (message.method === 'mcpServer/elicitation/request') {
          this.send({ jsonrpc: '2.0', id: message.id, result: { action: 'cancel' } }); this.rejectAll('IDE_REAUTH_REQUIRED');
        } else this.send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported helper request' } });
        continue;
      }
      const entry = this.pending.get(message.id); if (!entry) continue;
      clearTimeout(entry.timer); this.pending.delete(message.id);
      if (Object.hasOwn(message, 'result')) entry.resolve(message.result);
      else entry.reject(fail(message.error?.code === -32001 ? 'IDE_REAUTH_REQUIRED' : 'IDE_BRIDGE_REQUEST_REJECTED'));
    }
  }
  async start() {
    if (this.started) return this.started;
    this.started = this.initialize(); return this.started;
  }
  async initialize() {
    need(!this.closed, 'IDE_BRIDGE_CLOSED'); need(!stop.signal.aborted, 'HELPER_INTERRUPTED');
    const located = await child('/usr/bin/which', ['codex'], { maxBuffer: 8192 });
    const command = await realpath(located.toString('utf8').trim());
    need(path.isAbsolute(command), 'IDE_BRIDGE_UNAVAILABLE');
    if (process.platform === 'darwin') await child('/usr/bin/codesign', ['--verify', '--strict', command], { maxBuffer: 8192 });
    const inventoryBytes = await child(command, ['mcp', 'list', '--json'], { maxBuffer: MAX_JSON });
    let inventory; try { inventory = JSON.parse(inventoryBytes.toString('utf8')); } finally { inventoryBytes.fill(0); }
    need(Array.isArray(inventory), 'IDE_AUTH_STORE_UNAVAILABLE');
    const exact = inventory.filter(e => record(e) && (e.transport?.url ?? e.url) === `${this.origin}/mcp`
      && (!this.options.serverName || e.name === this.options.serverName) && e.enabled !== false);
    need(exact.length === 1 && typeof exact[0].name === 'string', exact.length > 1 ? 'IDE_AUTH_AMBIGUOUS' : 'IDE_AUTH_SERVER_REQUIRED');
    need(String(exact[0].auth_status).toLowerCase().replace(/_/g, '') === 'oauth', 'IDE_REAUTH_REQUIRED');
    this.server = exact[0].name;
    need(!stop.signal.aborted, 'HELPER_INTERRUPTED');
    this.process = spawn(command, ['app-server', '--stdio'], { cwd: await realpath(os.tmpdir()), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    this.exited = new Promise(resolve => this.process.once('close', resolve));
    this.process.stdout.on('data', part => this.receive(part));
    this.process.once('error', () => this.rejectAll('IDE_BRIDGE_UNAVAILABLE'));
    this.process.once('exit', () => this.rejectAll(stop.signal.aborted ? 'HELPER_INTERRUPTED' : 'IDE_BRIDGE_UNAVAILABLE'));
    this.onAbort = () => { this.rejectAll('HELPER_INTERRUPTED'); this.process?.kill('SIGTERM'); };
    stop.signal.addEventListener('abort', this.onAbort, { once: true });
    await this.rpc('initialize', { clientInfo: { name: 'dev-git-helper', version: '1.0' }, capabilities: { experimentalApi: true } });
    this.send({ jsonrpc: '2.0', method: 'initialized' });
    const started = await this.rpc('thread/start', { ephemeral: true, cwd: await realpath(os.tmpdir()), approvalPolicy: 'never', sandbox: 'read-only' });
    need(record(started?.thread) && UUID.test(started.thread.id) && started.thread.path === null
      && Array.isArray(started.thread.turns) && started.thread.turns.length === 0, 'IDE_EPHEMERAL_CONTEXT_REQUIRED');
    this.threadId = started.thread.id;
    const status = await this.rpc('mcpServerStatus/list', { threadId: this.threadId, serverName: this.server, detail: 'toolsAndAuthOnly', limit: 1 });
    const servers = Array.isArray(status?.data) ? status.data : [];
    need(servers.length === 1 && servers[0].name === this.server && String(servers[0].authStatus).toLowerCase().replace(/_/g, '') === 'oauth'
      && (!servers[0].httpOrigin || servers[0].httpOrigin === this.origin), 'IDE_REAUTH_REQUIRED');
    need(record(servers[0].tools) && Object.hasOwn(servers[0].tools, 'git_transfer'), 'IDE_TRANSFER_TOOL_UNAVAILABLE');
  }
  async transfer(projectId, request) {
    await this.start(); need(!stop.signal.aborted, 'HELPER_INTERRUPTED');
    // Leave room under the existing token's 120 calls/minute ceiling, including control calls.
    const pause = 700 - (Date.now() - this.lastTransferAt);
    if (pause > 0) { try { await delay(pause, undefined, { signal: stop.signal }); } catch { throw fail('HELPER_INTERRUPTED'); } }
    this.lastTransferAt = Date.now();
    const result = await this.rpc('mcpServer/tool/call', { threadId: this.threadId, server: this.server, tool: 'git_transfer', arguments: { projectId, request } });
    need(record(result) && Array.isArray(result.content), 'TRANSFER_RESPONSE_REJECTED');
    const texts = result.content.filter(c => c?.type === 'text' && typeof c.text === 'string');
    if (result.isError) {
      const code = texts.map(c => /^\[([A-Z][A-Z0-9_]{1,79})\]/.exec(c.text)?.[1]).find(Boolean);
      throw fail(code ?? 'TRANSFER_REJECTED');
    }
    let value = result.structuredContent;
    if (!record(value)) { need(texts.length === 1, 'TRANSFER_RESPONSE_REJECTED'); try { value = JSON.parse(texts[0].text); } catch { throw fail('TRANSFER_RESPONSE_REJECTED'); } }
    return { value, content: result.content };
  }
  async request(route, { method, json, bundle, payload, binary }) {
    const match = /^\/api\/projects\/([1-9][0-9]*)\/(.+)$/.exec(route); need(match, 'API_PATH_REJECTED');
    const projectId = Number(match[1]), suffix = match[2]; need(positive(projectId), 'API_PATH_REJECTED');
    if (suffix === 'operations' && method === 'POST' && !bundle && !binary) return (await this.transfer(projectId, { action: 'operation_create', operation: json })).value.value;
    const operation = /^operations\/([a-f0-9-]{36})(\/resume|\/git-bundle)?$/.exec(suffix);
    if (operation && UUID.test(operation[1])) {
      const operationId = operation[1];
      if (!operation[2] && method === 'GET' && !binary) return (await this.transfer(projectId, { action: 'operation_get', operationId })).value;
      if (operation[2] === '/resume' && method === 'POST' && !binary) return (await this.transfer(projectId, { action: 'operation_resume', operationId, ...json })).value.value;
      if (operation[2] === '/git-bundle' && method === 'GET' && binary) {
        const metadata = (await this.transfer(projectId, { action: 'bundle_metadata', operationId })).value;
        need(metadata.operationId === operationId && UUID.test(metadata.artifactId) && SHA.test(metadata.commitSha) && HASH.test(metadata.sha256)
          && validRef(metadata.ref) && positive(metadata.sizeBytes) && metadata.sizeBytes <= MAX_BUNDLE && metadata.chunkSizeBytes === CHUNK_BYTES
          && metadata.chunkCount === Math.ceil(metadata.sizeBytes / CHUNK_BYTES), 'DOWNLOAD_RECEIPT_REJECTED');
        const chunks = []; let read = 0;
        try {
          for (let index = 0; index < metadata.chunkCount; index++) {
            const result = await this.transfer(projectId, { action: 'bundle_chunk', operationId, index, artifactSha256: metadata.sha256 });
            const m = result.value, resources = result.content.filter(c => c?.type === 'resource' && record(c.resource));
            need(m.index === index && m.commitSha === metadata.commitSha && m.ref === metadata.ref && m.sha256 === metadata.sha256
              && (m.artifactId === undefined || m.artifactId === metadata.artifactId) && (m.operationId === undefined || m.operationId === operationId)
              && m.totalSizeBytes === metadata.sizeBytes && m.sizeBytes === Math.min(CHUNK_BYTES, metadata.sizeBytes - index * CHUNK_BYTES)
              && HASH.test(m.chunkSha256) && resources.length === 1, 'DOWNLOAD_CHUNK_REJECTED');
            const resource = resources[0].resource;
            need(resource.uri === `madang-git-bundle:${operationId}:${index}` && resource.mimeType === 'application/octet-stream'
              && typeof resource.blob === 'string' && resource.blob.length <= Math.ceil(CHUNK_BYTES / 3) * 4 && /^[A-Za-z0-9+/]*={0,2}$/.test(resource.blob), 'DOWNLOAD_CHUNK_REJECTED');
            const bytes = Buffer.from(resource.blob, 'base64');
            need(bytes.length === m.sizeBytes && digest(bytes) === m.chunkSha256, 'DOWNLOAD_CHUNK_REJECTED');
            chunks.push(bytes); read += bytes.length;
          }
          const bytes = Buffer.concat(chunks, read);
          need(read === metadata.sizeBytes && digest(bytes) === metadata.sha256, 'DOWNLOAD_RECEIPT_REJECTED');
          fullBundle(bytes, metadata.commitSha, metadata.ref);
          return { bytes, headers: new Headers({ 'X-Git-Commit-Sha': metadata.commitSha, 'X-Artifact-Sha256': metadata.sha256, 'X-Artifact-Id': metadata.artifactId }) };
        } finally { for (const chunk of chunks) chunk.fill(0); }
      }
    }
    if (suffix === 'git-artifacts' && method === 'POST' && bundle && !binary) {
      need(Buffer.isBuffer(bundle) && bundle.length <= MAX_BUNDLE && digest(bundle) === payload.artifactSha256, 'UPLOAD_ARTIFACT_REJECTED');
      const totalChunks = Math.ceil(bundle.length / CHUNK_BYTES);
      for (let index = 0; index < totalChunks; index++) {
        const bytes = bundle.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES), chunkSha256 = digest(bytes);
        const receipt = (await this.transfer(projectId, { action: 'upload_chunk', artifact: payload, index, totalChunks, totalSizeBytes: bundle.length,
          chunkSha256, bundleChunk: bytes.toString('base64') })).value;
        need(receipt.artifactId === payload.artifactId && receipt.index === index && receipt.totalChunks === totalChunks
          && receipt.totalSizeBytes === bundle.length && receipt.chunkSha256 === chunkSha256 && receipt.sizeBytes === bytes.length, 'UPLOAD_CHUNK_REJECTED');
      }
      return (await this.transfer(projectId, { action: 'upload_commit', artifact: payload, totalChunks, totalSizeBytes: bundle.length })).value.value;
    }
    const artifact = /^git-artifacts\/([a-f0-9-]{36})$/.exec(suffix);
    if (artifact && UUID.test(artifact[1]) && method === 'GET' && !binary) return (await this.transfer(projectId, { action: 'artifact_get', artifactId: artifact[1] })).value;
    throw fail('API_PATH_REJECTED');
  }
}

async function checkpointDirectory(file) {
  need(path.isAbsolute(file) && !file.split(path.sep).includes('..'), 'ABSOLUTE_CHECKPOINT_REQUIRED');
  const parent = path.dirname(file);
  await mkdir(parent, { mode: 0o700, recursive: true });
  const info = await lstat(parent);
  need(info.isDirectory() && !info.isSymbolicLink()
    && (process.getuid === undefined || info.uid === process.getuid() && (info.mode & 0o077) === 0), 'PRIVATE_CHECKPOINT_DIRECTORY_REQUIRED');
  return path.join(await realpath(parent), path.basename(file));
}
async function storeCheckpoint(file, state) {
  const temporary = `${file}.${randomUUID()}.next`, handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, file);
  const parent = await open(path.dirname(file), constants.O_RDONLY | constants.O_DIRECTORY); try { await parent.sync(); } finally { await parent.close(); }
}
async function checkpointLock(file) {
  const lock = `${file}.lock`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      const text = JSON.stringify({ pid: process.pid, nonce: randomUUID() }); await handle.writeFile(text); await handle.sync(); await handle.close();
      return async () => { try { if ((await privateFile(lock, 512)).toString('utf8') === text) await rm(lock); } catch { /* Keep a replacement lock. */ } };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = JSON.parse((await privateFile(lock, 512)).toString('utf8'));
      need(positive(previous.pid) && UUID.test(previous.nonce), 'CHECKPOINT_LOCK_REJECTED');
      try { process.kill(previous.pid, 0); throw fail('HELPER_ALREADY_RUNNING'); }
      catch (failure) { if (failure.code !== 'ESRCH') throw fail('HELPER_ALREADY_RUNNING'); }
      await rm(lock);
    }
  }
  throw fail('HELPER_ALREADY_RUNNING');
}
function argsOf(argv) {
  const result = { command: argv.shift() };
  need(COMMANDS.has(result.command), 'COMMAND_REQUIRED');
  while (argv.length) { const key = argv.shift(); need(/^--[a-z][a-z-]*$/.test(key) && argv.length > 0, 'ARGUMENT_REJECTED'); need(!Object.hasOwn(result, key.slice(2)), 'ARGUMENT_REJECTED'); result[key.slice(2)] = argv.shift(); }
  const allowed = new Set(['checkpoint', 'origin', 'ide', 'server', 'project', 'issue', 'connection', 'version', 'credential-version', 'repository', 'ref', 'directory', 'environment', 'purpose', 'expected-old-oid', 'grant', 'decision', 'wait-seconds']);
  need(Object.keys(result).every(k => k === 'command' || allowed.has(k)), 'ARGUMENT_REJECTED');
  need(result.checkpoint, 'CHECKPOINT_REQUIRED');
  return result;
}
function newState(args) {
  need(args.directory && path.isAbsolute(args.directory), 'ABSOLUTE_WORKSPACE_REQUIRED');
  const state = { protocolVersion: 1, origin: originOf(args.origin), ide: args.ide, ...(args.server ? { serverName: args.server } : {}),
    projectId: Number(args.project), issueId: Number(args.issue), connectionId: args.connection, connectionVersion: Number(args.version),
    credentialVersion: Number(args['credential-version']), repositoryId: Number(args.repository), ref: args.ref, directory: path.resolve(args.directory ?? '.'),
    environment: args.environment, purpose: args.purpose ?? 'verification', kind: args.command === 'prepare-push' ? 'git.push' : args.command === 'clone' ? 'git.clone' : 'git.fetch',
    localAction: args.command, requestKey: randomUUID(), phase: 'created' };
  need(['codex', 'claude'].includes(state.ide), 'IDE_REQUIRED');
  need([state.projectId, state.issueId, state.connectionVersion, state.credentialVersion, state.repositoryId].every(positive)
    && UUID.test(state.connectionId) && validRef(state.ref) && /^[a-z][a-z0-9_-]{0,31}$/.test(state.environment)
    && state.environment !== 'unspecified' && ['development', 'verification', 'operations'].includes(state.purpose), 'TARGET_REJECTED');
  if (state.kind === 'git.push') {
    need(args['expected-old-oid'] === 'null' || SHA.test(args['expected-old-oid'] ?? ''), 'EXPECTED_OLD_OID_REQUIRED');
    state.operationId = randomUUID(); state.artifactId = randomUUID(); state.expectedOldOid = args['expected-old-oid'] === 'null' ? null : args['expected-old-oid'];
  }
  return state;
}
function validateState(state) {
  const allowed = new Set(['protocolVersion', 'origin', 'ide', 'serverName', 'projectId', 'issueId', 'connectionId', 'connectionVersion', 'credentialVersion', 'repositoryId', 'ref', 'directory', 'environment', 'purpose', 'kind', 'localAction', 'requestKey', 'phase', 'operationId', 'artifactId', 'expectedOldOid', 'commitSha', 'artifactSha256', 'bundleSize', 'artifactReceipt', 'grantId', 'decisionId', 'operationRequest', 'operation', 'resumeRequest', 'resumeReceipt', 'download', 'localBeforeSha']);
  need(record(state) && Object.keys(state).every(k => allowed.has(k)) && state.protocolVersion === 1 && originOf(state.origin) === state.origin
    && ['codex', 'claude'].includes(state.ide) && [state.projectId, state.issueId, state.connectionVersion, state.credentialVersion, state.repositoryId].every(positive)
    && UUID.test(state.connectionId) && UUID.test(state.requestKey) && validRef(state.ref) && path.isAbsolute(state.directory)
    && ['git.clone', 'git.fetch', 'git.push'].includes(state.kind) && ['clone', 'fetch', 'pull', 'prepare-push'].includes(state.localAction)
    && /^[a-z][a-z0-9_-]{0,31}$/.test(state.environment) && ['development', 'verification', 'operations'].includes(state.purpose), 'CHECKPOINT_REJECTED');
  if (state.operationId !== undefined) need(UUID.test(state.operationId), 'CHECKPOINT_REJECTED');
  if (state.kind === 'git.push') need(UUID.test(state.artifactId) && UUID.test(state.operationId) && (state.expectedOldOid === null || SHA.test(state.expectedOldOid)), 'CHECKPOINT_REJECTED');
  if (state.commitSha !== undefined) need(SHA.test(state.commitSha), 'CHECKPOINT_REJECTED');
  if (state.artifactSha256 !== undefined) need(HASH.test(state.artifactSha256) && positive(state.bundleSize) && state.bundleSize <= MAX_BUNDLE, 'CHECKPOINT_REJECTED');
  return state;
}
async function git(directory, args, outputLimit = MAX_JSON) {
  const result = await child('/usr/bin/git', ['-c', 'credential.helper=', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.ext.allow=never',
    '-c', 'protocol.http.allow=never', '-c', 'protocol.https.allow=never', '-c', 'protocol.ssh.allow=never', '-c', 'protocol.file.allow=always', ...args], {
    cwd: directory, maxBuffer: outputLimit, timeout: 120_000,
    env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1', LANG: 'C' },
  });
  return result;
}
const gitText = async (directory, args) => (await git(directory, args)).toString('utf8').trim();
function fullBundle(bytes, sha, ref) {
  const end = bytes.indexOf(Buffer.from('\n\n'));
  need(bytes.length >= 64 && bytes.length <= MAX_BUNDLE && end > 0 && end <= 65536, 'FULL_BUNDLE_REQUIRED');
  const lines = bytes.subarray(0, end).toString('utf8').split('\n');
  need(['# v2 git bundle', '# v3 git bundle'].includes(lines.shift()), 'FULL_BUNDLE_REQUIRED');
  need(lines.filter(l => !l.startsWith('@')).length === 1 && lines.filter(l => !l.startsWith('@'))[0] === `${sha} ${ref}`
    && lines.every(l => !l.startsWith('-') && (!l.startsWith('@') || l === '@object-format=sha1')), 'FULL_BUNDLE_REQUIRED');
}
function operationRequest(state) {
  const parameters = { repositoryId: state.repositoryId, ref: state.ref };
  const request = { requestKey: state.requestKey, expectedVersion: state.connectionVersion, issueId: state.issueId, kind: state.kind,
    environment: state.environment, purpose: state.purpose, targetId: state.connectionId, parameters };
  if (state.kind === 'git.push') {
    Object.assign(parameters, { commitSha: state.commitSha, expectedOldOid: state.expectedOldOid, artifactId: state.artifactId, artifactSha256: state.artifactSha256 });
    Object.assign(request, { operationId: state.operationId, artifactRevision: state.commitSha, grantId: state.grantId, decisionId: state.decisionId });
  }
  return request;
}
function operationView(value, state) {
  need(record(value) && UUID.test(value.operationId) && value.projectId === state.projectId && value.issueId === state.issueId
    && positive(value.version) && ['queued', 'running', 'awaiting_human', 'blocked', 'unknown', 'reconciling', 'succeeded', 'failed', 'cancel_requested', 'cancelled', 'compensating', 'compensated'].includes(value.status)
    && (!state.operationId || state.operationId === value.operationId), 'OPERATION_RESPONSE_REJECTED');
  return { operationId: value.operationId, projectId: value.projectId, issueId: value.issueId, version: value.version, status: value.status,
    ...(typeof value.errorCode === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(value.errorCode) ? { errorCode: value.errorCode } : {}) };
}
function summary(state) {
  return { protocolVersion: 1, phase: state.phase, kind: state.kind, requestKey: state.requestKey,
    ...(state.operationId ? { operationId: state.operationId } : {}), ...(state.operation ? { operation: state.operation } : {}),
    ...(state.commitSha ? { commitSha: state.commitSha } : {}), ...(state.download ? { download: state.download } : {}),
    ...(state.kind === 'git.push' && state.artifactSha256 ? { approvalBinding: { operationId: state.operationId, artifactId: state.artifactId,
      repositoryId: state.repositoryId, connectionId: state.connectionId, credentialVersion: state.credentialVersion, ref: state.ref, commitSha: state.commitSha,
      expectedOldOid: state.expectedOldOid, artifactSha256: state.artifactSha256, bundleSize: state.bundleSize } } : {}) };
}
async function preparePush(state, file) {
  need(await gitText(state.directory, ['rev-parse', '--show-object-format']) === 'sha1', 'SHA1_REPOSITORY_REQUIRED');
  need(await gitText(state.directory, ['symbolic-ref', 'HEAD']) === state.ref, 'LOCAL_REF_MISMATCH');
  const commit = await gitText(state.directory, ['rev-parse', '--verify', 'HEAD^{commit}']); need(SHA.test(commit), 'LOCAL_COMMIT_REQUIRED');
  const bytes = await git(state.directory, ['bundle', 'create', '-', state.ref], MAX_BUNDLE);
  try {
    fullBundle(bytes, commit, state.ref);
    if (state.artifactSha256) need(state.commitSha === commit && state.artifactSha256 === digest(bytes), 'LOCAL_ARTIFACT_CHANGED');
    else { state.commitSha = commit; state.artifactSha256 = digest(bytes); state.bundleSize = bytes.length; state.phase = 'awaiting_existing_grant'; await storeCheckpoint(file, state); }
    return bytes;
  } catch (error) { bytes.fill(0); throw error; }
}
async function waitOperation(state, file, api, waitSeconds) {
  const deadline = Date.now() + waitSeconds * 1000;
  while (true) {
    const value = await api.request(`/api/projects/${state.projectId}/operations/${state.operationId}`);
    state.operation = operationView(value, state); await storeCheckpoint(file, state);
    if (['succeeded', 'failed', 'blocked', 'unknown', 'cancelled', 'awaiting_human'].includes(state.operation.status) || Date.now() >= deadline) return;
    try { await delay(1500, undefined, { signal: stop.signal }); } catch { throw fail('HELPER_INTERRUPTED'); }
  }
}
async function downloadAndApply(state, file, api) {
  if (state.phase === 'local_complete') return;
  const { bytes, headers } = await api.request(`/api/projects/${state.projectId}/operations/${state.operationId}/git-bundle`, { binary: true });
  const sha = headers.get('x-git-commit-sha'), hash = headers.get('x-artifact-sha256'), artifact = headers.get('x-artifact-id');
  let temporary, ownsTemporary = false;
  try {
    need(SHA.test(sha ?? '') && HASH.test(hash ?? '') && UUID.test(artifact ?? '') && digest(bytes) === hash, 'DOWNLOAD_RECEIPT_REJECTED');
    fullBundle(bytes, sha, state.ref);
    if (state.download) need(state.download.commitSha === sha && state.download.sha256 === hash && state.download.artifactId === artifact, 'DOWNLOAD_RECEIPT_CHANGED');
    state.download = { artifactId: artifact, commitSha: sha, sha256: hash, sizeBytes: bytes.length };
    state.phase = 'download_verified'; await storeCheckpoint(file, state);
    temporary = `${file}.${state.operationId}.bundle`;
    try {
      const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      ownsTemporary = true;
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = await privateFile(temporary, MAX_BUNDLE);
      try { need(previous.length === bytes.length && digest(previous) === hash, 'LOCAL_BUNDLE_REQUIRES_REVIEW'); ownsTemporary = true; }
      finally { previous.fill(0); }
    }
    const branch = state.ref.slice('refs/heads/'.length), tracking = `refs/remotes/dev/${branch}`;
    if (state.localAction === 'clone') {
      let exists = false; try { await lstat(state.directory); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (!exists) {
        await git(path.dirname(state.directory), ['clone', '--no-hardlinks', '--template=', '--origin=dev', '--branch', branch, temporary, state.directory]);
        await git(state.directory, ['remote', 'set-url', 'dev', `dev-madang://project/${state.projectId}/repository/${state.repositoryId}`]);
      } else {
        // A killed clone is never deleted or overwritten. Only a complete clone from this checkpoint resumes.
        const previousRemote = await gitText(state.directory, ['remote', 'get-url', 'dev']);
        need([temporary, `dev-madang://project/${state.projectId}/repository/${state.repositoryId}`].includes(previousRemote)
          && await gitText(state.directory, ['rev-parse', '--verify', 'HEAD']) === sha
          && (await gitText(state.directory, ['status', '--porcelain'])).length === 0, 'LOCAL_CLONE_REQUIRES_REVIEW');
        if (previousRemote === temporary) await git(state.directory, ['remote', 'set-url', 'dev', `dev-madang://project/${state.projectId}/repository/${state.repositoryId}`]);
      }
    } else {
      need(await gitText(state.directory, ['symbolic-ref', 'HEAD']) === state.ref, 'LOCAL_REF_MISMATCH');
      if (state.localAction === 'pull') need((await gitText(state.directory, ['status', '--porcelain'])).length === 0, 'LOCAL_WORKTREE_DIRTY');
      await git(state.directory, ['fetch', '--no-tags', '--no-write-fetch-head', temporary, `${state.ref}:${tracking}`]);
      if (state.localAction === 'pull') await git(state.directory, ['merge', '--ff-only', '--no-edit', sha]);
    }
    need(await gitText(state.directory, ['rev-parse', '--verify', state.localAction === 'fetch' ? tracking : 'HEAD']) === sha, 'LOCAL_SHA_MISMATCH');
    state.commitSha = sha; state.phase = 'local_complete'; await storeCheckpoint(file, state);
  } finally { bytes.fill(0); if (temporary && ownsTemporary) await rm(temporary, { force: true }); }
}
async function run(args) {
  const file = await checkpointDirectory(path.resolve(args.checkpoint));
  const release = await checkpointLock(file); let state, api;
  try {
    try { state = validateState(JSON.parse((await privateFile(file, MAX_JSON)).toString('utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; need(['clone', 'fetch', 'pull', 'prepare-push'].includes(args.command), 'CHECKPOINT_NOT_FOUND'); state = newState(args); await storeCheckpoint(file, state); }
    for (const [argument, key] of [['origin', 'origin'], ['ide', 'ide'], ['server', 'serverName'], ['ref', 'ref'], ['directory', 'directory']]) {
      if (args[argument]) need((argument === 'directory' ? path.resolve(args[argument]) : argument === 'origin' ? originOf(args[argument]) : args[argument]) === state[key], 'CHECKPOINT_TARGET_CHANGED');
    }
    for (const [argument, key] of [['project', 'projectId'], ['issue', 'issueId'], ['connection', 'connectionId'], ['version', 'connectionVersion'],
      ['credential-version', 'credentialVersion'], ['repository', 'repositoryId'], ['environment', 'environment'], ['purpose', 'purpose'], ['expected-old-oid', 'expectedOldOid']]) {
      if (args[argument] !== undefined) {
        const supplied = typeof state[key] === 'number' ? Number(args[argument]) : argument === 'expected-old-oid' && args[argument] === 'null' ? null : args[argument];
        need(supplied === state[key], 'CHECKPOINT_TARGET_CHANGED');
      }
    }
    api = new DevGitApi(state); const operationRoute = `/api/projects/${state.projectId}/operations`;
    const waitSeconds = Number(args['wait-seconds'] ?? '45'); need(Number.isInteger(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 600, 'WAIT_REJECTED');
    if (args.command === 'prepare-push') { need(state.kind === 'git.push', 'CHECKPOINT_KIND_MISMATCH'); const bytes = await preparePush(state, file); bytes.fill(0); emit(summary(state)); return; }
    if (args.command === 'status') {
      if (state.operationId && state.operationRequest) { state.operation = operationView(await api.request(`${operationRoute}/${state.operationId}`), state); await storeCheckpoint(file, state); }
      emit(summary(state)); return;
    }
    if (state.kind === 'git.push') {
      need(['push', 'resume'].includes(args.command), 'CHECKPOINT_KIND_MISMATCH');
      const bundle = await preparePush(state, file);
      try {
        if (!state.grantId) { need(UUID.test(args.grant ?? '') && positive(Number(args.decision)), 'EXISTING_GRANT_REQUIRED'); state.grantId = args.grant; state.decisionId = Number(args.decision); await storeCheckpoint(file, state); }
        if (args.grant) need(args.grant === state.grantId && Number(args.decision) === state.decisionId, 'CHECKPOINT_GRANT_CHANGED');
        const payload = { artifactId: state.artifactId, operationId: state.operationId, issueId: state.issueId, connectionId: state.connectionId,
          credentialVersion: state.credentialVersion, repositoryId: state.repositoryId, ref: state.ref, commitSha: state.commitSha,
          expectedOldOid: state.expectedOldOid, artifactSha256: state.artifactSha256, grantId: state.grantId };
        if (!state.artifactReceipt) {
          // Same artifact ID and exact bytes recover an interrupted upload; no fresh upload key is created.
          const receipt = await api.request(`/api/projects/${state.projectId}/git-artifacts`, { method: 'POST', bundle, payload });
          need(receipt.artifactId === state.artifactId && receipt.operationId === state.operationId && receipt.repositoryId === state.repositoryId
            && receipt.commitSha === state.commitSha && receipt.ref === state.ref && receipt.sha256 === state.artifactSha256
            && receipt.sizeBytes === state.bundleSize && Number.isFinite(Date.parse(receipt.expiresAt)), 'UPLOAD_RECEIPT_REJECTED');
          state.artifactReceipt = { ...payload, sha256: receipt.sha256, sizeBytes: receipt.sizeBytes, expiresAt: receipt.expiresAt }; state.phase = 'artifact_published'; await storeCheckpoint(file, state);
        }
      } finally { bundle.fill(0); }
    } else need(['clone', 'fetch', 'pull', 'resume'].includes(args.command), 'CHECKPOINT_KIND_MISMATCH');
    if (!state.operationRequest) { state.operationRequest = operationRequest(state); state.phase = 'operation_prepared'; await storeCheckpoint(file, state); }
    if (!state.operation) {
      // Replaying an unobserved POST returns the same durable receipt and operation ID.
      state.operation = operationView(await api.request(operationRoute, { method: 'POST', json: state.operationRequest }), state);
      state.operationId = state.operation.operationId; state.phase = 'operation_created'; await storeCheckpoint(file, state);
    }
    if (args.command === 'resume') {
      const latest = operationView(await api.request(`${operationRoute}/${state.operationId}`), state);
      const unobservedMutation = state.resumeRequest && !state.resumeReceipt;
      if (unobservedMutation || ['unknown', 'awaiting_human'].includes(latest.status)) {
        // An unobserved mutation is always looked up by its original key first, even if the
        // operation advanced. Only a later explicit resume with a known receipt and a new
        // operation version gets a fresh mutation key; the create key and operation ID stay fixed.
        if (!state.resumeRequest || state.resumeReceipt && state.resumeReceipt.version !== latest.version) {
          state.resumeRequest = { requestKey: randomUUID(), expectedVersion: latest.version };
          delete state.resumeReceipt; await storeCheckpoint(file, state);
        }
        state.operation = operationView(await api.request(`${operationRoute}/${state.operationId}/resume`, { method: 'POST', json: state.resumeRequest }), state);
        state.resumeReceipt = { requestKey: state.resumeRequest.requestKey, version: state.operation.version };
        await storeCheckpoint(file, state);
      }
    }
    await waitOperation(state, file, api, waitSeconds);
    if (state.operation.status === 'succeeded') {
      if (state.kind === 'git.push') { state.phase = 'remote_complete'; await storeCheckpoint(file, state); }
      else await downloadAndApply(state, file, api);
    }
    emit(summary(state));
  } finally { try { await api?.close(); } finally { await release(); } }
}
export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h', 'help'].includes(argv[0])) { process.stdout.write(HELP); return; }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop.abort());
  try { await run(argsOf([...argv])); }
  catch (error) {
    const code = typeof error.safeCode === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(error.safeCode) ? error.safeCode : 'HELPER_FAILED';
    emit({ ok: false, errorCode: code, nextAction: ['IDE_REAUTH_REQUIRED', 'IDE_AUTH_STORE_UNAVAILABLE'].includes(code) ? 'IDE에서 기존 DEV 연결을 다시 인증한 뒤 같은 checkpoint로 재개하세요.' : '같은 checkpoint에서 상태를 조회하고 재개하세요.' });
    process.exitCode = code === 'HELPER_INTERRUPTED' ? 130 : 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
