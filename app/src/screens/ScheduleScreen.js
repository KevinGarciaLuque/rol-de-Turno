import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Alert,
} from 'react-native';
import { Surface, Chip, IconButton, Snackbar, Button, Modal, Portal, TextInput, Switch } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { getShift, MONTHS_ES, DAYS_ES, CATEGORY_COLOR, CATEGORY_LABELS } from '../constants/shifts';
import { APPROVAL_POSITION_LABELS } from '../constants/roles';
import { COLORS } from '../constants/theme';
import ShiftCell from '../components/ShiftCell';
import ShiftPicker from '../components/ShiftPicker';
import AreaStaffManager from '../components/AreaStaffManager';
import ApprovalProgress from '../components/ApprovalProgress';
import { printSchedule } from '../utils/printSchedule';
import { useAuth } from '../context/AuthContext';
import { useShifts } from '../context/ShiftsContext';

const CELL_W = 30;
const CELL_H = 28;
const NAME_W = 160;
const ROW_H  = 36;

const WORK_CODES = ['A','B','C','TC','FS1','FS2','F11','F12','F141','F142','FJ1','FJ2','FV1','FV2'];

// Recalcula los totales (conteo diario y totales por empleada) en la app,
// igual que lo hace el servidor, para reflejar los cambios al instante.
function computeAggregates(employees, matrix, daysInMonth) {
  const dailyCounts = {};
  for (let d = 1; d <= daysInMonth; d++) {
    dailyCounts[d] = { A: 0, B: 0, C: 0, L: 0, other: 0 };
    employees.forEach(emp => {
      const code = matrix[emp.id]?.[d] || 'L';
      if (['A','B','C','L'].includes(code)) dailyCounts[d][code]++;
      else dailyCounts[d].other++;
    });
  }
  const employeeTotals = {};
  employees.forEach(emp => {
    const t = { A:0, B:0, C:0, L:0, DE:0, VAC:0, special:0 };
    for (let d = 1; d <= daysInMonth; d++) {
      const code = matrix[emp.id]?.[d] || 'L';
      if (t[code] !== undefined) t[code]++;
      else if (WORK_CODES.includes(code)) t.special++;
      else if (code === 'VAC') t.VAC++;
    }
    employeeTotals[emp.id] = t;
  });
  return { dailyCounts, employeeTotals };
}

// Genera un patrón de rotación para rellenar el mes automáticamente
function generateAutoRotation({ pattern, startShift, daysWork, daysOff, offset, totalDays }) {
  const result = {};
  if (pattern === 'fill') {
    for (let d = 1; d <= totalDays; d++) result[d] = startShift;
    return result;
  }
  let cycle = [];
  if (pattern === 'fixed') {
    for (let i = 0; i < daysWork; i++) cycle.push(startShift);
    for (let i = 0; i < daysOff; i++) cycle.push('L');
  } else { // rotating A→B→C
    const base = ['A', 'B', 'C'].indexOf(startShift);
    for (let si = 0; si < 3; si++) {
      const sh = ['A', 'B', 'C'][(base + si) % 3];
      for (let i = 0; i < daysWork; i++) cycle.push(sh);
      for (let i = 0; i < daysOff; i++) cycle.push('L');
    }
  }
  for (let d = 1; d <= totalDays; d++) {
    result[d] = cycle[((offset - 1) + (d - 1)) % cycle.length];
  }
  return result;
}

