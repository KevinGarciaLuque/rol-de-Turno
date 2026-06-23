import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { MONTHS_ES, CATEGORY_LABELS } from '../constants/shifts';
import { COLORS } from '../constants/theme';

const YEAR = 2026;
const MONTH = 6;

export default function ReportsScreen() {
  const [departments, setDepartments] = useState([]);
  const [scheduleData, setScheduleData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const depts = await api.getDepartments();
      setDepartments(depts);
      if (depts.length) setSelectedDept(depts[0].id);

      const data = {};
      await Promise.all(depts.map(async d => {
        data[d.id] = await api.getSchedule(d.id, YEAR, MONTH);
      }));
      setScheduleData(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const dept = departments.find(d => d.id === selectedDept);
  const data = scheduleData[selectedDept];
  const employees = data?.employees || [];
  const totals = data?.employeeTotals || {};
  const dailyCounts = data?.dailyCounts || {};

  const daysInMonth = new Date(YEAR, MONTH, 0).getDate();

  // Summary stats
  const totalShifts = { A: 0, B: 0, C: 0, L: 0, DE: 0, VAC: 0, special: 0 };
  employees.forEach(e => {
    const t = totals[e.id] || {};
    Object.keys(totalShifts).forEach(k => { totalShifts[k] += t[k] || 0; });
  });

  // Coverage: days with fewer than minimum staff
  const MIN_STAFF = 2;
  const lowCoverage = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const cnt = dailyCounts[d] || {};
    if ((cnt.A || 0) < MIN_STAFF || (cnt.B || 0) < MIN_STAFF || (cnt.C || 0) < MIN_STAFF) {
      lowCoverage.push(d);
    }
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.pageWrap}>
      {/* Department selector */}
      <Surface style={styles.deptSelector} elevation={2}>
        <Text style={styles.selectorLabel}>Área:</Text>
        {departments.map(d => (
          <TouchableOpacity key={d.id} style={[styles.deptTab, selectedDept === d.id && styles.deptTabActive]} onPress={() => setSelectedDept(d.id)}>
            <Text style={[styles.deptTabText, selectedDept === d.id && styles.deptTabTextActive]}>{d.short_name}</Text>
          </TouchableOpacity>
        ))}
      </Surface>

      <Text style={styles.periodLabel}>{dept?.name} · {MONTHS_ES[MONTH - 1]} {YEAR}</Text>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <SummaryCard icon="people" label="Total Personal" value={employees.length} color={COLORS.primary} />
        <SummaryCard icon="alert-circle" label="Días Baja Cobertura" value={lowCoverage.length} color={lowCoverage.length > 0 ? COLORS.danger : COLORS.success} />
      </View>

      <View style={styles.shiftsGrid}>
        <ShiftSummaryCard label="Turno A" value={totalShifts.A} color="#2E7D32" bg="#E8F5E9" />
        <ShiftSummaryCard label="Turno B" value={totalShifts.B} color="#1565C0" bg="#E3F2FD" />
        <ShiftSummaryCard label="Turno C" value={totalShifts.C} color="#6A1B9A" bg="#F3E5F5" />
        <ShiftSummaryCard label="Libres"  value={totalShifts.L} color="#757575" bg="#F5F5F5" />
        <ShiftSummaryCard label="Vac."    value={totalShifts.VAC} color="#0277BD" bg="#E1F5FE" />
        <ShiftSummaryCard label="D. Extra" value={totalShifts.DE} color="#E65100" bg="#FBE9E7" />
      </View>

      {/* Low coverage days */}
      {lowCoverage.length > 0 && (
        <Surface style={[styles.alertBox, { borderLeftColor: COLORS.danger }]} elevation={1}>
          <View style={styles.alertHeader}>
            <Ionicons name="warning" size={20} color={COLORS.danger} />
            <Text style={styles.alertTitle}>Días con cobertura insuficiente</Text>
          </View>
          <Text style={styles.alertSub}>Menos de {MIN_STAFF} enfermeras por turno</Text>
          <View style={styles.alertDays}>
            {lowCoverage.map(d => (
              <View key={d} style={styles.alertDay}>
                <Text style={styles.alertDayNum}>{d}</Text>
              </View>
            ))}
          </View>
        </Surface>
      )}

      {/* Per-employee totals */}
      <Surface style={styles.table} elevation={1}>
        <View style={styles.tableHeader}>
          <Text style={[styles.thCell, { flex: 2 }]}>Empleada</Text>
          <Text style={styles.thCell}>A</Text>
          <Text style={styles.thCell}>B</Text>
          <Text style={styles.thCell}>C</Text>
          <Text style={styles.thCell}>L</Text>
          <Text style={styles.thCell}>Vac</Text>
        </View>
        {employees.map((emp, idx) => {
          const t = totals[emp.id] || {};
          return (
            <View key={emp.id} style={[styles.tableRow, idx % 2 === 0 && { backgroundColor: '#FAFAFA' }]}>
              <View style={{ flex: 2 }}>
                <Text style={styles.tdName} numberOfLines={1}>{emp.name}</Text>
                <Text style={styles.tdCat}>{CATEGORY_LABELS[emp.category] || emp.category}</Text>
              </View>
              <Text style={[styles.tdCell, { color: '#2E7D32' }]}>{t.A || 0}</Text>
              <Text style={[styles.tdCell, { color: '#1565C0' }]}>{t.B || 0}</Text>
              <Text style={[styles.tdCell, { color: '#6A1B9A' }]}>{t.C || 0}</Text>
              <Text style={[styles.tdCell, { color: '#757575' }]}>{t.L || 0}</Text>
              <Text style={[styles.tdCell, { color: '#0277BD' }]}>{t.VAC || 0}</Text>
            </View>
          );
        })}
      </Surface>

      <View style={{ height: 24 }} />
      </View>
    </ScrollView>
  );
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <Surface style={[styles.summaryCard, { borderTopColor: color }]} elevation={1}>
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Surface>
  );
}

