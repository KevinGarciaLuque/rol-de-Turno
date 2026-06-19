import { Platform } from 'react-native';
import {
  SHIFT_TYPES, getShift, MONTHS_ES, DAYS_ES, CATEGORY_LABELS,
} from '../constants/shifts';

// Orden y cargos de la cadena de firmas (debe coincidir con el backend)
const SIGN_ORDER = ['jefe_area', 'jefe_servicio', 'coordinacion', 'subcoordinacion', 'direccion'];
const SIGN_TITLES = {
  jefe_area:       'Jefe de Área',
  jefe_servicio:   'Jefe de Servicio',
  coordinacion:    'Coordinación General de Enfermería',
  subcoordinacion: 'Sub Coordinación General de Enfermería',
  direccion:       'Dirección de Gestión Clínica',
};

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/**
 * Construye el HTML del rol de turno con el formato oficial del HMEP.
 * @param {object} p
 * @param {object} p.dept           departamento { name, supervisor, area_chief }
 * @param {number} p.year
 * @param {number} p.month          1-12
 * @param {Array}  p.employees      empleadas a imprimir (ya filtradas)
 * @param {object} p.matrix         { [empId]: { [day]: code } }
 * @param {object} p.dailyCounts    { [day]: { A,B,C,L } }
 * @param {object} p.employeeTotals { [empId]: { A,B,C,L } }
 * @param {string} p.puesto         etiqueta del Puesto de Trabajo
 */
// Tamaños de papel (horizontal). Oficio ≈ 8.5x13", Legal 8.5x14", Carta 8.5x11".
const PAGE_SIZES = {
  carta:  '279mm 216mm',
  legal:  '356mm 216mm',
  oficio: '330mm 216mm',
};

