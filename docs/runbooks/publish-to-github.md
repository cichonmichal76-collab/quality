# Publish Changes To GitHub

This runbook describes the current practical publication flow for the repository.

## Current repository state

The repository is published at:

[cichonmichal76-collab/Quality](https://github.com/cichonmichal76-collab/Quality)

The local repository currently tracks:

```text
origin -> https://github.com/cichonmichal76-collab/Quality.git
```

The default branch in use is `main`.

## Recommended workflow

1. make changes in a clean local branch or clean local `main`
2. run relevant tests and checks
3. inspect the diff
4. commit with a focused message
5. push to GitHub
6. verify remote state

## Minimal local commands

Inspect local state:

```bash
git status -sb
git log --oneline --decorate -5
git remote -v
```

Commit changes:

```bash
git add <paths>
git commit -m "short-message"
```

Push to the tracked remote branch:

```bash
git push
```

## First push or remote setup

If the repository has no remote yet:

```bash
git remote add origin https://github.com/cichonmichal76-collab/Quality.git
git branch -M main
git push -u origin main
```

## What to verify before pushing

- working tree is clean apart from intentional changes
- migrations are included when schema changed
- docs and code match each other
- commit message describes one coherent unit of work
- branch target is the one you actually intend to update

## Suggested publishing habits

- prefer small, reviewable commits over one large batch
- keep code, docs, and migrations in sync
- avoid pushing broken lint or typing even if CI is currently permissive
- do not rewrite shared history unless there is a specific reason

## Current environment note

In the environment used for this repository work, `gh` may not be installed. The repository can still be published normally through plain `git` commands.

That means this is a valid and supported flow here:

```bash
git commit -m "message"
git push
```

## Post-push verification

After pushing, check:

- `git status -sb`
- `git log --oneline --decorate -2`
- the GitHub repo page for the latest commit on `main`

## Safe failure recovery

If push fails because remote moved:

1. stop
2. fetch latest changes
3. inspect divergence
4. rebase or merge deliberately
5. rerun checks if needed
6. push again

If push fails because of credentials:

1. verify remote URL
2. verify local git credential setup
3. retry after auth is fixed

## What not to do

- do not use destructive history rewrites casually on shared work
- do not push schema changes without migrations
- do not assume CI will catch every local issue
