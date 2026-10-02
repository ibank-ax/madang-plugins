#!/usr/bin/env node
// Public DOCS plugin: the organization URL is supplied by the user's client.
import { spawn } from 'node:child_process';

function fail(message) {
  process.stderr.write(`DOCS.MADANG: ${message}\n`);
  process.exit(1);
}

if (Number(process.versions.node.split('.')[0]) < 20) {
  fail('Node.js 20 이상과 npm/npx가 필요합니다.');
}

const configured = process.env.DOCS_MADANG_MCP_URL?.trim();
if (!configured) {
  fail('DOCS_MADANG_MCP_URL에 조직의 플러그인.MCP 설정 화면에서 복사한 MCP 주소를 지정하고 클라이언트를 다시 시작하세요.');
}

let endpoint;
try {
  endpoint = new URL(configured);
} catch {
  fail('MCP 주소 형식이 올바르지 않습니다. 조직 설정에서 https://조직주소/mcp를 다시 복사하세요.');
}
if (
  endpoint.protocol !== 'https:' || !endpoint.hostname ||
  endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
  endpoint.pathname !== '/mcp' || endpoint.hostname === 'docs.madang.ai'
) {
  fail('조직 전용 HTTPS /mcp 주소를 사용하세요. 플랫폼 주소, URL에 포함된 인증 정보·쿼리·프래그먼트는 사용할 수 없습니다.');
}

// No URL, account, key, or OAuth token is bundled with this plugin.
// A normalized URL has no shell metacharacters; Windows npx.cmd needs cmd.exe.
const normalized = `${endpoint.origin}/mcp`;
if (!/^https:\/\/[a-z0-9.:[\]-]+\/mcp$/i.test(normalized)) {
  fail('MCP 주소의 호스트 형식이 올바르지 않습니다.');
}
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
  '--yes', 'mcp-remote@0.14.3', normalized,
  '--transport', 'http-only', '--auth-timeout', '300',
], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
  windowsHide: true,
});
child.on('error', () => fail('mcp-remote를 시작하지 못했습니다. npm/npx 설치와 네트워크 연결을 확인하세요.'));
child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
