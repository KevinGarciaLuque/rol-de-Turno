import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Alert,
} from 'react-native';
import { Surface, Chip, IconButton, Snackbar, Button, Modal, Portal, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { getShift, MONTHS_ES, DAYS_ES, CATEGORY_COLOR, CATEGORY_LABELS } from '../constants/shifts';
import { APPROVAL_POSITION_LABELS } from '../constants/roles';
import { COLORS } from '../constants/theme';
import ShiftCell from '../components/ShiftCell';
import ShiftPicker from '../components/ShiftPicker';
import AreaStaffManager from '../components/AreaStaffManager';
import { printSchedule } from '../utils/printSchedule';
import { useAuth } from '../context/AuthContext';

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

export default function ScheduleScreen({ route }) {
  const { departmentId = 1, departmentName = 'Nefrología' } = route?.params || {};
  const { canEdit, isAdmin } = useAuth();

  // Flujo de aprobación
  const [signing, setSigning]           = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote]     = useState('');
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [staffVisible, setStaffVisible] = useState(false);

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

  const handlePrint = async () => {
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
          <TouchableOpacity onPress={handlePrint} style={[styles.navBtn, styles.printBtn]}>
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
      </Surface>

      {/* Barra de aprobación */}
      {approval && (
        <View style={[styles.apprBar, approval.state === 'approved' && { backgroundColor: '#E8F5E9' }, approval.state === 'in_review' && { backgroundColor: '#FFF8E1' }]}>
          <View style={styles.apprInfo}>
            <Ionicons
              name={approval.state === 'approved' ? 'lock-closed' : approval.state === 'in_review' ? 'time' : 'create-outline'}
              size={18}
              color={approval.state === 'approved' ? COLORS.success : approval.state === 'in_review' ? '#F57F17' : COLORS.textLight}
            />
            <Text style={styles.apprText} numberOfLines={2}>
              {approval.state === 'approved'
                ? 'Aprobado y bloqueado'
                : `${approval.state === 'in_review' ? 'En revisión' : 'Borrador'} · pendiente: ${approval.current_label}`}
            </Text>
          </View>
          <View style={styles.apprActions}>
            <IconButton icon="timeline-clock-outline" size={20} onPress={() => setTimelineVisible(true)} style={{ margin: 0 }} />
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
        </View>
      )}

      {/* Schedule Grid */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        style={styles.scrollOuter}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scrollInner}>
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
                  </View>

                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                    const code = matrix[emp.id]?.[d] || 'L';
                    const dow = new Date(year, month - 1, d).getDay();
                    const isWeekend = dow === 0 || dow === 6;
                    return (
                      <View key={d} style={[styles.cellWrap, isWeekend && styles.cellWrapWeekend, { width: CELL_W }]}>
                        <ShiftCell
                          code={code}
                          size="sm"
                          editable={canEdit}
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

      {/* Modal de rechazo */}
      <Portal>
        <Modal visible={rejectVisible} onDismiss={() => setRejectVisible(false)} contentContainerStyle={styles.apprModal}>
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
        </Modal>
      </Portal>

      {/* Modal de línea de tiempo */}
      <Portal>
        <Modal visible={timelineVisible} onDismiss={() => setTimelineVisible(false)} contentContainerStyle={styles.apprModal}>
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
    <View style={[styles.statBadge, { borderColor: color + '40' }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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

  header: { backgroundColor: COLORS.header, paddingTop: 12, paddingBottom: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 8 },
  navBtn: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  printBtn: { marginLeft: 8, backgroundColor: 'rgba(255,255,255,0.25)' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerMonth: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerDept: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  filterRow: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  chip: { backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  chipText: { color: '#fff', fontSize: 12 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  statBadge: {
    flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1,
  },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  scrollOuter: { flex: 1 },
  scrollInner: { flex: 1 },

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

  apprBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#ECEFF1', borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8, flexWrap: 'wrap' },
  apprInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 },
  apprText: { fontSize: 13, fontWeight: '600', color: COLORS.text, flex: 1 },
  apprActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  apprModal: { margin: 20, backgroundColor: COLORS.surface, borderRadius: 18, padding: 20 },
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
});
