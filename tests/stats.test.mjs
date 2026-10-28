import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchProfileStats, graphql } from '../scripts/stats-fetch.mjs';

const now = new Date('2026-10-28T10:40:00Z');
const previous = { login: 'me', generatedAt: '2026-10-27', totals: { commits: 99 }, pinned: [] };
const me = { id: 'USER', pullRequests: { totalCount: 4 }, issues: { totalCount: 2 }, contributionsCollection: { contributionYears: [2026, 2025] } };
const years = { y2026: { contributionCalendar: { totalContributions: 20 } }, y2025: { contributionCalendar: { totalContributions: 10 } } };
const repo = (name, count = 1, fork = false) => ({
  nameWithOwner: name, owner: { login: name.split('/')[0] }, isFork: fork,
  defaultBranchRef: count === null ? null : { target: { history: { totalCount: count } } },
  languages: { edges: [{ size: 10, node: { name: 'JavaScript', color: '#ffff00' } }] },
});

function fixture(own, contributed = []) {
  const calls = [];
  return { calls, gql: async query => {
    calls.push(query);
    if (query.includes('viewer{id')) return me;
    if (query.includes('y2026:')) return years;
    const connection = query.includes('repositoriesContributedTo(') ? 'repositoriesContributedTo' : 'repositories';
    const nodes = connection === 'repositories' ? own : contributed;
    const offset = Number(/after:"(\d+)"/.exec(query)?.[1] || 0);
    return { [connection]: { nodes: nodes.slice(offset, offset + 10), pageInfo: {
      hasNextPage: offset + 10 < nodes.length, endCursor: String(offset + 10),
    } } };
  } };
}

test('pages past 100 repositories, deduplicates overlaps and preserves metric semantics', async () => {
  const repos = [...Array.from({ length: 101 }, (_, i) => repo('me/r' + i)), repo('me/fork', 2, true), repo('team/shared', 3)];
  const contributed = [repo('team/shared', 3), repo('team/empty', null), ...Array.from({ length: 11 }, (_, i) => repo('team/other' + i, 2))];
  const f = fixture(repos, contributed);
  const snapshot = JSON.stringify(previous);
  const result = await fetchProfileStats(previous, { gql: f.gql, now });
  assert.deepEqual(result.totals, { commits: 128, pullRequests: 4, issues: 2, contributions: 30, ownRepos: 102, contributedTo: 12, yearContributions: 20 });
  assert.deepEqual(result.perYear, { 2025: 10, 2026: 20 });
  assert.deepEqual(result.languages, [{ name: 'JavaScript', size: 1010, color: '#ffff00' }]);
  assert.equal(result.generatedAt, '2026-10-28');
  assert.equal(JSON.stringify(previous), snapshot);
  const pages = f.calls.filter(q => q.includes('first:10,'));
  assert.equal(pages.length, 13);
  assert.ok(pages.every(q => !q.includes('first:100')));
  assert.ok(pages.every(q => !(q.includes('repositories(') && q.includes('repositoriesContributedTo('))));
  assert.ok(pages.some(q => q.includes('after:"100"')));
});

for (const code of ['429', '500', '502', '503', '504', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']) {
  test(`retries transient ${code} then accepts a complete response`, async () => {
    let calls = 0;
    const waits = [];
    const warnings = [];
    const viewer = await graphql('query{viewer{id}}', { run: (command, args, options) => {
      assert.equal(command, 'gh');
      assert.equal(options.timeout, 60_000);
      assert.equal(options.stdio, 'pipe');
      if (++calls === 1) throw Object.assign(new Error('private query'), /^\d/.test(code) ? { stderr: `gh: HTTP ${code}\n` } : { code });
      return JSON.stringify({ data: { viewer: { id: 'USER' } } });
    }, wait: async ms => waits.push(ms), warn: text => warnings.push(text) });
    assert.deepEqual(viewer, { id: 'USER' });
    assert.equal(calls, 2);
    assert.deepEqual(waits, [1000]);
    assert.equal(warnings.length, 1);
    assert.ok(!warnings[0].includes('private query'));
  });
}

test('persistent 502 stops after four attempts with bounded backoff and no raw body', async () => {
  let calls = 0;
  const waits = [];
  await assert.rejects(graphql('private query', { run: () => {
    calls++;
    throw Object.assign(new Error('private query'), { stderr: 'gh: HTTP 502\n', stdout: '<html>private response</html>' });
  }, wait: async ms => waits.push(ms), warn: () => {} }), error => {
    assert.match(error.message, /HTTP 502.*4 attempt/);
    assert.doesNotMatch(error.message, /private/);
    return true;
  });
  assert.equal(calls, 4);
  assert.deepEqual(waits, [1000, 2000, 4000]);
});

for (const status of [401, 403, 422]) {
  test(`does not retry permanent HTTP ${status}`, async () => {
    let calls = 0;
    await assert.rejects(graphql('query', { run: () => { calls++; throw { stderr: `gh: HTTP ${status}` }; }, wait: () => assert.fail('unexpected retry') }), /1 attempt/);
    assert.equal(calls, 1);
  });
}

for (const body of ['<html>bad gateway</html>', '{}', '{"data":{"viewer":{"id":"USER"}},"errors":[{"message":"partial"}]}']) {
  test(`rejects invalid or partial GraphQL response: ${body}`, async () => {
    await assert.rejects(graphql('query', { run: () => body, wait: () => assert.fail('unexpected retry') }), /saved stats were not refreshed/);
  });
}

test('empty repository connections return zero counts without breaking pagination', async () => {
  const f = fixture([]);
  const result = await fetchProfileStats(previous, { gql: f.gql, now });
  assert.equal(result.totals.ownRepos, 0);
  assert.equal(result.totals.commits, 0);
  assert.deepEqual(result.languages, []);
});

for (const page of [{ nodes: null, pageInfo: {} }, { nodes: [null], pageInfo: {} }, { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } }, { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'same' } }]) {
  test('rejects incomplete pages or stalled cursors without mutating saved input', async () => {
    const snapshot = JSON.stringify(previous);
    const gql = async query => query.includes('viewer{id') ? me : query.includes('y2026:') ? years : { repositories: page };
    await assert.rejects(fetchProfileStats(previous, { gql, now }), /saved stats were not refreshed/);
    assert.equal(JSON.stringify(previous), snapshot);
  });
}

