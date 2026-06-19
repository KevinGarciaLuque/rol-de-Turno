// Cadena de aprobación del rol de turno (orden de firmas).
// Niveles 1-2 son por área (dependen del departamento); 3-5 son globales del hospital.
const CHAIN = [
  { level: 1, position: 'jefe_area',       label: 'Jefe de Área',                           scope: 'department' },
  { level: 2, position: 'jefe_servicio',   label: 'Jefe de Servicio',                       scope: 'department' },
  { level: 3, position: 'coordinacion',    label: 'Coordinación General de Enfermería',     scope: 'global' },
  { level: 4, position: 'subcoordinacion', label: 'Sub Coordinación General de Enfermería', scope: 'global' },
  { level: 5, position: 'direccion',       label: 'Dirección de Gestión Clínica',           scope: 'global' },
];

const MAX_LEVEL = CHAIN.length;

const stepByLevel    = (level) => CHAIN.find(c => c.level === level) || null;
const stepByPosition = (pos)   => CHAIN.find(c => c.position === pos) || null;
const labelForLevel  = (level) => stepByLevel(level)?.label || `Nivel ${level}`;
const POSITIONS      = CHAIN.map(c => c.position);

module.exports = { CHAIN, MAX_LEVEL, stepByLevel, stepByPosition, labelForLevel, POSITIONS };
