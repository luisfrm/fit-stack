# Roles y permisos del personal

FitStack separa quién opera el negocio de quién imparte clases. Cada persona ve solo lo que necesita para su trabajo y nadie puede darse permisos que no tiene.

## Los cinco roles de tu gimnasio

| Rol | Qué puede hacer | Qué no puede hacer |
|---|---|---|
| **Dueño** | Control total: personal y entrenadores, configuración, crear y eliminar registros, precios de planes | Nada restringido; es el único que puede nombrar a otro Dueño |
| **Gerente** | Casi todo: miembros, membresías, pagos, clases, entrenadores, página web y configuración | No elimina registros ni nombra Dueños |
| **Cajero** | Operación diaria: registra miembros, cobra, crea y renueva membresías, gestiona clases | No gestiona personal ni entrenadores; de la configuración solo consulta |
| **Entrenador** | Ve sus clases asignadas, la ficha de sus alumnos y los planes; edita el contenido de sus clases | Sin acceso a pagos, membresías, personal ni configuración; no entra al panel |
| **Miembro** | Tu cliente: consulta su plan y su progreso en el Portal de Miembros | Sin acceso al panel |

Solo Dueño, Gerente y Cajero entran al panel administrativo con usuario y contraseña. Entrenadores y Miembros usan el Portal de Miembros.

## Acceso al panel

- Un Cajero que abre Configuración la ve en modo lectura.
- Un Entrenador que intenta abrir el panel es enviado a la pantalla de No autorizado.
- Cada gimnasio entra en su propio dominio de panel.

## Nadie escala permisos

Nadie puede dar un rol superior al suyo. La regla se aplica en el servidor, no solo en la pantalla:

- El **Dueño** puede asignar cualquier rol, incluido otro Dueño.
- El **Gerente** puede asignar Gerente, Cajero, Entrenador y Miembro, nunca Dueño.
- El **Cajero** solo puede registrar Miembros.

Aunque alguien llame directamente al sistema por fuera de la pantalla, el intento se rechaza.

## Invitaciones

1. El Dueño o el Gerente entra a Panel → Personal, completa nombre, correo y rol.
2. El sistema crea la ficha y envía una invitación por correo para crear la contraseña. La invitación vence y se puede reenviar.
3. Al aceptar, la persona queda vinculada a tu gimnasio con ese rol. Si es Entrenador, además puedes activar su perfil público con especialidades, biografía y foto para que aparezca en tu sitio web.

## Roles internos de FitStack

El equipo de FitStack administra la plataforma desde su propia consola con roles internos (administración y soporte de solo lectura). Son independientes de los roles de tu gimnasio, no cambian tu operación y no tocan tus datos salvo para darte soporte.

Si preguntan quién puede cobrar o registrar membresías, eso está en cómo funcionan las membresías.