export default function ScheduleScreen({ route }) {
  const { departmentId = 1, departmentName = 'Nefrología' } = route?.params || {};
  const { canEdit, isAdmin } = useAuth();
  useShifts(); // re-renderiza el grid cuando el admin edita los turnos

  // Flujo de aprobación
  const [signing, setSigning]           = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote]     = useState('');
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [staffVisible, setStaffVisible] = useState(false);
  const [printVisible, setPrintVisible] = useState(false);
  const [apprExpanded, setApprExpanded] = useState(false);

  const today = new Date();
  const [year, setYear]   = useState(2026);
  const [month, setMonth] = useState(6);

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);
  const [snack, setSnack]       = useState('');

  const [editCell, setEditCell] = useState(null); // { empId, day, currentCode }
  const [saving, setSaving]     = useState(false);
  const [filter, setFilter]     = useState('all'); // all | licenciada | auxiliar | servicio_social | hd_profesional | hd_auxiliar

  // Feature 1: Auto-rotación
  const [autoRotateVisible, setAutoRotateVisible] = useState(false);
  const [autoRotateEmp, setAutoRotateEmp]         = useState(null);
  const [arPattern, setArPattern]                 = useState('rotating');
  const [arStartShift, setArStartShift]           = useState('A');
  const [arDaysWork, setArDaysWork]               = useState(2);
  const [arDaysOff, setArDaysOff]                 = useState(1);
  const [arOffset, setArOffset]                   = useState(1);
  const [arApplying, setArApplying]               = useState(false);
  // Feature 2: Copiar mes anterior
  const [copyPrevLoading, setCopyPrevLoading]     = useState(false);
  // Feature 3: Selección por rango
  const [selectMode, setSelectMode]               = useState(false);
  const [selectedCells, setSelectedCells]         = useState(new Set());
  const [rangePickerVisible, setRangePickerVisible] = useState(false);
  // Feature 4: Rellenar fila
  const [fillRowVisible, setFillRowVisible]       = useState(false);
  const [fillRowEmp, setFillRowEmp]               = useState(null);
  const [fillRowShift, setFillRowShift]           = useState('A');
  const [fillRowOnlyEmpty, setFillRowOnlyEmpty]   = useState(true);
  const [fillRowApplying, setFillRowApplying]     = useState(false);
  // Feature 5: Plantillas
  const [templatesVisible, setTemplatesVisible]   = useState(false);
  const [templatesList, setTemplatesList]         = useState([]);
  const [templatesLoading, setTemplatesLoading]   = useState(false);
  const [saveTplVisible, setSaveTplVisible]       = useState(false);
  const [saveTplName, setSaveTplName]             = useState('');
  const [saveTplLoading, setSaveTplLoading]       = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const load = useCallback(async () => {
    try {
      setError(null);
      const result = await api.getSchedule(departmentId, year, month);
      setData(result);
    } catch (e) {
      setError('No se pudo conectar con el servidor. Verifica que el backend esté corriendo en el puerto 3001.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [departmentId, year, month]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const handleCellPress = (empId, day, currentCode) => {
    if (selectMode) {
      const key = `${empId}-${day}`;
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    if (!canEdit) return; // El rol Lector no puede editar
    setEditCell({ empId, day, currentCode });
  };

  const handleShiftSelect = async (code) => {
    if (!editCell) return;
    setSaving(true);
    try {
      await api.updateEntry({
        department_id: departmentId,
        year, month,
        employee_id: editCell.empId,
        day: editCell.day,
        shift_code: code,
      });
      setData(prev => {
        const newMatrix = { ...prev.matrix };
        newMatrix[editCell.empId] = { ...(newMatrix[editCell.empId] || {}), [editCell.day]: code };
        const dim = new Date(year, month, 0).getDate();
        const { dailyCounts, employeeTotals } = computeAggregates(prev.employees || [], newMatrix, dim);
        return { ...prev, matrix: newMatrix, dailyCounts, employeeTotals };
      });
      setSnack('Turno actualizado');
    } catch (e) {
      setSnack('Error al guardar el turno');
    } finally {
      setSaving(false);
      setEditCell(null);
    }
  };

  const smId = data?.scheduleMonth?.id;
  const approval = data?.approval;

  const doSign = async () => {
    if (!smId) return;
    setSigning(true);
    try { await api.signSchedule(smId); setSnack('Firmado correctamente'); await load(); }
    catch (e) { setSnack(e.response?.data?.error || 'No se pudo firmar'); }
    finally { setSigning(false); }
  };

  const doReject = async () => {
    if (!rejectTarget) { setSnack('Elige a quién devolver el rol'); return; }
    if (!rejectNote.trim()) { setSnack('Escribe el motivo del rechazo'); return; }
    setSigning(true);
    try {
      await api.rejectSchedule(smId, rejectTarget, rejectNote.trim());
      setRejectVisible(false); setRejectNote(''); setRejectTarget(null);
      setSnack('Rol devuelto para revisión');
      await load();
    } catch (e) { setSnack(e.response?.data?.error || 'No se pudo rechazar'); }
    finally { setSigning(false); }
  };

  const doReopen = async () => {
    try { await api.reopenSchedule(smId); setSnack('Rol reabierto para edición'); await load(); }
    catch (e) { setSnack(e.response?.data?.error || 'No se pudo reabrir'); }
  };

  /* ====== Feature 1: Auto-rotación ====== */
  const handleAutoRotateApply = async () => {
    if (!autoRotateEmp) return;
    const gen = generateAutoRotation({ pattern: arPattern, startShift: arStartShift, daysWork: arDaysWork, daysOff: arDaysOff, offset: arOffset, totalDays: daysInMonth });
    const entries = Object.entries(gen).map(([day, shift_code]) => ({ employee_id: autoRotateEmp.id, day: Number(day), shift_code }));
    setArApplying(true);
    try {
      await api.bulkEntries({ department_id: departmentId, year, month, entries });
      setData(prev => {
        const newMatrix = { ...prev.matrix, [autoRotateEmp.id]: { ...(prev.matrix[autoRotateEmp.id] || {}), ...gen } };
        const { dailyCounts, employeeTotals } = computeAggregates(prev.employees || [], newMatrix, daysInMonth);
        return { ...prev, matrix: newMatrix, dailyCounts, employeeTotals };
      });
      setAutoRotateVisible(false);
      setSnack('Rotación aplicada correctamente');
    } catch (e) { setSnack(e.response?.data?.error || 'Error al aplicar rotación'); }
    finally { setArApplying(false); }
  };

  /* ====== Feature 2: Copiar mes anterior ====== */
  const handleCopyPrevious = () => {
    const prevM = month === 1 ? 12 : month - 1;
    const prevY = month === 1 ? year - 1 : year;
    Alert.alert(
      'Copiar mes anterior',
      `¿Copiar el rol de ${MONTHS_ES[prevM - 1]} ${prevY} como base para ${MONTHS_ES[month - 1]} ${year}?\n\nEsto sobreescribirá las entradas existentes.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Copiar', onPress: async () => {
          setCopyPrevLoading(true);
          try {
            const r = await api.copyPrevious({ department_id: departmentId, year, month });
            setSnack(`${r.copied} turnos copiados del mes anterior`);
            await load();
          } catch (e) { setSnack(e.response?.data?.error || 'No se pudo copiar el mes anterior'); }
          finally { setCopyPrevLoading(false); }
        }},
      ],
    );
  };

  /* ====== Feature 3: Asignar turno a celdas seleccionadas ====== */
  const handleRangeShiftSelect = async (code) => {
    setRangePickerVisible(false);
    if (selectedCells.size === 0) return;
    const entries = Array.from(selectedCells).map(key => {
      const [empId, day] = key.split('-');
      return { employee_id: Number(empId), day: Number(day), shift_code: code };
    });
    setSaving(true);
    try {
      await api.bulkEntries({ department_id: departmentId, year, month, entries });
      setData(prev => {
        const newMatrix = { ...prev.matrix };
        entries.forEach(({ employee_id, day, shift_code }) => {
          newMatrix[employee_id] = { ...(newMatrix[employee_id] || {}), [day]: shift_code };
        });
        const { dailyCounts, employeeTotals } = computeAggregates(prev.employees || [], newMatrix, daysInMonth);
        return { ...prev, matrix: newMatrix, dailyCounts, employeeTotals };
      });
      setSelectedCells(new Set());
      setSelectMode(false);
      setSnack(`${entries.length} turno${entries.length !== 1 ? 's' : ''} asignado${entries.length !== 1 ? 's' : ''}`);
    } catch (e) { setSnack(e.response?.data?.error || 'Error al guardar'); }
    finally { setSaving(false); }
  };

  /* ====== Feature 4: Rellenar fila ====== */
  const handleFillRowApply = async () => {
    if (!fillRowEmp) return;
    const currentEmpMatrix = data?.matrix[fillRowEmp.id] || {};
    const entries = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const current = currentEmpMatrix[d] || 'L';
      if (fillRowOnlyEmpty && current !== 'L') continue;
      entries.push({ employee_id: fillRowEmp.id, day: d, shift_code: fillRowShift });
    }
    if (entries.length === 0) { setSnack('No hay días que rellenar'); return; }
    setFillRowApplying(true);
    try {
      await api.bulkEntries({ department_id: departmentId, year, month, entries });
      setData(prev => {
        const newMatrix = { ...prev.matrix };
        const empMatrix = { ...(newMatrix[fillRowEmp.id] || {}) };
        entries.forEach(({ day, shift_code }) => { empMatrix[day] = shift_code; });
        newMatrix[fillRowEmp.id] = empMatrix;
        const { dailyCounts, employeeTotals } = computeAggregates(prev.employees || [], newMatrix, daysInMonth);
        return { ...prev, matrix: newMatrix, dailyCounts, employeeTotals };
      });
      setFillRowVisible(false);
      setSnack(`${entries.length} días rellenados`);
    } catch (e) { setSnack(e.response?.data?.error || 'Error al rellenar'); }
    finally { setFillRowApplying(false); }
  };

  /* ====== Feature 5: Plantillas ====== */
  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try { setTemplatesList(await api.getTemplates(departmentId)); }
    catch (e) { setSnack('Error al cargar plantillas'); }
    finally { setTemplatesLoading(false); }
  };
  const openTemplates = () => { setTemplatesVisible(true); loadTemplates(); };
  const handleSaveTemplate = async () => {
    if (!saveTplName.trim()) { setSnack('Escribe un nombre para la plantilla'); return; }
    setSaveTplLoading(true);
    try {
      await api.saveTemplate({ department_id: departmentId, year, month, name: saveTplName.trim() });
      setSaveTplVisible(false); setSaveTplName('');
      setSnack('Plantilla guardada'); loadTemplates();
    } catch (e) { setSnack(e.response?.data?.error || 'Error al guardar plantilla'); }
    finally { setSaveTplLoading(false); }
  };
  const handleApplyTemplate = (tpl) => {
    Alert.alert('Aplicar plantilla', `¿Aplicar "${tpl.name}" al mes actual?\n\nEsto sobreescribirá las entradas existentes.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Aplicar', onPress: async () => {
        setTemplatesVisible(false); setSaving(true);
        try {
          const r = await api.applyTemplate(tpl.id, { department_id: departmentId, year, month });
          setSnack(`${r.applied} turnos aplicados`); await load();
        } catch (e) { setSnack(e.response?.data?.error || 'Error al aplicar plantilla'); }
        finally { setSaving(false); }
      }},
    ]);
  };
  const handleDeleteTemplate = (tpl) => {
    Alert.alert('Eliminar plantilla', `¿Eliminar "${tpl.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        try { await api.deleteTemplate(tpl.id); setSnack('Plantilla eliminada'); loadTemplates(); }
        catch (e) { setSnack(e.response?.data?.error || 'Error al eliminar'); }
      }},
    ]);
  };

  const handlePrint = async (paperSize = 'oficio') => {
    setPrintVisible(false);
    if (!data) return;
    try {
      let dept = data.department;
      if (!dept) {
        try { dept = await api.getDepartment(departmentId); } catch (_) { dept = { name: departmentName }; }
      }
      const empsToPrint = filteredEmployees;
      const puesto = filter !== 'all'
        ? (CATEGORY_LABELS[filter] || filter)
        : undefined;
      // Traer las firmas reales (con imagen) para estamparlas en el documento
      let approvals = [];
      if (smId) { try { approvals = await api.getScheduleSignatures(smId); } catch (_) {} }
      const res = printSchedule({
        dept,
        year, month,
        employees: empsToPrint,
        matrix,
        dailyCounts,
        employeeTotals,
        puesto,
        approvals,
        paperSize,
      });
      if (!res.ok && res.reason === 'popup_blocked') {
        setSnack('Permite las ventanas emergentes para imprimir');
      } else if (!res.ok && res.reason === 'native') {
        setSnack('La impresión está disponible en la versión web');
      }
    } catch (e) {
      setSnack('No se pudo generar la impresión');
    }
  };

  const changeMonth = (dir) => {
    let m = month + dir, y = year;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setMonth(m); setYear(y);
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingText}>Cargando rol de turno...</Text>
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Ionicons name="wifi-outline" size={64} color={COLORS.textLight} />
      <Text style={styles.errorTitle}>Sin conexión</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={load}>
        <Text style={styles.retryText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  const employees = data?.employees || [];
  const matrix = data?.matrix || {};
  const dailyCounts = data?.dailyCounts || {};
  const employeeTotals = data?.employeeTotals || {};

  const filteredEmployees = filter === 'all' ? employees : employees.filter(e => e.category === filter);

  const categories = [...new Set(employees.map(e => e.category))];

  return (
    <View style={styles.container}>
      {/* Header */}
      <Surface style={styles.header} elevation={3}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={22} color={COLORS.onPrimary || '#fff'} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerMonth}>{MONTHS_ES[month - 1]} {year}</Text>
            <Text style={styles.headerDept}>{departmentName}</Text>
          </View>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={22} color={COLORS.onPrimary || '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setStaffVisible(true)} style={[styles.navBtn, styles.printBtn]}>
            <Ionicons name="people" size={20} color={COLORS.onPrimary || '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPrintVisible(true)} style={[styles.navBtn, styles.printBtn]}>
            <Ionicons name="print" size={20} color={COLORS.onPrimary || '#fff'} />
          </TouchableOpacity>
        </View>

        {/* Category filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          <Chip selected={filter === 'all'} onPress={() => setFilter('all')} style={styles.chip} textStyle={styles.chipText} compact>Todas</Chip>
          {categories.map(cat => (
            <Chip key={cat} selected={filter === cat} onPress={() => setFilter(cat)}
              style={[styles.chip, { borderColor: CATEGORY_COLOR[cat] }]} textStyle={styles.chipText} compact>
              {CATEGORY_LABELS[cat] || cat}
            </Chip>
          ))}
        </ScrollView>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <StatBadge label="Total" value={filteredEmployees.length} color={COLORS.primary} />
          <StatBadge label="Turno A" value={Object.values(dailyCounts)[0]?.A || 0} color="#2E7D32" />
          <StatBadge label="Turno B" value={Object.values(dailyCounts)[0]?.B || 0} color="#1565C0" />
          <StatBadge label="Turno C" value={Object.values(dailyCounts)[0]?.C || 0} color="#6A1B9A" />
        </View>

        {/* Barra de herramientas de edición — solo en modo edición */}
        {canEdit && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editToolbar} contentContainerStyle={styles.editToolbarContent}>
            <TouchableOpacity style={styles.editTool} onPress={handleCopyPrevious} disabled={copyPrevLoading}>
              <Ionicons name="copy-outline" size={15} color="#fff" />
              <Text style={styles.editToolLabel}>{copyPrevLoading ? 'Copiando…' : 'Mes anterior'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.editTool, selectMode && styles.editToolActive]}
              onPress={() => { if (selectMode) { setSelectMode(false); setSelectedCells(new Set()); } else setSelectMode(true); }}
            >
              <Ionicons name={selectMode ? 'checkmark-done' : 'hand-left-outline'} size={15} color="#fff" />
              <Text style={styles.editToolLabel}>{selectMode ? `Seleccionando (${selectedCells.size})` : 'Selección múltiple'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editTool} onPress={openTemplates}>
              <Ionicons name="albums-outline" size={15} color="#fff" />
              <Text style={styles.editToolLabel}>Plantillas</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </Surface>

      {/* Barra de aprobación con stepper de progreso (colapsable) */}
      {approval && (
        <Surface style={styles.apprCard} elevation={1}>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setApprExpanded(e => !e)} style={styles.apprTop}>
            <View style={styles.apprStatus}>
              <View style={[styles.apprDot,
                approval.state === 'approved' ? { backgroundColor: COLORS.success }
                  : approval.state === 'in_review' ? { backgroundColor: COLORS.warning }
                  : { backgroundColor: COLORS.textLight }]}>
                <Ionicons
                  name={approval.state === 'approved' ? 'lock-closed' : approval.state === 'in_review' ? 'time' : 'create-outline'}
                  size={14} color="#fff"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.apprState}>
                  {approval.state === 'approved' ? 'Aprobado' : approval.state === 'in_review' ? 'En revisión' : 'Borrador'}
                </Text>
                <Text style={styles.apprSub} numberOfLines={1}>
                  {approval.state === 'approved' ? 'Documento bloqueado' : `Pendiente: ${approval.current_label}`}
                </Text>
              </View>
            </View>

            {/* Mini-stepper visible solo cuando está colapsado */}
            {!apprExpanded && (
              <View style={styles.apprMini}>
                <ApprovalProgress approval={approval} compact />
              </View>
            )}

            <View style={styles.apprHeaderRight}>
              {!apprExpanded && approval.can_sign && (
                <Button compact mode="contained" icon="draw" onPress={doSign} loading={signing} disabled={signing}>Firmar</Button>
              )}
              <IconButton icon="timeline-clock-outline" size={20} onPress={() => setTimelineVisible(true)} style={{ margin: 0 }} />
              <Ionicons name={apprExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textLight} />
            </View>
          </TouchableOpacity>

          {apprExpanded && (
            <>
              <ApprovalProgress approval={approval} />
              {(approval.can_reject || approval.can_sign || (isAdmin && approval.state === 'approved')) && (
                <View style={styles.apprActions}>
                  {approval.can_reject && (
                    <Button compact mode="text" textColor={COLORS.danger} onPress={() => setRejectVisible(true)}>Rechazar</Button>
                  )}
                  {approval.can_sign && (
                    <Button compact mode="contained" icon="draw" onPress={doSign} loading={signing} disabled={signing}>Firmar</Button>
                  )}
                  {isAdmin && approval.state === 'approved' && (
                    <Button compact mode="outlined" icon="lock-open-variant" onPress={doReopen}>Reabrir</Button>
                  )}
                </View>
              )}
            </>
          )}
        </Surface>
      )}

      {/* Schedule Grid */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        style={styles.scrollOuter}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scrollInner} contentContainerStyle={styles.scrollInnerContent}>
          <View>
            {/* Day header */}
            <View style={[styles.row, styles.dayHeaderRow]}>
              <View style={[styles.nameCell, styles.nameCellHeader]}>
                <Text style={styles.nameCellHeaderText}>Empleada</Text>
              </View>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const dow = new Date(year, month - 1, d).getDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <View key={d} style={[styles.dayHeader, isWeekend && styles.dayHeaderWeekend, { width: CELL_W }]}>
                    <Text style={[styles.dayHeaderDay, isWeekend && styles.dayHeaderWeekendText]}>{DAYS_ES[dow]}</Text>
                    <Text style={[styles.dayHeaderNum, isWeekend && styles.dayHeaderWeekendText]}>{d}</Text>
                  </View>
                );
              })}
              <View style={styles.totalsHeader}>
                <Text style={styles.totalsHeaderText}>A</Text>
              </View>
              <View style={styles.totalsHeader}>
                <Text style={styles.totalsHeaderText}>B</Text>
              </View>
              <View style={styles.totalsHeader}>
                <Text style={styles.totalsHeaderText}>C</Text>
              </View>
              <View style={styles.totalsHeader}>
                <Text style={styles.totalsHeaderText}>L</Text>
              </View>
            </View>

            {/* Employee rows */}
            {filteredEmployees.map((emp, idx) => {
              const totals = employeeTotals[emp.id] || {};
              const isJefe = emp.role === 'jefe_sala';
              return (
                <View key={emp.id} style={[styles.row, idx % 2 === 0 && styles.rowEven, isJefe && styles.rowJefe]}>
                  <View style={[styles.nameCell, { borderLeftColor: CATEGORY_COLOR[emp.category] || COLORS.primary }]}>
                    {isJefe && <Text style={styles.jefeBadge}>JS</Text>}
                    <Text style={styles.empName} numberOfLines={2}>{emp.name}</Text>
                    <Text style={styles.empClave}>{emp.clave}</Text>
                    {canEdit && (
                      <View style={styles.empQuickActions}>
                        <TouchableOpacity
                          onPress={() => { setAutoRotateEmp(emp); setArStartShift('A'); setArPattern('rotating'); setArDaysWork(2); setArDaysOff(1); setArOffset(1); setAutoRotateVisible(true); }}
                          style={styles.empQBtn}
                        >
                          <Ionicons name="refresh-outline" size={12} color={COLORS.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { setFillRowEmp(emp); setFillRowShift('A'); setFillRowOnlyEmpty(true); setFillRowVisible(true); }}
                          style={styles.empQBtn}
                        >
                          <Ionicons name="reorder-four-outline" size={12} color={COLORS.primary} />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                    const code = matrix[emp.id]?.[d] || 'L';
                    const dow = new Date(year, month - 1, d).getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    const isSelected = selectMode && selectedCells.has(`${emp.id}-${d}`);
                    return (
                      <View key={d} style={[styles.cellWrap, isWeekend && styles.cellWrapWeekend, isSelected && styles.cellWrapSelected, { width: CELL_W }]}>
                        <ShiftCell
                          code={code}
                          size="sm"
                          editable={canEdit || selectMode}
                          onPress={() => handleCellPress(emp.id, d, code)}
                        />
                      </View>
                    );
                  })}

                  <View style={[styles.totalCell, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={[styles.totalNum, { color: '#2E7D32' }]}>{totals.A || 0}</Text>
                  </View>
                  <View style={[styles.totalCell, { backgroundColor: '#E3F2FD' }]}>
                    <Text style={[styles.totalNum, { color: '#1565C0' }]}>{totals.B || 0}</Text>
                  </View>
                  <View style={[styles.totalCell, { backgroundColor: '#F3E5F5' }]}>
                    <Text style={[styles.totalNum, { color: '#6A1B9A' }]}>{totals.C || 0}</Text>
                  </View>
                  <View style={[styles.totalCell, { backgroundColor: '#FAFAFA' }]}>
                    <Text style={[styles.totalNum, { color: '#757575' }]}>{totals.L || 0}</Text>
                  </View>
                </View>
              );
            })}

            {/* Daily counts row */}
            <View style={[styles.row, styles.countsRow]}>
              <View style={styles.nameCell}>
                <Text style={styles.countsLabel}>Turno A</Text>
              </View>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <View key={d} style={[styles.countCell, { width: CELL_W, backgroundColor: '#E8F5E9' }]}>
                  <Text style={[styles.countNum, { color: '#2E7D32' }]}>{dailyCounts[d]?.A || 0}</Text>
                </View>
              ))}
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
            </View>

            <View style={[styles.row, styles.countsRow]}>
              <View style={styles.nameCell}>
                <Text style={styles.countsLabel}>Turno B</Text>
              </View>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <View key={d} style={[styles.countCell, { width: CELL_W, backgroundColor: '#E3F2FD' }]}>
                  <Text style={[styles.countNum, { color: '#1565C0' }]}>{dailyCounts[d]?.B || 0}</Text>
                </View>
              ))}
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
            </View>

            <View style={[styles.row, styles.countsRow]}>
              <View style={styles.nameCell}>
                <Text style={styles.countsLabel}>Turno C</Text>
              </View>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                <View key={d} style={[styles.countCell, { width: CELL_W, backgroundColor: '#F3E5F5' }]}>
                  <Text style={[styles.countNum, { color: '#6A1B9A' }]}>{dailyCounts[d]?.C || 0}</Text>
                </View>
              ))}
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
              <View style={styles.totalCell} />
            </View>
          </View>
        </ScrollView>
      </ScrollView>

      {/* Shift Picker */}
      <ShiftPicker
        visible={!!editCell}
        currentCode={editCell?.currentCode}
        onSelect={handleShiftSelect}
        onClose={() => setEditCell(null)}
      />

      {/* Shift Picker para selección múltiple */}
      <ShiftPicker
        visible={rangePickerVisible}
        onSelect={handleRangeShiftSelect}
        onClose={() => setRangePickerVisible(false)}
      />

      {/* Modal de rechazo */}
      <Portal>
        <Modal visible={rejectVisible} onDismiss={() => setRejectVisible(false)} contentContainerStyle={styles.apprModalOverlay}>
          <View style={styles.apprModal}>
          <Text style={styles.apprModalTitle}>Rechazar y devolver</Text>
          <Text style={styles.apprModalLabel}>¿A qué nivel lo devuelves?</Text>
          <View style={styles.apprChipWrap}>
            {(approval?.chain || []).filter(c => c.level < (approval?.current_level || 99)).map(c => (
              <Chip key={c.level} selected={rejectTarget === c.level} onPress={() => setRejectTarget(c.level)} showSelectedCheck style={{ marginBottom: 6 }}>
                {c.label}
              </Chip>
            ))}
          </View>
          <TextInput label="Motivo del rechazo" value={rejectNote} onChangeText={setRejectNote} mode="outlined" multiline numberOfLines={3} style={{ marginTop: 8, backgroundColor: '#fff' }} />
          <View style={styles.apprModalActions}>
            <Button mode="text" onPress={() => setRejectVisible(false)}>Cancelar</Button>
            <Button mode="contained" buttonColor={COLORS.danger} onPress={doReject} loading={signing} disabled={signing}>Devolver</Button>
          </View>
          </View>
        </Modal>
      </Portal>

      {/* Modal de línea de tiempo */}
      <Portal>
        <Modal visible={timelineVisible} onDismiss={() => setTimelineVisible(false)} contentContainerStyle={styles.apprModalOverlay}>
          <View style={styles.apprModal}>
          <Text style={styles.apprModalTitle}>Línea de tiempo del rol</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {(approval?.timeline || []).length === 0 ? (
              <Text style={{ color: COLORS.textLight, paddingVertical: 12 }}>Aún no hay movimientos. El proceso inicia cuando el Jefe de Área firma.</Text>
            ) : (
              (approval?.timeline || []).map((ev, i) => {
                const isReject = ev.action === 'reject';
                const isReopen = ev.action === 'reopen';
                const color = isReject ? COLORS.danger : isReopen ? COLORS.warning : COLORS.success;
                const icon = isReject ? 'close-circle' : isReopen ? 'lock-open-variant' : 'checkmark-circle';
                const verb = isReject ? 'Rechazó y devolvió' : isReopen ? 'Reabrió' : 'Firmó';
                return (
                  <View key={ev.id} style={styles.tlRow}>
                    <View style={styles.tlLeft}>
                      <Ionicons name={icon === 'lock-open-variant' ? 'lock-open' : icon} size={20} color={color} />
                      {i < (approval.timeline.length - 1) && <View style={styles.tlLine} />}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 14 }}>
                      <Text style={styles.tlName}>{ev.user_name}</Text>
                      <Text style={styles.tlPos}>{APPROVAL_POSITION_LABELS[ev.position] || ev.position}</Text>
                      <Text style={[styles.tlVerb, { color }]}>{verb}</Text>
                      {!!ev.note && <Text style={styles.tlNote}>“{ev.note}”</Text>}
                      <Text style={styles.tlDate}>{new Date(ev.created_at).toLocaleString()}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={styles.apprModalActions}>
            <Button mode="contained" onPress={() => setTimelineVisible(false)}>Cerrar</Button>
          </View>
          </View>
        </Modal>
      </Portal>

      {/* Opciones de impresión: tamaño de papel */}
      <Portal>
        <Modal visible={printVisible} onDismiss={() => setPrintVisible(false)} contentContainerStyle={styles.apprModalOverlay}>
          <View style={styles.apprModal}>
          <Text style={styles.apprModalTitle}>Imprimir rol (horizontal)</Text>
          <Text style={{ color: COLORS.textLight, marginBottom: 14, fontSize: 13 }}>Elige el tamaño de papel:</Text>
          <Button mode="contained" icon="file-document-outline" style={{ marginBottom: 10 }} onPress={() => handlePrint('oficio')}>Oficio (8.5 × 13")</Button>
          <Button mode="outlined" icon="file-outline" style={{ marginBottom: 10 }} onPress={() => handlePrint('legal')}>Legal (8.5 × 14")</Button>
          <Button mode="outlined" icon="file-outline" style={{ marginBottom: 6 }} onPress={() => handlePrint('carta')}>Carta (8.5 × 11")</Button>
          <Button mode="text" onPress={() => setPrintVisible(false)} style={{ marginTop: 4 }}>Cancelar</Button>
          </View>
        </Modal>
      </Portal>

      {/* Barra flotante de selección múltiple */}
      {selectMode && (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionBarText}>
            {selectedCells.size === 0 ? 'Toca celdas para seleccionar' : `${selectedCells.size} celda${selectedCells.size !== 1 ? 's' : ''} seleccionada${selectedCells.size !== 1 ? 's' : ''}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button compact mode="outlined" textColor="#fff" style={{ borderColor: 'rgba(255,255,255,0.6)' }} onPress={() => { setSelectMode(false); setSelectedCells(new Set()); }}>Cancelar</Button>
            {selectedCells.size > 0 && (
              <Button compact mode="contained" buttonColor="#4CAF50" onPress={() => setRangePickerVisible(true)}>Asignar turno</Button>
            )}
          </View>
        </View>
      )}

      {/* Modal: Auto-rotación por empleada */}
      <Portal>
        <Modal visible={autoRotateVisible} onDismiss={() => setAutoRotateVisible(false)} contentContainerStyle={styles.apprModalOverlay}>
          <View style={[styles.apprModal, { maxWidth: 820 }]}>
          <Text style={styles.apprModalTitle}>Auto-generar rotación</Text>
          {autoRotateEmp && <Text style={{ color: COLORS.textLight, marginBottom: 8, fontSize: 13 }}>{autoRotateEmp.name}</Text>}

          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>

          <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 240 }}>
              <Text style={styles.apprModalLabel}>Patrón de rotación</Text>
              <View style={[styles.apprChipWrap, { marginBottom: 4 }]}>
                {[{ value: 'rotating', label: 'Rotativa A→B→C' }, { value: 'fixed', label: 'Turno fijo repetido' }, { value: 'fill', label: 'Rellenar todo igual' }].map(p => (
                  <Chip key={p.value} selected={arPattern === p.value} onPress={() => setArPattern(p.value)} showSelectedCheck style={{ marginBottom: 4 }}>{p.label}</Chip>
                ))}
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 200 }}>
              <Text style={styles.apprModalLabel}>Turno {arPattern === 'rotating' ? 'de inicio del ciclo' : 'a asignar'}</Text>
              <View style={[styles.apprChipWrap, { marginBottom: 4 }]}>
                {['A', 'B', 'C'].map(s => (
                  <Chip key={s} selected={arStartShift === s} onPress={() => setArStartShift(s)} showSelectedCheck
                    style={{ marginBottom: 4, backgroundColor: arStartShift === s ? getShift(s).color : undefined }}
                    textStyle={{ color: arStartShift === s ? '#fff' : undefined }}>
                    Turno {s}
                  </Chip>
                ))}
              </View>
            </View>
          </View>

          {arPattern !== 'fill' && (
            <>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.apprModalLabel, { marginBottom: 6 }]}>Trabajo: {arDaysWork} días</Text>
                  <View style={styles.apprChipWrap}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Chip key={n} selected={arDaysWork === n} onPress={() => setArDaysWork(n)} compact style={{ marginBottom: 4 }}>{n}</Chip>
                    ))}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.apprModalLabel, { marginBottom: 6 }]}>Descanso: {arDaysOff} días</Text>
                  <View style={styles.apprChipWrap}>
                    {[1, 2, 3].map(n => (
                      <Chip key={n} selected={arDaysOff === n} onPress={() => setArDaysOff(n)} compact style={{ marginBottom: 4 }}>{n}</Chip>
                    ))}
                  </View>
                </View>
              </View>
              <Text style={[styles.apprModalLabel, { marginTop: 8 }]}>Posición del día 1 en el ciclo: {arOffset}</Text>
              <View style={styles.apprChipWrap}>
                {Array.from({ length: (arPattern === 'rotating' ? 3 : 1) * (arDaysWork + arDaysOff) }, (_, i) => i + 1).map(n => (
                  <Chip key={n} selected={arOffset === n} onPress={() => setArOffset(n)} compact style={{ marginBottom: 4 }}>{n}</Chip>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.apprModalLabel, { marginTop: 10 }]}>Vista previa (primeros 14 días)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {Array.from({ length: Math.min(14, daysInMonth) }, (_, i) => {
              const preview = generateAutoRotation({ pattern: arPattern, startShift: arStartShift, daysWork: arDaysWork, daysOff: arDaysOff, offset: arOffset, totalDays: Math.min(14, daysInMonth) });
              const code = preview[i + 1] || 'L';
              const shift = getShift(code);
              return (
                <View key={i} style={{ backgroundColor: shift.color, borderRadius: 4, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: shift.textColor, fontSize: 9, fontWeight: '700' }}>{code}</Text>
                </View>
              );
            })}
          </View>

          </ScrollView>

          <View style={styles.apprModalActions}>
            <Button mode="text" onPress={() => setAutoRotateVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleAutoRotateApply} loading={arApplying} disabled={arApplying}>Aplicar al mes</Button>
          </View>
          </View>
        </Modal>
      </Portal>

      {/* Modal: Rellenar fila completa */}
      <Portal>
        <Modal visible={fillRowVisible} onDismiss={() => setFillRowVisible(false)} contentContainerStyle={styles.apprModalOverlay}>
          <View style={styles.apprModal}>
          <Text style={styles.apprModalTitle}>Rellenar fila</Text>
          {fillRowEmp && <Text style={{ color: COLORS.textLight, marginBottom: 10, fontSize: 13 }}>{fillRowEmp.name}</Text>}
          <Text style={styles.apprModalLabel}>Turno a asignar</Text>
          <ScrollView style={{ maxHeight: 180 }}>
            <View style={styles.apprChipWrap}>
              {['A', 'B', 'C', 'L', 'DE', 'VAC', 'INC', 'DP'].map(code => {
                const shift = getShift(code);
                return (
                  <Chip key={code} selected={fillRowShift === code} onPress={() => setFillRowShift(code)} showSelectedCheck
                    style={{ marginBottom: 6, backgroundColor: fillRowShift === code ? shift.color : undefined }}
                    textStyle={{ color: fillRowShift === code ? shift.textColor : undefined }}>
                    {shift.label} — {shift.description}
                  </Chip>
                );
              })}
            </View>
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 }}>
            <Switch value={fillRowOnlyEmpty} onValueChange={setFillRowOnlyEmpty} />
            <Text style={{ color: COLORS.text, fontSize: 13, flex: 1 }}>Solo reemplazar días “L” (libre)</Text>
          </View>
          <View style={styles.apprModalActions}>
            <Button mode="text" onPress={() => setFillRowVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleFillRowApply} loading={fillRowApplying} disabled={fillRowApplying}>Rellenar</Button>
          </View>
          </View>
        </Modal>
      </Portal>

      {/* Modal: Plantillas */}
      <Portal>
        <Modal visible={templatesVisible} onDismiss={() => setTemplatesVisible(false)} contentContainerStyle={styles.apprModalOverlay}>
          <View style={styles.apprModal}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.apprModalTitle}>Plantillas</Text>
            <Button mode="contained-tonal" icon="content-save-outline" compact onPress={() => { setSaveTplName(`${MONTHS_ES[month - 1]} ${year}`); setSaveTplVisible(true); }}>
              Guardar actual
            </Button>
          </View>
          {templatesLoading ? (
            <ActivityIndicator style={{ paddingVertical: 20 }} />
          ) : templatesList.length === 0 ? (
            <Text style={{ color: COLORS.textLight, textAlign: 'center', paddingVertical: 20 }}>No hay plantillas guardadas aún</Text>
          ) : (
            <ScrollView style={{ maxHeight: 300 }}>
              {templatesList.map(tpl => (
                <View key={tpl.id} style={styles.tplRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tplName}>{tpl.name}</Text>
                    <Text style={styles.tplDate}>{new Date(tpl.created_at).toLocaleDateString()}</Text>
                  </View>
                  <Button compact mode="contained" onPress={() => handleApplyTemplate(tpl)}>Aplicar</Button>
                  <IconButton icon="delete-outline" size={18} onPress={() => handleDeleteTemplate(tpl)} iconColor={COLORS.danger || '#F44336'} />
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.apprModalActions}>
            <Button mode="text" onPress={() => setTemplatesVisible(false)}>Cerrar</Button>
          </View>
          </View>
        </Modal>
      </Portal>

      {/* Modal: Nombre de nueva plantilla */}
      <Portal>
        <Modal visible={saveTplVisible} onDismiss={() => setSaveTplVisible(false)} contentContainerStyle={styles.apprModalOverlay}>
          <View style={styles.apprModal}>
          <Text style={styles.apprModalTitle}>Guardar como plantilla</Text>
          <TextInput
            label="Nombre de la plantilla"
            value={saveTplName}
            onChangeText={setSaveTplName}
            mode="outlined"
            style={{ backgroundColor: '#fff', marginTop: 8 }}
          />
          <View style={styles.apprModalActions}>
            <Button mode="text" onPress={() => setSaveTplVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={handleSaveTemplate} loading={saveTplLoading} disabled={saveTplLoading}>Guardar</Button>
          </View>
          </View>
        </Modal>
      </Portal>

      {/* Personal del área (gestión en contexto) */}
      <AreaStaffManager
        visible={staffVisible}
        onDismiss={() => setStaffVisible(false)}
        departmentId={departmentId}
        departmentName={departmentName}
        canEdit={canEdit}
        onChanged={load}
      />

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={2000}>{snack}</Snackbar>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
    </View>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <View style={styles.statBadge}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: COLORS.bg },
  loadingText: { marginTop: 16, color: COLORS.textLight, fontSize: 15 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  errorText: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  retryBtn: { marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  header: { backgroundColor: COLORS.header, paddingTop: 4, paddingBottom: 2 },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 1 },
  navBtn: { padding: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  printBtn: { marginLeft: 8, backgroundColor: 'rgba(255,255,255,0.25)' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerMonth: { fontSize: 15, fontWeight: '800', color: '#fff' },
  headerDept: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },

  filterRow: { maxHeight: 32, marginTop: 2 },
  filterContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  chip: { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  chipText: { color: '#fff', fontSize: 11 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 3, gap: 6 },
  statBadge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 3, paddingHorizontal: 4, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statValue: { fontSize: 14, fontWeight: '800', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },

  scrollOuter: { flex: 1 },
  scrollInner: { flex: 1 },
  scrollInnerContent: { flexGrow: 1, justifyContent: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: ROW_H, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  rowEven: { backgroundColor: '#FAFAFA' },
  rowJefe: { backgroundColor: '#E3F2FD' },

  dayHeaderRow: { backgroundColor: COLORS.header, minHeight: 44, position: 'relative' },
  dayHeader: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  dayHeaderDay: { fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  dayHeaderNum: { fontSize: 11, color: '#fff', fontWeight: '800' },
  dayHeaderWeekend: { backgroundColor: 'rgba(255,255,255,0.08)' },
  dayHeaderWeekendText: { color: '#FFD700' },

  nameCellHeader: { backgroundColor: 'transparent' },
  nameCellHeaderText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  nameCell: {
    width: NAME_W, paddingHorizontal: 8, paddingVertical: 4,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    justifyContent: 'center',
  },
  empName: { fontSize: 11, fontWeight: '600', color: COLORS.text, lineHeight: 14 },
  empClave: { fontSize: 10, color: COLORS.textLight, marginTop: 1 },
  jefeBadge: { fontSize: 8, fontWeight: '800', color: COLORS.primary, backgroundColor: '#E3F2FD', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, alignSelf: 'flex-start', marginBottom: 2 },

  cellWrap: { alignItems: 'center', justifyContent: 'center', height: ROW_H },
  cellWrapWeekend: { backgroundColor: 'rgba(255,215,0,0.05)' },

  totalsHeader: { width: 32, alignItems: 'center', justifyContent: 'center' },
  totalsHeaderText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  totalCell: { width: 32, alignItems: 'center', justifyContent: 'center', height: ROW_H },
  totalNum: { fontSize: 12, fontWeight: '700' },

  countsRow: { backgroundColor: '#F5F5F5', minHeight: 28 },
  countsLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textLight },
  countCell: { alignItems: 'center', justifyContent: 'center', height: 28 },
  countNum: { fontSize: 11, fontWeight: '700' },

  savingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center',
  },

  apprCard: { backgroundColor: COLORS.surface, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  apprTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  apprStatus: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 140 },
  apprDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  apprState: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  apprSub: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  apprActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8 },
  apprMini: { width: 320 },
  apprHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  apprModalOverlay: { justifyContent: 'center', alignItems: 'center', padding: 16 },
  apprModal: { width: '100%', maxWidth: 640, backgroundColor: COLORS.surface, borderRadius: 18, padding: 20 },
  apprModalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  apprModalLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  apprChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  apprModalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },

  tlRow: { flexDirection: 'row', gap: 12 },
  tlLeft: { alignItems: 'center', width: 24 },
  tlLine: { width: 2, flex: 1, backgroundColor: COLORS.border, marginTop: 2 },
  tlName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tlPos: { fontSize: 12, color: COLORS.textLight },
  tlVerb: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  tlNote: { fontSize: 12, color: COLORS.text, fontStyle: 'italic', marginTop: 4, backgroundColor: '#FFF3E0', padding: 8, borderRadius: 8 },
  tlDate: { fontSize: 10, color: COLORS.textLight, marginTop: 4 },

  // Barra de herramientas de edición
  editToolbar: { maxHeight: 34 },
  editToolbarContent: { paddingHorizontal: 12, paddingVertical: 3, gap: 8, alignItems: 'center' },
  editTool: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16 },
  editToolActive: { backgroundColor: 'rgba(255,255,255,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  editToolLabel: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // Botones rápidos por empleada
  empQuickActions: { flexDirection: 'row', gap: 3, marginTop: 3 },
  empQBtn: { padding: 2, backgroundColor: 'rgba(21,101,192,0.12)', borderRadius: 3 },

  // Celda seleccionada
  cellWrapSelected: { backgroundColor: 'rgba(33,150,243,0.25)', borderWidth: 1.5, borderColor: '#1565C0', borderRadius: 5 },

  // Barra flotante de selección
  selectionBar: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  selectionBarText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Plantillas
  tplRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E0E0E0', gap: 8 },
  tplName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  tplDate: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
});
