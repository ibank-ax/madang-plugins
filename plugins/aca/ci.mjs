import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { exportPublicBootstrap } from './export.mjs';

// Source/package verification only. Never imports product code or contacts MCP.
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--out' || args[2] !== '--receipt' || !path.isAbsolute(args[3])) throw new Error();
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const generated = exportPublicBootstrap({ root, commit, out: args[1] });
  const names = Object.keys(generated.sha256), present = names.filter(name => existsSync(path.join(root, name)));
  if (present.length && present.length !== 13) throw new Error();
  for (const name of present) {
    if (!readFileSync(path.join(root, name)).equals(readFileSync(path.join(args[1], name)))) throw new Error();
  }
  const receipt = { format: 'aca-public-export-ci-v1', packageCommit: commit,
    providerSource: 'ccb0774b90eba58c94a7f752d2d3d92fb322c8a8',
    bootstrapFiles: generated.files, bootstrapSha256: generated.sha256,
    committedPublicFilesVerified: present.length, organizationFixtureOnly: true,
    registeredOrganizationPackagePublished: false, ideInstalled: false, oauthAccepted: false,
    actualReadAccepted: false, productionConnected: false };
  writeFileSync(args[3], `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`aca_public_bootstrap_generated=${generated.files}\naca_committed_public_files_verified=${present.length}\n`);
} catch { process.stderr.write('aca_public_export_ci_refused\n'); process.exitCode = 1; }
