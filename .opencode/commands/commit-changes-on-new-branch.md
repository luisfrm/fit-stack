---
description: Commit current changes in semantic units in a new branch
---

Commitea todos los cambios realizados en el proyecto en commits semanticós en una nueva rama con un nombre acorde a su tarea o al feature trabajado.

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