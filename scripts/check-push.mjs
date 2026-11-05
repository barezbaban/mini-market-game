// Git provides one line per ref: local name, local object, remote name, remote object.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function checkPush() {
  const commits = new Set();
  for (const line of readFileSync(0, 'utf8').trim().split('\n').filter(Boolean)) {
    const fields = line.split(/\s+/);
    const oid = fields[1];
    if (fields.length !== 4 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid))
      throw new Error('Invalid pre-push ref data.');
    if (/^0+$/.test(oid)) continue; // A deletion sends no code.
    commits.add(
      execFileSync('git', ['rev-parse', '--verify', `${oid}^{commit}`], {
        encoding: 'utf8',
      }).trim(),
    );
  }
  if (!commits.size) return;
  const gitDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  }).trim();
  const checkEnv = { ...process.env };
  for (const name of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
    .trim()
    .split('\n'))
    delete checkEnv[name];
  for (const commit of commits) {
    const temp = mkdtempSync(join(tmpdir(), 'kurdmart-prepush-'));
    try {
      const checkout = join(temp, 'market');
      mkdirSync(checkout);
      const archive = join(temp, 'market.tar');
      console.log(`[KurdMart] Checking ${commit.slice(0, 12)} before push…`);
      execFileSync('git', ['archive', '--format=tar', '-o', archive, commit]);
      execFileSync('tar', ['-xf', archive, '-C', checkout]);
      const run = (args) =>
        execFileSync('npm', args, {
          cwd: checkout,
          env: checkEnv,
          stdio: ['ignore', 'inherit', 'inherit'],
        });
      run([
        'ci',
        '--prefer-offline',
        '--no-audit',
        '--no-fund',
        '--cache',
        join(gitDir, 'kurdmart-npm-cache'),
      ]);
      run(['run', 'lint']);
      run(['test']);
      run(['run', 'build']);
    } finally {
      rmSync(temp, { recursive: true, force: true }); // Only our freshly created snapshot.
    }
  }
}

try {
  checkPush();
} catch (error) {
  console.error(`[KurdMart] Push stopped: ${error.message}`);
  process.exitCode = 1;
}
