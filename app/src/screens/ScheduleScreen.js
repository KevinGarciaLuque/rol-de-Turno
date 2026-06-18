import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, Alert,
} from 'react-native';
import { Surface, Chip, IconButton, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { getShift, MONTHS_ES, DAYS_ES, CATEGORY_COLOR, CATEGORY_LABELS } from '../constants/shifts';
import { COLORS } from '../constants/theme';
import ShiftCell from '../components/ShiftCell';
import ShiftPicker from '../components/ShiftPicker';
import { printSchedule } from '../utils/printSchedule';
import { useAuth } from '../context/AuthContext';

const CELL_W = 30;
const CELL_H = 28;
const NAME_W = 160;
const ROW_H  = 36;

export default function ScheduleScreen({ route }) {
  const { departmentId = 1, departmentName = 'Nefrología' } = route?.params || {};
  const { canEdit } = useAuth();

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
        if (!newMatrix[editCell.empId]) newMatrix[editCell.empId] = {};
        newMatrix[editCell.empId] = { ...newMatrix[editCell.empId], [editCell.day]: code };
        return { ...prev, matrix: newMatrix };
      });
      setSnack('Turno actualizado');
    } catch (e) {
      setSnack('Error al guardar el turno');
    } finally {
      setSaving(false);
      setEditCell(null);
    }
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
      const res = printSchedule({
        dept,
        year, month,
        employees: empsToPrint,
        matrix,
        dailyCounts,
        employeeTotals,
        puesto,
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
});
