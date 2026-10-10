> **Alcance:** almacenamiento en R2 (bucket único con taxonomía de prefijos por organización) y rutas de lectura/write.
> Fuente: [`AGENTS.md`](../../AGENTS.md).

## File Storage (R2)

Single bucket (`FILES_BUCKET`) with **prefix taxonomy**: the first segment of the key is the organization.

| Key | Write | Read |
| --- | --- | --- |
| `<orgId>/cms/…` | panel (CMS) | **public** (`/api/public/files/*`): it is the site |
| `<orgId>/<folder>/…` (`general`, `members`, `staff`, `trainers`, `receipts`…) | panel / console | **private**: `/api/upload/file` (panel) · `/api/platform/organizations/:orgId/upload/file` (console) |
| `platform/branding/…` | console | **public** (login and emails, without session) |
| `receipts/<org>/<año>/<n>.pdf` · `platform/receipts/<año>/FS-<n>.pdf` | only the renderer (`putFile`) | authenticated receipt routes |

- **Golden rule**: every org-scoped key starts with `<orgId>/` and every write/delete validates that prefix against the organization **resolved on the server** (session in the panel, path in the console). The client never chooses the folder's organization.
- **Sanitized folder**: `safeFolderSegment` (`slugify`) neutralizes `../` and separators, and the extension is cleaned (`getFileExtension`). No client folder can escape the scope.
- **Public by design** = `isPublicStorageKey` (`@workspace/shared`, consumed by the public route and by panel/console `getMediaUrl`). No invented exceptions: if an asset must be visible on the public site, it goes in `cms`.
- **Private assets in the UI**: `getMediaUrl` returns the public URL for public keys and `/api/media?key=…` for private ones (authenticated Next proxy that forwards the cookie to the API). Never an R2 URL guessable from the browser.
- **Structural immutability**: issued receipts live in a namespace that no upload route can reach, and SaaS branding (`platform/receipts/…`) is not reachable from `/api/platform/upload` (fixed scope `platform/branding/`).
