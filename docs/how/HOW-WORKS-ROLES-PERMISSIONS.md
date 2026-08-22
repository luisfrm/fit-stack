# Roles y permisos del personal

FitStack separa quién opera el negocio de quién imparte servicios, con permisos claros por rol.

## Los 5 roles de tu organización

| Rol | Qué puede hacer |
|---|---|
| **Dueño** (owner) | Control total: gestiona personal, configuración y puede eliminar registros. Único que puede asignar el rol Dueño |
| **Gerente** | Casi todo: miembros, personal, suscripciones, clases, contenido web y configuración. No puede eliminar registros ni crear Dueños |
| **Cajero** | Operación diaria: registra miembros, cobra pagos, maneja suscripciones y gestiona clases. No gestiona el personal; de la configuración solo consulta (no edita) |
| **Entrenador** | Gestiona las clases existentes y consulta los planes. Sin acceso a pagos ni datos sensibles de miembros |
| **Miembro** | Tu cliente: solo accede al Portal con sus propios datos |

## Acceso al panel administrativo

Solo **Dueño**, **Gerente** y **Cajero** entran al panel. Entrenadores y miembros no.

## Regla anti-escalada

Nadie puede otorgar un rol superior al suyo:

- El gerente no puede crear otro dueño.
- El cajero solo puede registrar miembros.
- Solo el dueño asigna dueños.

Así evitas que alguien amplíe sus propios permisos por error o mala intención.

## Cómo se asignan roles

El Dueño (o el Gerente, excepto para el rol Dueño) invita al personal por email desde la sección de Personal:

1. Ingresa nombre y email del colaborador.
2. Selecciona el rol correspondiente.
3. La persona recibe un enlace de invitación para crear su cuenta.

Los entrenadores además pueden tener perfil público (especialidades, biografía, foto) visible en tu sitio web — lo activas en la sección Entrenadores.

## Roles de plataforma FitStack

Por transparencia: FitStack administra la plataforma con sus propios roles internos (administradores con gestión completa y soporte con solo lectura). Son independientes de los roles de tu gimnasio y no afectan tu operación diaria.

Temas relacionados: [Membresías y pagos](HOW-WORKS-MEMBERSHIPS.md)
