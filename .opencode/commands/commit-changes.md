---
description: Commit current changes in semantic units
---

Commitea todos los cambios realizados en el proyecto en commits semanticós.

Usa `git status`, `git diff` para identificar los cambios.

Crea commits separados para cambios relacionados, usando Conventional Commits:

- `feat:` características nuevas
- `fix:` corrección de errores
- `docs:` documentación
- `chore:` tareas de mantenimiento
- `refactor:` refactorización
- `test:` pruebas

Si tenemos una tarea asignada, el mensaje debe incluir el ID de la tarea, por ejemplo: `feat: RD-[id] add health check endpoint`

Incluye todos los archivos modificados, nuevos y eliminados.

No uses `amend` ni `force-push`.

Luego haz `git push`.