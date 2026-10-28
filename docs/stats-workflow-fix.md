# GitHub stats workflow failure investigation — 2026-10-28

## Evidence

The failing workflow is `.github/workflows/stats.yml` (`Update GitHub stats`).
Run [40673947268](https://github.com/artur-safonov/artur-safonov/actions/runs/40673947268)
had **one** job, `update`, running from 10:40:15 to 10:40:33 UTC (18 seconds).
Checkout and Node setup succeeded. `Refresh profile stats` failed with `gh: HTTP 502`;
the commit step was skipped.

The error came from `scripts/generate.mjs:17`: one GraphQL request combined
`repositories(first:100)` and `repositoriesContributedTo(first:100)`, including
author-filtered default-branch commit histories. There was no retry handling.
The same request failed with HTTP 502 on [October 26, run 40306187529](https://github.com/artur-safonov/artur-safonov/actions/runs/40306187529)
and HTTP 504 on [October 23, run 39931735311](https://github.com/artur-safonov/artur-safonov/actions/runs/39931735311).
These logs establish recurring gateway failures on the large query; they do not
establish GitHub's internal reason for each gateway failure.

The October 28 job's three annotations were:

1. **Failure:** process exited with code 1, caused by the unhandled HTTP 502.
2. **Warning:** checkout v4 and setup-node v4 target Node.js 20 and were forced
   onto the runner's Node.js 24 runtime. This did not fail the setup steps.
3. **Notice:** `ubuntu-latest` is migrating to Ubuntu 26. The failed job actually
   ran on Ubuntu 24.04.5. This was an informational notice.

Local source versions were checked against GitHub before editing:
`scripts/generate.mjs` blob `87dcf266cf4a415b6af24e77315e8aea390a70b1`
matches the failed run; `stats.yml` blob
`b76cea5b9efb763d9c5e16a743a2ee19e165fff2` matches remote main.

## Changes

- Move fetching into `scripts/stats-fetch.mjs`. Read the two repository
  connections separately and sequentially, using pages of 10 and `pageInfo`
  cursors until completion. This reduces each history query's workload and
  removes the old silent limit of 100 repositories per connection.
- Retry transient HTTP 429/500/502/503/504 and selected transport failures up
  to four total attempts, waiting 1, 2, then 4 seconds. Each subprocess has a
  60-second timeout. Permanent HTTP errors are not retried.
- Reject GraphQL errors/partial responses and malformed pagination instead of
  publishing a partially collected result. Keep the existing commit
  deduplication, owned/fork filtering, and metric definitions.
- Preserve saved JSON/SVG on collection failure. Report a concise failure
  without dumping raw queries or response bodies containing private names.
- Use pinned v5 releases of official checkout and setup-node, verified from
  their `action.yml` files to use Node.js 24. Keep the generator on Node.js 22.
  Pin the runner to Ubuntu 24.04, the image family used by the failed job.
- Run the new offline regression tests before fetching stats in the workflow.

Official action sources checked:
[checkout](https://github.com/actions/checkout/blob/fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09/action.yml),
[setup-node](https://github.com/actions/setup-node/blob/a0853c24544627f65ddf259abe73b1d18a591444/action.yml).

## Verification

All completed successfully on October 28, 2026:

- `node --test tests/stats.test.mjs`: **25 passed**. Covers transient recovery,
  retry exhaustion/backoff, permanent errors, invalid JSON/partial GraphQL,
  pagination beyond 100 repositories, duplicate commit accounting, empty
  branches/connections, stalled cursors, and later-page failure. Real generator
  CLI tests in disposable copies cover failure, unchanged stats, and changed stats.
- `python -m unittest discover -s tests -p test_ai_rhythm.py -q`: **4 passed**.
- `node --check` for the generator, fetching module and new tests.
- Workflow YAML parsing and assertions for triggers, permissions, runner and
  test step; `bash -n` for every workflow run block.
- Cached rendering in a temporary copy: **8 SVGs** parsed as valid XML and
  matched tracked assets byte for byte.
- **Live read-only GraphQL check** of `fetchProfileStats`: completed successfully,
  collecting 74 owned repositories, 12 other repositories with commits, and
  10 contribution years. Only aggregate counts were printed; no results were
  written to profile files. This used the local authenticated CLI, not the
  Actions `STATS_TOKEN` secret.
- `git diff --check`: clean.

Local JavaScript checks used Node.js **24.14.1**; the hosted Node.js 22 runner
was not executed as part of verification. No workflow was manually dispatched
or re-run, and no repository secrets were changed. The stats workflow will use
the fix on its next scheduled run after publication to the default branch.
