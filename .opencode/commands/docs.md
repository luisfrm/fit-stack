---
description: Evaluates and updates the vault documentation (vaults/) against the repo's real state
agent: docs-writer
---

Evaluate the state of the documentation and update it. Work in **two phases**:

**1. Evaluate** — detect _drift_ between docs and code:

- `git status`, `git diff --stat`, `git log --oneline -10`.
- Walk the `vaults/` vault (architecture, business, ai, guides, backlog, tasks) and contrast it with the code.
- List which documents are out of sync.

**2. Update** (only what is out of sync):

- `vaults/backlog/` — add/tick pending items (index: `vaults/backlog/README.md`).
- `vaults/architecture/ARCHITECTURE.md` — only if a high-level decision changed.
- `vaults/architecture/INFRASTRUCTURE.md` / `terraform.md` — if infrastructure changed.
- `vaults/ai/` — if chat / credits / RAG changed.
- `vaults/guides/FUTURE_IDEAS.md` — future ideas.
- `vaults/tasks/FS-NNNN-*/plan.md` — if a task advanced (do not rewrite closed `task.md`).
- `AGENTS.md` — only if a real convention changed.

**Output language**: your response is in English, but everything written under `vaults/` must be in **Spanish** (vault prose); keep paths, code identifiers and frontmatter keys in English. Use **wiki-links** `[[…]]` inside the vault; never mark as done what is not; paused → `⏸ PAUSADO`. Report the drift found before editing.

Additional context: $ARGUMENTS