test('a later page failure aborts rather than returning partial totals', async () => {
  const f = fixture(Array.from({ length: 11 }, (_, i) => repo('me/r' + i)));
  await assert.rejects(fetchProfileStats(previous, { now, gql: async query => {
    if (query.includes('after:')) throw new Error('HTTP 502');
    return f.gql(query);
  } }), /HTTP 502/);
  assert.equal(previous.totals.commits, 99);
});

// Exercise the real CLI in a disposable copy. Replace only the gh transport:
// these tests cannot access the network or change tracked profile assets.
for (const mode of ['failure', 'unchanged', 'changed']) {
  test(`generator CLI: ${mode}`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'profile-stats-'));
    try {
      mkdirSync(join(dir, 'scripts'));
      mkdirSync(join(dir, 'data'));
      mkdirSync(join(dir, 'assets'));
      for (const name of ['generate.mjs', 'stats-fetch.mjs']) cpSync(new URL('../scripts/' + name, import.meta.url), join(dir, 'scripts', name));
      const seed = { ...previous, totals: { commits: 1, pullRequests: 4, issues: 2, contributions: 30, ownRepos: 1, contributedTo: 0, yearContributions: years['y' + new Date().getUTCFullYear()]?.contributionCalendar.totalContributions || 0 }, perYear: { 2025: 10, 2026: 20 }, languages: [{ name: 'JavaScript', size: 10, color: '#ffff00' }] };
      if (mode === 'changed') seed.totals.commits = 99;
      const saved = JSON.stringify(seed);
      writeFileSync(join(dir, 'data/stats.json'), saved);
      writeFileSync(join(dir, 'assets/stats.svg'), 'saved card');
      const preload = `import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
cp.execFileSync = (command,args) => {
  if(command !== 'gh') throw new Error('Unexpected subprocess');
  if(${JSON.stringify(mode)} === 'failure') throw Object.assign(new Error('auth'), {stderr:'gh: HTTP 401'});
  const q = args.at(-1);
  const viewer = q.includes('viewer{id') ? ${JSON.stringify(me)} : q.includes('y2026:') ? ${JSON.stringify(years)} : q.includes('repositoriesContributedTo(') ? {repositoriesContributedTo:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}} : {repositories:{nodes:[${JSON.stringify(repo('me/one'))}],pageInfo:{hasNextPage:false,endCursor:null}}};
  return JSON.stringify({data:{viewer}});
};
syncBuiltinESMExports();`;
      writeFileSync(join(dir, 'preload.mjs'), preload);
      const run = () => execFileSync(process.execPath, ['--import', pathToFileURL(join(dir, 'preload.mjs')).href, join(dir, 'scripts/generate.mjs'), '--fetch'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, STATIC_OUT: '' } });
      if (mode === 'failure') {
        assert.throws(run, /saved stats were not refreshed/);
      } else {
        assert.match(run(), mode === 'unchanged' ? /stats unchanged/ : /generated/);
      }
      if (mode !== 'changed') {
        assert.equal(readFileSync(join(dir, 'data/stats.json'), 'utf8'), saved);
        assert.equal(readFileSync(join(dir, 'assets/stats.svg'), 'utf8'), 'saved card');
      } else {
        assert.equal(JSON.parse(readFileSync(join(dir, 'data/stats.json'), 'utf8')).totals.commits, 1);
        assert.match(readFileSync(join(dir, 'assets/stats.svg'), 'utf8'), /<svg.*GitHub stats/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
