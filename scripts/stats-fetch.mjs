import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

// Keep expensive commit histories in small, sequential requests.
const PAGE_SIZE = 10;
const MAX_ATTEMPTS = 4;

export async function graphql(query, { run = execFileSync, wait = sleep, warn = console.warn } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = JSON.parse(run('gh', ['api', 'graphql', '-f', 'query=' + query], {
        encoding: 'utf8', maxBuffer: 64 << 20, timeout: 60_000, stdio: 'pipe',
      }));
      // GraphQL can return partial data alongside errors even with HTTP 200.
      if (response.errors?.length || !response.data?.viewer) {
        throw new Error('GitHub GraphQL returned errors or an incomplete viewer response');
      }
      return response.data.viewer;
    } catch (error) {
      const status = /\bHTTP (\d{3})\b/.exec(String(error.stderr || ''))?.[1];
      const transient = ['429', '500', '502', '503', '504'].includes(status)
        || ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(error.code);
      if (!transient || attempt >= MAX_ATTEMPTS) {
        // Do not dump queries/response bodies containing private repository names.
        throw new Error(`GitHub stats request failed${status ? ' (HTTP ' + status + ')' : ''} after ${attempt} attempt(s); saved stats were not refreshed`);
      }
      const delay = 1000 * 2 ** (attempt - 1);
      warn(`GitHub stats request temporarily failed (${status || error.code}); retry ${attempt}/${MAX_ATTEMPTS - 1} in ${delay}ms`);
      await wait(delay);
    }
  }
}

async function repositories(gql, connection, args, fields) {
  const nodes = [];
  const cursors = new Set();
  let cursor = null;
  do {
    const after = cursor === null ? '' : ',after:' + JSON.stringify(cursor);
    const page = (await gql(`query{viewer{${connection}(first:${PAGE_SIZE},${args}${after}){nodes{${fields}} pageInfo{hasNextPage endCursor}}}}`))[connection];
    if (!Array.isArray(page?.nodes) || !page.pageInfo || page.nodes.some(n => !n)) {
      throw new Error(`Incomplete ${connection} page; saved stats were not refreshed`);
    }
    nodes.push(...page.nodes);
    if (page.pageInfo.hasNextPage === false) break;
    cursor = page.pageInfo.endCursor;
    if (page.pageInfo.hasNextPage !== true || !cursor || cursors.has(cursor)) {
      throw new Error(`Invalid ${connection} pagination; saved stats were not refreshed`);
    }
    cursors.add(cursor);
  } while (true);
  return nodes;
}

export async function fetchProfileStats(previous, { gql = graphql, now = new Date() } = {}) {
  const me = await gql('query{viewer{id createdAt pullRequests{totalCount} issues{totalCount} contributionsCollection{contributionYears}}}');
  const yearsQ = me.contributionsCollection.contributionYears.map(y => 'y' + y + ':contributionsCollection(from:"' + y + '-01-01T00:00:00Z",to:"' + y + '-12-31T23:59:59Z"){contributionCalendar{totalContributions}}').join(' ');
  const yrs = await gql('query{viewer{' + yearsQ + '}}');
  const hist = 'defaultBranchRef{target{... on Commit{history(author:{id:' + JSON.stringify(me.id) + '}){totalCount}}}}';
  const repos = await repositories(gql, 'repositories', 'ownerAffiliations:[OWNER,COLLABORATOR,ORGANIZATION_MEMBER]',
    'nameWithOwner owner{login} isFork ' + hist + ' languages(first:10,orderBy:{field:SIZE,direction:DESC}){edges{size node{name color}}}');
  const contributed = await repositories(gql, 'repositoriesContributedTo',
    'includeUserRepositories:false,contributionTypes:[COMMIT,PULL_REQUEST,ISSUE,REPOSITORY]', 'nameWithOwner ' + hist);
  const commits = new Map();
  for (const n of [...repos, ...contributed]) commits.set(n.nameWithOwner, n.defaultBranchRef?.target?.history?.totalCount || 0);
  const own = repos.filter(n => n.owner.login === previous.login);
  const others = new Set([...commits.entries()].filter(([k, v]) => !k.startsWith(previous.login + '/') && v > 0).map(([k]) => k));
  const langs = {};
  for (const n of own) if (!n.isFork) for (const e of n.languages.edges) {
    langs[e.node.name] ??= { size: 0, color: e.node.color };
    langs[e.node.name].size += e.size;
  }
  const perYear = Object.fromEntries(Object.entries(yrs).map(([k, v]) => [k.slice(1), v.contributionCalendar.totalContributions]).sort());
  return { ...previous, generatedAt: now.toISOString().slice(0, 10),
    totals: { commits: [...commits.values()].reduce((a, b) => a + b, 0), pullRequests: me.pullRequests.totalCount, issues: me.issues.totalCount,
      contributions: Object.values(perYear).reduce((a, b) => a + b, 0), ownRepos: own.length, contributedTo: others.size, yearContributions: perYear[String(now.getUTCFullYear())] || 0 },
    perYear, languages: Object.entries(langs).sort((a, b) => b[1].size - a[1].size).map(([name, v]) => ({ name, ...v })) };
}
