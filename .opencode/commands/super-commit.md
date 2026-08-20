---
description: Group changes into semantic commits and push
---

Group all current changes into meaningful semantic commits and push the current branch.

Optional context for commit messages: `$ARGUMENTS`

Rules:

- First inspect the full repository state:
    - `git status --short`
    - `git diff --stat`
    - `git diff`
    - `git log --oneline -10`
- Identify related file groups by intent: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, or `config`.
- Create multiple commits when there are independent changes. Do not mix unrelated changes in the same commit.
- Use conventional commit format: `type(scope): description`. Scope examples: `api-worker`, `panel`, `console`, `web`, `database`, `shared`, `auth`, `ui`.
- When `$ARGUMENTS` is not empty, use it as context to craft commit messages, but do not force that text if it does not accurately describe the changes.
- Before committing, check for sensitive or suspicious files (`.env`, `.dev.vars`, tokens, credentials, API keys, secrets). If any appear, **stop and ask**.
- Include new, modified, and deleted files that belong to each group.
- Do not revert existing changes.
- Do not use `--no-verify`.
- Do not amend commits.
- Do not force push.

Flow:
1. Show the proposed commit plan with the files included in each commit.
2. If the grouping is clear, continue. If there is real ambiguity, ask before committing.
3. For each group:
    - Add only the files for that group with `git add <files...>`.
    - Create the commit with a semantic message.
4. Once all commits have been created, run: `git push`
5. When finished, summarize the commits created and the files that were pushed.
