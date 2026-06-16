import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { MONTHS_ES, DAYS_ES } from '../constants/shifts';
import { COLORS } from '../constants/theme';

const TODAY = new Date();

export default function DashboardScreen({ navigation }) {
  const [departments, setDepartments] = useState([]);
  const [schedules, setSchedules]     = useState({});
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setError(null);
      const depts = await api.getDepartments();
      setDepartments(depts);

      const scheds = {};
      await Promise.all(depts.map(async d => {
        const s = await api.getSchedule(d.id, TODAY.getFullYear(), TODAY.getMonth() + 1);
        scheds[d.id] = s;
      }));
      setSchedules(scheds);
    } catch (e) {
      setError('No se pudo conectar. Verifica que el backend esté corriendo.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingText}>Cargando dashboard...</Text>
    </View>
  );

  if (error) return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={64} color={COLORS.textLight} />
      <Text style={styles.errorTitle}>Sin conexión</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
        <Text style={styles.retryText}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  );

  const todayDay = TODAY.getDate();
  const todayMonth = TODAY.getMonth() + 1;
  const todayYear = TODAY.getFullYear();
  const dowIndex = TODAY.getDay();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero card */}
      <Surface style={styles.hero} elevation={4}>
        <View style={styles.heroTop}>
          <Ionicons name="medical" size={28} color="#fff" />
          <View style={styles.heroTitle}>
            <Text style={styles.heroHospital}>Hospital María</Text>
            <Text style={styles.heroSubtitle}>Especialidades Pediátricas</Text>
          </View>
        </View>
        <View style={styles.heroDate}>
          <Text style={styles.heroDay}>{DAYS_ES[dowIndex]}, {todayDay} de {MONTHS_ES[todayMonth - 1]} {todayYear}</Text>
        </View>
      </Surface>

      {/* Department cards */}
      <Text style={styles.sectionTitle}>Áreas</Text>
      {departments.map(dept => {
        const sched = schedules[dept.id];
        const empCount = sched?.employees?.length || 0;
        const todayCounts = sched?.dailyCounts?.[todayDay] || {};
        return (
          <Surface key={dept.id} style={styles.deptCard} elevation={2}>
            <View style={styles.deptHeader}>
              <View style={[styles.deptIcon, { backgroundColor: dept.id === 1 ? COLORS.primary : COLORS.secondary }]}>
                <Ionicons name={dept.id === 1 ? 'water-outline' : 'pulse-outline'} size={22} color="#fff" />
              </View>
              <View style={styles.deptInfo}>
                <Text style={styles.deptName}>{dept.name}</Text>
                <Text style={styles.deptSupervisor}>{dept.supervisor}</Text>
              </View>
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => navigation.navigate('Schedule', { departmentId: dept.id, departmentName: dept.name })}
              >
                <Text style={styles.viewBtnText}>Ver Rol</Text>
                <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.deptStats}>
              <StatCard label="Personal" value={empCount} icon="people-outline" color={COLORS.primary} />
              <StatCard label="T. Mañana" value={todayCounts.A || 0} icon="sunny-outline" color="#2E7D32" />
              <StatCard label="T. Tarde" value={todayCounts.B || 0} icon="partly-sunny-outline" color="#1565C0" />
              <StatCard label="T. Noche" value={todayCounts.C || 0} icon="moon-outline" color="#6A1B9A" />
            </View>
          </Surface>
        );
      })}

      {/* Legend */}
      <Surface style={styles.legend} elevation={1}>
        <Text style={styles.legendTitle}>Leyenda de Turnos</Text>
        <View style={styles.legendGrid}>
          {[
            { code: 'A', label: 'Turno A', color: '#2E7D32', desc: '7am - 3pm' },
            { code: 'B', label: 'Turno B', color: '#1565C0', desc: '3pm - 11pm' },
            { code: 'C', label: 'Turno C', color: '#6A1B9A', desc: '11pm - 7am' },
            { code: 'L', label: 'Libre',   color: '#757575', desc: 'Día de descanso' },
            { code: 'DE',label: 'D. Extra',color: '#E65100', desc: 'Descanso extra' },
            { code: 'TC',label: 'T. Comp', color: '#F57F17', desc: 'Compensatorio' },
            { code: 'VAC',label: 'Vac.',   color: '#0277BD', desc: 'Vacaciones ord.' },
            { code: 'INC',label: 'Incap.', color: '#B71C1C', desc: 'Incapacidad' },
          ].map(item => (
            <View key={item.code} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]}>
                <Text style={styles.legendCode}>{item.code}</Text>
              </View>
              <View>
                <Text style={styles.legendLabel}>{item.label}</Text>
                <Text style={styles.legendDesc}>{item.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </Surface>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: COLORS.bg },
  loadingText: { marginTop: 12, color: COLORS.textLight, fontSize: 15 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  errorText: { fontSize: 14, color: COLORS.textLight, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  retryBtn: { marginTop: 20, backgroundColor: COLORS.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  hero: {
    margin: 16, marginBottom: 8, borderRadius: 20,
    backgroundColor: COLORS.header, padding: 20,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  heroTitle: {},
  heroHospital: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  heroDate: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 10 },
  heroDay: { fontSize: 16, color: '#fff', fontWeight: '600', textTransform: 'capitalize' },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginHorizontal: 16, marginTop: 16, marginBottom: 8 },

  deptCard: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.surface },
  deptHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  deptIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deptInfo: { flex: 1 },
  deptName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  deptSupervisor: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.primaryContainer || '#E3F2FD' },
  viewBtnText: { color: COLORS.primary, fontWeight: '600', fontSize: 13 },
  deptStats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: COLORS.textLight, fontWeight: '500' },

  legend: { margin: 16, borderRadius: 16, padding: 16, backgroundColor: COLORS.surface },
  legendTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 36, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  legendCode: { fontSize: 10, fontWeight: '800', color: '#fff' },
  legendLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  legendDesc: { fontSize: 10, color: COLORS.textLight },
});
