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

// Posiciones en la cadena de aprobación (firmas del rol de turno)
export const APPROVAL_POSITIONS = ['jefe_area', 'jefe_servicio', 'coordinacion', 'subcoordinacion', 'direccion'];

export const APPROVAL_POSITION_LABELS = {
  jefe_area:       'Jefe de Área',
  jefe_servicio:   'Jefe de Servicio',
  coordinacion:    'Coordinación General de Enfermería',
  subcoordinacion: 'Sub Coordinación General de Enfermería',
  direccion:       'Dirección de Gestión Clínica',
};

export const APPROVAL_LEVEL_BY_POSITION = {
  jefe_area: 1, jefe_servicio: 2, coordinacion: 3, subcoordinacion: 4, direccion: 5,
};
