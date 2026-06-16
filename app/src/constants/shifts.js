export const SHIFT_TYPES = {
  A:    { label: 'A',    description: 'Turno A (7am-3pm)',       color: '#2E7D32', textColor: '#FFFFFF', isWork: true  },
  B:    { label: 'B',    description: 'Turno B (3pm-11pm)',      color: '#1565C0', textColor: '#FFFFFF', isWork: true  },
  C:    { label: 'C',    description: 'Turno C (11pm-7am)',      color: '#6A1B9A', textColor: '#FFFFFF', isWork: true  },
  L:    { label: 'L',    description: 'Libre',                   color: '#757575', textColor: '#FFFFFF', isWork: false },
  DE:   { label: 'DE',   description: 'Descanso Extra',          color: '#E65100', textColor: '#FFFFFF', isWork: false },
  TC:   { label: 'TC',   description: 'Turno Compensatorio',     color: '#F57F17', textColor: '#000000', isWork: true  },
  FS1:  { label: 'FS¹',  description: 'Feriado Sustituido 1',   color: '#00838F', textColor: '#FFFFFF', isWork: true  },
  FS2:  { label: 'FS²',  description: 'Feriado Sustituido 2',   color: '#00695C', textColor: '#FFFFFF', isWork: true  },
  F11:  { label: 'F1¹',  description: 'Feriado 1 (1er pago)',   color: '#AD1457', textColor: '#FFFFFF', isWork: true  },
  F12:  { label: 'F1²',  description: 'Feriado 1 (2do pago)',   color: '#880E4F', textColor: '#FFFFFF', isWork: true  },
  F141: { label: 'F14¹', description: 'Feriado 14 (1er pago)',  color: '#4527A0', textColor: '#FFFFFF', isWork: true  },
  F142: { label: 'F14²', description: 'Feriado 14 (2do pago)',  color: '#311B92', textColor: '#FFFFFF', isWork: true  },
  FJ1:  { label: 'FJ¹',  description: 'Feriado Judicial 1',     color: '#37474F', textColor: '#FFFFFF', isWork: true  },
  FJ2:  { label: 'FJ²',  description: 'Feriado Judicial 2',     color: '#263238', textColor: '#FFFFFF', isWork: true  },
  FV1:  { label: 'FV¹',  description: 'Feriado Vacacional 1',   color: '#558B2F', textColor: '#FFFFFF', isWork: true  },
  FV2:  { label: 'FV²',  description: 'Feriado Vacacional 2',   color: '#33691E', textColor: '#FFFFFF', isWork: true  },
  VAC:  { label: 'VAC',  description: 'Vacaciones',              color: '#0277BD', textColor: '#FFFFFF', isWork: false },
  DP:   { label: 'DP',   description: 'Descanso Profesional',    color: '#4E342E', textColor: '#FFFFFF', isWork: false },
  INC:  { label: 'INC',  description: 'Incapacidad',             color: '#B71C1C', textColor: '#FFFFFF', isWork: false },
};

export const SHIFT_ORDER = ['A','B','C','L','DE','TC','FS1','FS2','F11','F12','F141','F142','FJ1','FJ2','FV1','FV2','VAC','DP','INC'];

export function getShift(code) {
  return SHIFT_TYPES[code] || { label: code || '?', description: 'Desconocido', color: '#9E9E9E', textColor: '#FFFFFF', isWork: false };
}

export const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const DAYS_ES   = ['D','L','M','M','J','V','S'];

export const CATEGORY_LABELS = {
  licenciada:    'Licenciada en Enfermería',
  auxiliar:      'Auxiliar de Enfermería',
  servicio_social: 'Servicio Social',
  hd_profesional: 'Profesional HD',
  hd_auxiliar:   'Auxiliar HD',
};

export const ROLE_LABELS = {
  jefe_sala:    'Jefe de Sala',
  rotativa:     'Rotativa',
  servicio_social: 'Servicio Social',
};

export const CATEGORY_COLOR = {
  licenciada:    '#1565C0',
  auxiliar:      '#2E7D32',
  servicio_social: '#6A1B9A',
  hd_profesional: '#E65100',
  hd_auxiliar:   '#4E342E',
};
