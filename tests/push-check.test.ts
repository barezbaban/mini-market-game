import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const gate = resolve('scripts/check-push.mjs');
const zeros = '0'.repeat(40);
const line = (sha: string) => `refs/heads/demo ${sha} refs/heads/demo ${zeros}\n`;

it('checks the outgoing commit, ignores uncommitted files, and stops at the first failed check', () => {
  const repo = mkdtempSync(join(tmpdir(), 'kurdmart-hook-test-'));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
    const run = (refs: string) =>
      spawnSync(process.execPath, [gate], { cwd: repo, input: refs, encoding: 'utf8' });
    git('init', '--quiet');
    const pkg = { name: 'market-hook-test', version: '1.0.0' };
    const scripts = Object.fromEntries(
      ['lint', 'test', 'build'].map((name) => [name, `node probe.cjs ${name}`]),
    );
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ ...pkg, scripts }));
    writeFileSync(
      join(repo, 'package-lock.json'),
      JSON.stringify({ ...pkg, lockfileVersion: 3, packages: { '': pkg } }),
    );
    writeFileSync(
      join(repo, 'probe.cjs'),
      "const step=process.argv[2]; console.log('probe:'+step); if(require('node:fs').readFileSync('fail-at','utf8')===step) process.exit(7);",
    );
    const commit = (failAt: string) => {
      writeFileSync(join(repo, 'fail-at'), failAt);
      git('add', '.');
      git(
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--quiet',
        '-m',
        'Fixture',
      );
      return git('rev-parse', 'HEAD');
    };
    const bad = commit('lint');
    const good = commit('none');
    writeFileSync(join(repo, 'fail-at'), 'build');
    const pass = run(line(good) + line(good));
    expect(pass.status, pass.stderr).toBe(0);
    expect(pass.stdout.match(/probe:(lint|test|build)/g)).toEqual([
      'probe:lint',
      'probe:test',
      'probe:build',
    ]);
    const fail = run(line(bad));
    expect(fail.status).toBe(1);
    expect(fail.stdout).toContain('probe:lint');
    expect(fail.stdout).not.toContain('probe:test');
    expect(run(line(zeros)).status).toBe(0);
    expect(run('invalid ref data\n').status).toBe(1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}, 30_000);
