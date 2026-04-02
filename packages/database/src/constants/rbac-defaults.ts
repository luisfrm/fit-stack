/**
 * 🔐 Definiciones Globales de RBAC (Roles & Permissions)
 * 
 * Este archivo es la fuente de verdad para los permisos y roles básicos del sistema.
 * Se utiliza tanto en el script de 'seed' de la base de datos como en los servicios de la API.
 */

export const DEFAULT_PERMISSIONS = [
  { name: 'Acceso al CMS', slug: 'cms:access', description: 'Permite entrar al panel de administración' },
  { name: 'Ver Miembros', slug: 'members:read', description: 'Ver la lista de miembros' },
  { name: 'Gestionar Miembros', slug: 'members:write', description: 'Crear, editar y reenviar invitaciones' },
  { name: 'Eliminar Miembros', slug: 'members:delete', description: 'Borrar registros de miembros permanentemente' },
  { name: 'Gestionar Planes', slug: 'plans:manage', description: 'Crear y editar planes de membresía' },
  { name: 'Ver Pagos', slug: 'payments:read', description: 'Ver historial de facturación y pagos' },
  { name: 'Gestionar Clases', slug: 'classes:manage', description: 'Administrar el horario y disponibilidad de clases' },
  { name: 'Gestionar Entrenadores', slug: 'trainers:manage', description: 'Administrar el staff de entrenadores' },
  { name: 'Editar Contenido Web', slug: 'content:edit', description: 'Modificar bloques, textos e imágenes de la web pública' },
  { name: 'Configuración General', slug: 'settings.general:manage', description: 'Gestionar identidad, colores y ajustes del gym' },
  { name: 'Gestionar Roles', slug: 'settings.roles:manage', description: 'Administrar roles y permisos del sistema' },
];

export const DEFAULT_ROLES = [
  {
    name: 'admin',
    description: 'Administrador total del sistema con acceso a todo',
    permissions: DEFAULT_PERMISSIONS.map(p => p.slug),
  },
  {
    name: 'manager',
    description: 'Gestor del gimnasio y contenidos con permisos operativos',
    permissions: [
      'cms:access', 
      'members:read', 
      'members:write', 
      'plans:manage', 
      'payments:read', 
      'classes:manage', 
      'trainers:manage', 
      'content:edit',
      'settings.general:manage'
    ],
  },
  {
    name: 'trainer',
    description: 'Entrenador con acceso a gestión de clases y visualización de miembros',
    permissions: [
      'cms:access', 
      'members:read', 
      'classes:manage'
    ],
  },
  {
    name: 'client',
    description: 'Miembro del gimnasio con acceso limitado a su propio perfil y rutinas',
    permissions: [],
  }
];
