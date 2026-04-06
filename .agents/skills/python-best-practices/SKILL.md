---
name: python-best-practices
description: Best practices for writing clean, idiomatic, and production-ready Python code in the Fit-Stack project. Use this skill when writing, reviewing, or refactoring any Python code — including the Bridge app, scripts, or any future Python service.
---

# Python Best Practices for Fit-Stack

This skill covers the standards and patterns to follow when writing Python in this project. The primary Python app is `apps/bridge`, which uses `uv` as the package manager and `flet` as the UI framework.

---

## 1. Project Environment — Always Use `uv`

- **Run code**: `uv run python <file.py>` — never use a bare `python` command.
- **Add dependencies**: `uv add <package>` — this updates `pyproject.toml` and `uv.lock` atomically.
- **Remove dependencies**: `uv remove <package>`.
- **Sync environment**: `uv sync` — installs exact versions from `uv.lock`.
- **Never activate the venv manually** — `uv run` handles it.
- All dependencies go in `pyproject.toml` under `[project] dependencies`. Do NOT use a `requirements.txt`.

```toml
# pyproject.toml — correct structure
[project]
name = "bridge"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "flet[all]>=0.84.0",
    "python-dotenv>=1.2.2",
]
```

---

## 2. Typing — Use Type Hints Everywhere

- All function signatures MUST have type annotations (parameters and return type).
- Use `from __future__ import annotations` at the top of files targeting Python < 3.10 for deferred evaluation.
- Prefer built-in generics (`list[str]`, `dict[str, int]`) over `typing.List`, `typing.Dict` (Python 3.9+).
- Use `Optional[X]` only when you can't use `X | None` syntax (Python 3.10+).
- **Never use `Any`** — if a type is unknown, use `object` or a proper `TypeVar`.

```python
# ✅ Correct
def add_log(self, name: str, status: str, message: str) -> None:
    ...

def get_member(member_id: int) -> dict[str, object] | None:
    ...

# ❌ Wrong
def add_log(self, name, status, message):
    ...
```

---

## 3. Code Style — Follow PEP 8 + Ruff

- **Formatter**: Use `ruff format` (replaces Black).
- **Linter**: Use `ruff check` — it covers PEP 8, flake8, isort, and more.
- Add `ruff` as a dev dependency: `uv add --dev ruff`.
- Line length: **88 characters** (Ruff/Black default).
- 2 blank lines between top-level definitions, 1 between methods.
- Use `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_SNAKE_CASE` for constants.

```toml
# pyproject.toml — ruff config
[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
```

---

## 4. Error Handling — Be Explicit

- Catch **specific exceptions**, never bare `except:` or `except Exception:` unless you re-raise or log thoroughly.
- Always log errors with enough context to debug them (include the exception and relevant state).
- Use `raise ... from e` when wrapping exceptions to preserve the chain.

```python
# ✅ Correct — specific, logged, chained
try:
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
except requests.Timeout:
    logger.error("Request timed out for URL: %s", url)
except requests.HTTPError as e:
    logger.error("HTTP error %s for URL: %s", e.response.status_code, url)
    raise SyncError("Failed to fetch sync tasks") from e

# ❌ Wrong — swallows all errors silently
try:
    resp = requests.get(url)
except:
    pass
```

---

## 5. Constants and Configuration — Environment Variables

- Define all constants at module level in `UPPER_SNAKE_CASE`.
- Load environment variables via `python-dotenv` and `os.getenv()` with a safe default.
- **Never hardcode secrets** (API keys, passwords) — always use `.env` files referenced via `os.getenv`.
- Provide a `.env.example` file documenting all required variables.

```python
# ✅ Correct pattern
import os
from dotenv import load_dotenv

load_dotenv()

CLOUD_API_URL: str = os.getenv("CLOUD_API_URL", "http://localhost:3000/api")
CLOUD_API_KEY: str = os.getenv("CLOUD_API_KEY", "")
ORGANIZATION_ID: str = os.getenv("ORGANIZATION_ID", "local_org")
```

---

## 6. Classes — Keep Them Focused

