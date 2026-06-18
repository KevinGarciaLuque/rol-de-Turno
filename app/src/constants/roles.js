// Roles de acceso (control de quién entra y qué puede hacer)
export const ACCESS_ROLES = ['admin', 'supervisor', 'jefe', 'lector'];

export const ACCESS_ROLE_LABELS = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  jefe:       'Jefe de Área',
  lector:     'Lector',
};

export const ACCESS_ROLE_DESC = {
  admin:      'Ve y gestiona todo el hospital',
  supervisor: 'Ve y edita sus áreas asignadas',
  jefe:       'Gestiona su propia sala',
  lector:     'Solo visualiza su área',
};

export const ACCESS_ROLE_COLOR = {
  admin:      '#B71C1C',
  supervisor: '#6A1B9A',
  jefe:       '#1565C0',
  lector:     '#757575',
};
