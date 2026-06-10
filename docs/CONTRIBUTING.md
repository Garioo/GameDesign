# Contributing & Git Rules

These rules exist so that several people can work on EMBERWICK at once **without stepping on each
other or creating merge conflicts**. Read this before you push.

The repo is at https://github.com/Garioo/GameDesign. We use a **feature-branch + pull-request**
workflow. The short version:

> Never commit directly to `main`. Branch → work small → sync often → open a PR → merge.

## The rules

### 1. Never push directly to `main`

`main` is always deployable. Every change lands through a pull request, never a direct push.

### 2. One branch per task, named by type

Create a fresh branch off the latest `main` for each piece of work:

| Prefix     | Use for                       | Example                        |
| ---------- | ----------------------------- | ------------------------------ |
| `feature/` | new functionality             | `feature/page-comments`        |
| `fix/`     | bug fixes                     | `fix/sidebar-reorder-crash`    |
| `docs/`    | documentation only            | `docs/onboarding-guide`        |

### 3. Keep branches small and short-lived

Merge a branch within a day or two. Small diffs conflict far less than large, long-running ones.
If a task is big, split it into several small PRs.

### 4. Sync before you start and before you push

```bash
# Start fresh from the latest main
git checkout main
git pull
git checkout -b feature/my-task

# ...work, commit...

# Before opening/updating the PR, replay your work on top of the latest main
git fetch origin
git rebase origin/main
```

We use **rebase** to keep history linear. (If you and your reviewer prefer merge instead, agree on
one convention for a branch and stick to it.)

### 5. Pull/rebase `main` frequently while a branch is open

Don't let a branch drift for days. Rebase onto `origin/main` regularly — especially right before
opening the PR — so conflicts are small and caught early.

### 6. Coordinate on hot files

A few files are touched by almost every change. If two people rewrite them at once, conflicts are
painful. Give a heads-up (Slack/PR) before large edits to:

- `app/globals.css` — global styles and design tokens
- `app/doc/data.ts` — domain types and seed data
- `supabase/schema.sql` — database schema

Prefer additive changes (append a rule / a field) over reshuffling existing content.

### 7. One PR = one logical change

Don't bundle unrelated work into a single PR. Smaller, focused PRs are faster to review and easier
to revert.

### 8. PR checklist

Before requesting review, confirm:

- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] Branch is rebased on the latest `origin/main`
- [ ] PR description explains **what** changed and **why**
- [ ] A reviewer is requested

### 9. Resolving conflicts

```bash
git fetch origin
git rebase origin/main
# fix conflicts in your editor, then:
git add <files>
git rebase --continue
npm run lint && npm run build
git push --force-with-lease
```

Always use `--force-with-lease` (never plain `--force`) — it refuses to overwrite work you haven't
seen.

### 10. Commit messages

Short, imperative subject line that says what the commit does:

```
Add page comments panel
Fix crash when reordering empty section
```

Reference the related task/issue where relevant.

## Recommended: protect `main` on GitHub

This is a one-time setup for the repo owner (**@Garioo**) — it can't be done from the codebase.
In **GitHub → Settings → Branches → Branch protection rules**, add a rule for `main`:

- Require a pull request before merging (with at least 1 approval)
- Require status checks to pass (lint / build) before merging
- Do not allow direct pushes / require branches to be up to date before merging

This enforces the rules above automatically instead of relying on everyone remembering them.