export function buildScheduleHtml({ dept, year, month, employees, matrix, dailyCounts, employeeTotals, puesto, approvals, paperSize }) {
  const pageSize = PAGE_SIZES[paperSize] || PAGE_SIZES.oficio;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isWeekend = (d) => {
    const dow = new Date(year, month - 1, d).getDay();
    return dow === 0 || dow === 6;
  };

  // Separar por rol: jefe de sala, rotativas y servicio social (bloque aparte).
  const jefes      = employees.filter(e => e.role === 'jefe_sala');
  const rotativas  = employees.filter(e => e.role !== 'jefe_sala' && e.category !== 'servicio_social');
  const social     = employees.filter(e => e.category === 'servicio_social');

  // --- Cabecera de días (L M M J V S D) + números de fecha ---
  const dayLettersRow = days.map(d => {
    const dow = new Date(year, month - 1, d).getDay();
    return `<th class="day ${isWeekend(d) ? 'wknd' : ''}">${DAYS_ES[dow]}</th>`;
  }).join('');

  const dayNumbersRow = days.map(d =>
    `<th class="day ${isWeekend(d) ? 'wknd' : ''}">${d}</th>`
  ).join('');

  // --- Una fila de empleada ---
  function empRow(emp, idx) {
    const t = employeeTotals[emp.id] || {};
    const cells = days.map(d => {
      const code = matrix[emp.id]?.[d] || 'L';
      const sh = getShift(code);
      const wk = isWeekend(d) ? 'wknd' : '';
      return `<td class="cell ${wk}" style="background:${sh.color};color:${sh.textColor}">${esc(sh.label)}</td>`;
    }).join('');
    return `
      <tr class="emp">
        <td class="num">${idx}</td>
        <td class="clave">${esc(emp.clave || '')}</td>
        <td class="name">${esc(emp.name)}</td>
        ${cells}
        <td class="tot tA">${t.A || 0}</td>
        <td class="tot tB">${t.B || 0}</td>
        <td class="tot tC">${t.C || 0}</td>
        <td class="tot tL">${t.L || 0}</td>
        <td class="obs">${esc(emp.observations || '')}</td>
      </tr>`;
  }

  // --- Banda de sección ---
  function bandRow(label) {
    return `<tr class="band"><td colspan="${3 + daysInMonth + 5}">${esc(label)}</td></tr>`;
  }

  // --- Filas de conteo diario TA / TB / TC ---
  function countRow(letter, key, cls) {
    const cells = days.map(d =>
      `<td class="cnt ${cls} ${isWeekend(d) ? 'wknd' : ''}">${dailyCounts[d]?.[key] ?? 0}</td>`
    ).join('');
    return `
      <tr class="countrow">
        <td colspan="3" class="cntlabel">T${letter}</td>
        ${cells}
        <td colspan="5"></td>
      </tr>`;
  }

  let bodyRows = '';
  let n = 0;
  if (jefes.length) {
    bodyRows += bandRow('JEFE DE SALA');
    jefes.forEach(e => bodyRows += empRow(e, ++n));
  }
  if (rotativas.length) {
    bodyRows += bandRow('ENFERMERAS ROTATORIAS');
    rotativas.forEach(e => bodyRows += empRow(e, ++n));
  }

  // Bloque servicio social (tabla aparte, mismo ancho)
  let socialBlock = '';
  if (social.length) {
    let sn = 0;
    const rows = social.map(e => empRow(e, ++sn)).join('');
    socialBlock = `
      <table class="grid">
        <tr class="band sub"><td colspan="${3 + daysInMonth + 5}">LICENCIADAS(OS) EN SERVICIO SOCIAL</td></tr>
        ${rows}
      </table>`;
  }

  // --- Firmas (de la cadena de aprobación; estampa la imagen de quien ya firmó) ---
  const byPos = {};
  (approvals || []).forEach(a => { byPos[a.position] = a; });
  const titleFor = (pos) => {
    if (pos === 'jefe_area')     return `Jefe de ${dept?.name || 'Área'}`;
    if (pos === 'jefe_servicio') return `Jefe de Servicio${dept?.name ? ' ' + dept.name : ''}`;
    return SIGN_TITLES[pos];
  };
  const signHtml = SIGN_ORDER.map(pos => {
    const a = byPos[pos];
    const stamp = a && a.signature && a.signature.startsWith('data:image')
      ? `<img class="sigimg" src="${a.signature}">`
      : (a ? `<div class="sigok">✓ Firmado</div>` : `<div class="sigimg"></div>`);
    return `
      <div class="sign">
        ${stamp}
        <div class="signline"></div>
        <div class="signname">${esc(a?.user_name || '')}</div>
        <div class="signtitle">${esc(titleFor(pos))}</div>
        ${a ? `<div class="signdate">${esc(fmtDate(a.created_at))}</div>` : ''}
      </div>`;
  }).join('');

  // --- Leyenda ---
  const legend = [
    { mark: 'ring',  color: '#1565C0', label: 'CAMBIO' },
    { mark: 'ring',  color: '#E65100', label: 'CONVENIO' },
    { mark: 'ring',  color: '#B71C1C', label: 'INCAPACIDAD' },
    { mark: 'ring',  color: '#000000', label: 'INASISTENCIA' },
    { mark: 'text',  color: '#F57F17', label: 'TC = TURNO COMPENSATORIO' },
    { mark: 'fill',  color: '#E65100', label: 'CUBRE HEMODIÁLISIS' },
  ].map(l => {
    const m = l.mark === 'fill'
      ? `<span class="lg-fill" style="background:${l.color}"></span>`
      : l.mark === 'ring'
        ? `<span class="lg-ring" style="border-color:${l.color}"></span>`
        : `<span class="lg-text" style="color:${l.color}">TC</span>`;
    return `<div class="lgitem">${m}<span>${esc(l.label)}</span></div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Rol de Turno · ${esc(dept?.name)} · ${esc(MONTHS_ES[month - 1])} ${year}</title>
<style>
  @page { size: ${pageSize}; margin: 6mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; }

  /* ===== Encabezado ===== */
  .head { display: flex; align-items: stretch; border: 1.5px solid #000; }
  .logo {
    width: 150px; display: flex; align-items: center; justify-content: center;
    border: 1px dashed #999; color: #999; font-size: 9px; text-align: center;
    margin: 6px; padding: 4px;
  }
  /* Para colocar logos reales: reemplazar el texto por <img src="..."> */
  .headcenter { flex: 1; padding: 6px 10px; }
  .title { text-align: center; font-weight: 800; font-size: 15px; line-height: 1.2; }
  .subtitle { text-align: center; font-weight: 700; font-size: 12px; margin-bottom: 6px; }
  .meta { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 2px 8px; font-size: 11px; }
  .meta b { font-weight: 700; }
  .meta .v { border-bottom: 1px solid #000; font-weight: 700; text-align: center; }

  /* ===== Rejilla ===== */
  .grid { border-collapse: collapse; width: 100%; margin-top: 4px; table-layout: fixed; }
  .grid th, .grid td { border: 0.5px solid #999; text-align: center; font-size: 8px; padding: 0; height: 16px; }
  .grid .day { background: #BBDEFB; font-weight: 700; width: 16px; }
  .grid .wknd { color: #B71C1C; }
  td.wknd, th.wknd { background: rgba(255,205,210,0.35); }
  .grid .corner { background: #BBDEFB; font-weight: 700; }
  .grid .num   { width: 16px; }
  .grid .clave { width: 38px; font-size: 7px; }
  .grid .name  { width: 130px; text-align: left; padding-left: 3px; font-size: 8px; font-weight: 600; white-space: normal; word-break: break-word; line-height: 1.05; }
  .grid .cell  { font-weight: 700; }
  .grid .tot   { width: 16px; font-weight: 700; }
  .grid .tA { background:#E8F5E9; } .grid .tB { background:#E3F2FD; }
  .grid .tC { background:#F3E5F5; } .grid .tL { background:#FAFAFA; }
  .grid .obs { width: 120px; text-align: left; padding-left: 3px; font-size: 7px; color: #B71C1C; white-space: normal; word-break: break-word; line-height: 1.05; }
  .grid .totals-head { background:#90CAF9; font-weight:800; }
  .grid .pago { color:#B71C1C; font-weight:700; font-size:8px; }

  tr.band td { background: #1565C0; color: #fff; font-weight: 800; text-align: center; font-size: 10px; height: 18px; }
  tr.band.sub td { background: #455A64; }
  tr.emp .name { color: #111; }

  tr.countrow td { font-weight: 700; height: 15px; }
  .cntlabel { text-align: right; padding-right: 4px; background:#ECEFF1; }
  .cnt.cA { background:#E8F5E9; color:#2E7D32; }
  .cnt.cB { background:#E3F2FD; color:#1565C0; }
  .cnt.cC { background:#F3E5F5; color:#6A1B9A; }

  /* ===== Firmas ===== */
  .signs { display: flex; justify-content: space-between; gap: 12px; margin-top: 24px; padding: 0 10px; align-items: flex-end; }
  .sign { flex: 1; text-align: center; }
  .sigimg { display: block; height: 38px; max-width: 90%; object-fit: contain; margin: 0 auto 1px; }
  .sigok { font-size: 9px; font-weight: 700; color: #2E7D32; height: 38px; display: flex; align-items: flex-end; justify-content: center; }
  .signline { border-top: 1px solid #000; margin: 0 6px 3px; }
  .signname { font-size: 9px; font-weight: 700; }
  .signtitle { font-size: 8px; color: #333; }
  .signdate { font-size: 7px; color: #555; margin-top: 1px; }

  /* ===== Leyenda ===== */
  .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; padding: 6px 10px; border-top: 1px solid #ccc; }
  .lgitem { display: flex; align-items: center; gap: 5px; font-size: 9px; }
  .lg-ring { width: 12px; height: 12px; border-radius: 50%; border: 2px solid; display: inline-block; }
  .lg-fill { width: 18px; height: 12px; display: inline-block; border: 1px solid #555; }
  .lg-text { font-weight: 800; }

  @media screen { body { background:#eceff1; padding: 12px; } .sheet { background:#fff; padding: 10px; max-width: 1500px; margin: 0 auto; box-shadow: 0 1px 6px rgba(0,0,0,.2); } }
</style></head>
<body>
<div class="sheet">

  <!-- LOGOS: reemplazar el contenido de .logo por <img src="ruta-del-logo"> cuando estén listos -->
  <div class="head">
    <div class="logo">LOGO<br>HOSPITAL MARÍA</div>
    <div class="headcenter">
      <div class="title">ROLES DE TURNO</div>
      <div class="subtitle">HOSPITAL MARÍA ESPECIALIDADES PEDIÁTRICAS</div>
      <div class="meta">
        <b>Área:</b><span class="v">${esc((dept?.name || '').toUpperCase())}</span>
        <b>Mes:</b><span class="v">${esc(MONTHS_ES[month - 1].toUpperCase())}</span>
        <b>Jefe Inmediato:</b><span class="v">${esc((dept?.supervisor || '').toUpperCase())}</span>
        <b>Año:</b><span class="v">${year}</span>
        <b>Puesto de Trabajo:</b><span class="v">${esc((puesto || '').toUpperCase())}</span>
        <b></b><span></span>
      </div>
    </div>
    <div class="logo">LOGO<br>SECRETARÍA<br>DE SALUD</div>
  </div>

  <table class="grid">
    <tr>
      <th class="corner" rowspan="2">No.</th>
      <th class="corner" rowspan="2">Clave</th>
      <th class="corner" rowspan="2">Nombre del empleado</th>
      <th class="corner" colspan="${daysInMonth}">Día</th>
      <th class="totals-head" colspan="4">TOTALES</th>
      <th class="corner" rowspan="2">OBSERVACIONES</th>
    </tr>
    <tr>
      ${dayLettersRow}
      <th class="totals-head">A</th><th class="totals-head">B</th>
      <th class="totals-head">C</th><th class="totals-head">L</th>
    </tr>
    <tr>
      <th class="corner" colspan="3">Fecha</th>
      ${dayNumbersRow}
      <th class="pago" colspan="4">PAGO FERIADO</th>
      <th></th>
    </tr>
    ${bodyRows}
    ${countRow('A', 'A', 'cA')}
    ${countRow('B', 'B', 'cB')}
    ${countRow('C', 'C', 'cC')}
  </table>

  ${socialBlock}

  <div class="signs">${signHtml}</div>
  <div class="legend">${legend}</div>
</div>
</body></html>`;
}

/**
 * Determina la etiqueta de "Puesto de Trabajo" según las categorías presentes.
 */
function derivePuesto(employees) {
  const cats = new Set(employees.map(e => e.category));
  if (cats.size === 1) {
    const only = [...cats][0];
    return (CATEGORY_LABELS[only] || only).toUpperCase();
  }
  return 'PERSONAL DE ENFERMERÍA';
}

/**
 * Genera el HTML y lo envía a impresión. En web abre una ventana de impresión;
 * en nativo devuelve el HTML (para usar con expo-print si se agrega luego).
 */
export function printSchedule(params) {
  const puesto = params.puesto || derivePuesto(params.employees || []);
  const html = buildScheduleHtml({ ...params, puesto, paperSize: params.paperSize });

  if (Platform.OS === 'web') {
    const win = window.open('', '_blank');
    if (!win) {
      // Bloqueo de popups: abrir en la misma pestaña no es ideal; avisar.
      return { ok: false, reason: 'popup_blocked', html };
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    // Dar un instante al navegador para renderizar antes de imprimir.
    setTimeout(() => { try { win.print(); } catch (_) {} }, 400);
    return { ok: true, html };
  }

  // Nativo: devolver el HTML; la pantalla decide cómo manejarlo.
  return { ok: false, reason: 'native', html };
}