- Classes should have **one clear responsibility** (Single Responsibility Principle).
- `__init__` should only assign attributes — no heavy logic, no I/O, no network calls.
- Use `dataclasses` or `pydantic` models for data containers instead of plain dicts.
- Prefer composition over inheritance.

```python
# ✅ Correct — data model
from dataclasses import dataclass

@dataclass
class SyncTask:
    task_id: str
    first_name: str
    last_name: str
    status: str

# ✅ Correct — init only assigns
class AccessBridgeApp:
    def __init__(self, page: ft.Page) -> None:
        self.page = page
        self.running: bool = False
        self._setup_ui()  # delegates complexity elsewhere
```

---

## 7. Threading — Safety Rules

- Use `threading.Thread(daemon=True)` for background tasks so they don't block app shutdown.
- Protect shared mutable state with `threading.Lock()` if multiple threads write to it.
- Flet UI updates from background threads MUST go through `page.update()` — already correct in Bridge.
- Check the running flag **before** doing work in a loop, not just at the `while` condition.

```python
# ✅ Correct — thread-safe state check inside loop
def bg_polling(self) -> None:
    while self.running:
        if not self.running:  # double-check before I/O
            break
        try:
            ...
        finally:
            time.sleep(10)
```

---

## 8. Flet-Specific Rules (Flet ≥ 0.80)

These rules apply to all Flet UI code in `apps/bridge`:

| Deprecated API | Correct API (0.80+) |
|---|---|
| `ft.app(target=fn)` | `ft.run(fn)` |
| `page.window_width` | `page.window.width` |
| `ft.ElevatedButton` | `ft.FilledButton` or `ft.OutlinedButton` |
| `ft.alignment.center` | `ft.Alignment(0, 0)` |
| `ft.padding.all(n)` | `ft.Padding(n, n, n, n)` |
| `ft.padding.symmetric(v, h)` | `ft.Padding(h, v, h, v)` |
| `ft.border.all(...)` | `ft.Border.all(...)` |
| `ft.border.only(...)` | `ft.Border.only(...)` |
| `ft.colors.*` (module) | `ft.Colors.*` (enum) |
| `ft.icons.*` (strings) | `ft.Icons.*` (enum) |
| `weight="bold"` (string) | `ft.FontWeight.BOLD` |

- Store references to controls you need to update later (e.g., `self.status_text`) — do NOT re-query the tree.
- Call `page.update()` only once at the end of a batch of changes, not after each individual control change.

---

## 9. Imports — Ordering and Grouping

Follow the `isort` standard (enforced by `ruff`):
1. Standard library imports
2. Third-party imports
3. Local/project imports

Separate each group with a blank line. Use absolute imports.

```python
# ✅ Correct order
import os
import threading
import time

import flet as ft
import requests
from dotenv import load_dotenv

from bridge.models import SyncTask
```

---

## 10. Logging — Use `logging`, Not `print`

- Replace all `print(...)` calls with `logging` in production code.
- Configure a logger per module: `logger = logging.getLogger(__name__)`.
- Use appropriate levels: `DEBUG` for verbose info, `INFO` for normal flow, `WARNING` for recoverable issues, `ERROR` for failures.

```python
import logging

logger = logging.getLogger(__name__)

# ✅ Correct
logger.error("Error de red en polling: %s", e)
logger.info("Servicio iniciado correctamente")

# ❌ Wrong
print(f"Error de red en polling: {e}")
```

---

## Checklist Before Committing Python Code

Before finalizing any Python file, verify:

- [ ] All functions/methods have type annotations
- [ ] No `Any` types used
- [ ] No bare `except:` clauses
- [ ] No `print()` in non-debug code — use `logging`
- [ ] All env vars loaded via `os.getenv()` with defaults
- [ ] No hardcoded secrets or URLs
- [ ] Flet code uses the ≥0.80 API (see table above)
- [ ] Constants are `UPPER_SNAKE_CASE` at module level
- [ ] File runs cleanly with `uv run python <file.py>`
- [ ] No deprecation warnings in output
