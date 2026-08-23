# Roles y permisos del personal

FitStack separa quién opera el negocio de quién imparte clases, con permisos claros por rol. Cada persona ve solo lo que necesita para su trabajo y no puede escalar sus propios privilegios.

## Los 5 roles de tu organización

| Rol | Qué puede hacer en el panel | Qué no puede hacer |
|---|---|---|
| **Dueño** (owner) | Control total: gestiona personal y entrenadores, ve y edita toda la configuración, crea y elimina registros, cambia precios de planes | Nada restringido; es el único que puede asignar el rol Dueño a otro |
| **Gerente** (manager) | Casi todo: gestiona miembros, suscripciones, pagos, clases, entrenadores, contenido web y configuración. Crea personal excepto Dueños | No puede eliminar registros de forma definitiva ni crear otro Dueño |
| **Cajero** (cashier) | Operación diaria: registra miembros, cobra pagos, crea y renueva suscripciones, gestiona clases y entrenadores | No gestiona el personal; de la configuración solo consulta, no edita. No ve reportes sensibles si el Dueño los restringe |
| **Entrenador** (coach) | Consulta sus clases asignadas, ve fichas de sus alumnos, gestiona contenido de clases existentes y consulta planes | Sin acceso a pagos, membresías, personal ni configuración. No entra al panel administrativo |
| **Miembro** (member) | Tu cliente: consulta su plan vigente y progreso en el Portal de Miembros | Sin acceso al panel |

Todos los roles excepto Miembro pueden existir como ficha en el panel, pero solo Dueño, Gerente y Cajero entran al panel con usuario y contraseña.

## Acceso al panel administrativo

Solo **Dueño, Gerente y Cajero** pueden iniciar sesión en el panel administrativo, en el dominio configurado para tu organización. Entrenadores y Miembros usan el Portal de Miembros (app separada) y no ven el panel aunque tengan ficha.

Si un Cajero intenta abrir Configuración solo verá lectura. Si un Entrenador intenta abrir el panel, será redirigido a No autorizado.

## Regla anti-escalada de privilegios

Nadie puede otorgar un rol superior al suyo. Es una regla de seguridad a nivel de API, no solo de interfaz:

- El Dueño puede asignar cualquier rol, incluido otro Dueño.
- El Gerente puede asignar Gerente, Cajero, Entrenador y Miembro, pero nunca Dueño.
- El Cajero solo puede registrar Miembros.
- El sistema rechaza con 403 cualquier intento de escalar por fuera de estas reglas, aunque se llame directo a la API.

Así evitas que alguien amplíe sus propios permisos por error o mala intención.

## Cómo se asignan y aceptan roles

1. El Dueño o el Gerente (excepto para rol Dueño) entra a Panel, Personal, Nuevo miembro, completa nombre y email y elige el rol.
2. El sistema crea la ficha y envía un email con un enlace de invitación para crear contraseña. La invitación expira y puede reenviarse.
3. Al aceptar, la persona queda vinculada a tu organización con ese rol. Si la invitación es para Entrenador, además puedes activar su perfil público con especialidades, biografía y foto desde la sección Entrenadores para que aparezca en tu sitio web.

## Roles de plataforma FitStack

Por transparencia: el equipo FitStack administra la plataforma SaaS con sus propios roles internos (owner, admin y support con solo lectura) desde la Consola. Son independientes de los roles de tu gimnasio, no afectan tu operación diaria y no tienen acceso a tus datos operativos salvo para soporte.

Si preguntan quién puede registrar cobros o suscripciones dentro del flujo comercial, ese detalle está en cómo funcionan las membresías, renovaciones y pagos.