function ShiftSummaryCard({ label, value, color, bg }) {
  return (
    <View style={[styles.shiftCard, { backgroundColor: bg }]}>
      <Text style={[styles.shiftValue, { color }]}>{value}</Text>
      <Text style={[styles.shiftLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pageWrap: { maxWidth: 1080, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  deptSelector: { flexDirection: 'row', alignItems: 'center', margin: 12, padding: 8, borderRadius: 14, backgroundColor: COLORS.surface, gap: 8 },
  selectorLabel: { fontSize: 13, color: COLORS.textLight, marginRight: 4 },
  deptTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.bg },
  deptTabActive: { backgroundColor: COLORS.primary },
  deptTabText: { fontSize: 14, fontWeight: '600', color: COLORS.textLight },
  deptTabTextActive: { color: '#fff' },

  periodLabel: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginHorizontal: 16, marginBottom: 12 },

  summaryRow: { flexDirection: 'row', marginHorizontal: 12, gap: 12, marginBottom: 12 },
  summaryCard: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: 'center', gap: 4, borderTopWidth: 3 },
  summaryValue: { fontSize: 28, fontWeight: '800' },
  summaryLabel: { fontSize: 12, color: COLORS.textLight, textAlign: 'center' },

  shiftsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 12, gap: 10, marginBottom: 12 },
  shiftCard: { width: '31%', borderRadius: 12, padding: 12, alignItems: 'center' },
  shiftValue: { fontSize: 22, fontWeight: '800' },
  shiftLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  alertBox: { marginHorizontal: 12, marginBottom: 12, padding: 16, borderRadius: 14, backgroundColor: '#FFF5F5', borderLeftWidth: 4 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  alertTitle: { fontSize: 15, fontWeight: '700', color: COLORS.danger },
  alertSub: { fontSize: 12, color: COLORS.textLight, marginBottom: 10 },
  alertDays: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  alertDay: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center' },
  alertDayNum: { color: '#fff', fontWeight: '700', fontSize: 12 },

  table: { marginHorizontal: 12, borderRadius: 14, overflow: 'hidden', backgroundColor: COLORS.surface },
  tableHeader: { flexDirection: 'row', backgroundColor: COLORS.header, paddingHorizontal: 12, paddingVertical: 10 },
  thCell: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  tdName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  tdCat: { fontSize: 10, color: COLORS.textLight },
  tdCell: { flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
