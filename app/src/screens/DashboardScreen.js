import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { MONTHS_ES, DAYS_ES } from '../constants/shifts';
import { COLORS } from '../constants/theme';

const TODAY = new Date();

// Ícono + color elegante según el tipo de área (se adapta a áreas nuevas por su nombre)
function getAreaVisual(name = '') {
  const n = name.toLowerCase();
  if (n.includes('nefro'))                                return { icon: 'water',     color: '#1565C0' };
  if (n.includes('hemo') || n.includes('diál') || n.includes('dial')) return { icon: 'git-network', color: '#00897B' };
  if (n.includes('ucip') || n.includes('uci') || n.includes('intensiv')) return { icon: 'heart',  color: '#C62828' };
  if (n.includes('hospital') || n.includes('intern'))     return { icon: 'bed',       color: '#6A1B9A' };
  if (n.includes('consulta') || n.includes('externa'))    return { icon: 'clipboard', color: '#EF6C00' };
  if (n.includes('emerg') || n.includes('urgenc'))        return { icon: 'medkit',    color: '#D84315' };
  if (n.includes('cirug') || n.includes('quir'))          return { icon: 'cut',       color: '#283593' };
  if (n.includes('neonat') || n.includes('pediatr'))      return { icon: 'happy',     color: '#AD1457' };
  if (n.includes('labor'))                                return { icon: 'flask',     color: '#00838F' };
  if (n.includes('farmac'))                               return { icon: 'bandage',   color: '#2E7D32' };
  return { icon: 'medical', color: COLORS.primary };
}

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
  const dowIndex = TODAY.getDay();

  const totalStaff = Object.values(schedules).reduce((acc, s) => acc + (s?.employees?.length || 0), 0);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero card */}
      <Surface style={styles.hero} elevation={4}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconCircle}>
            <Ionicons name="medical" size={26} color="#fff" />
          </View>
          <View style={styles.heroTitle}>
            <Text style={styles.heroHospital}>Hospital María</Text>
            <Text style={styles.heroSubtitle}>Especialidades Pediátricas</Text>
          </View>
        </View>
        <View style={styles.heroDate}>
          <Ionicons name="calendar-outline" size={16} color="#fff" />
          <Text style={styles.heroDay}>{DAYS_ES[dowIndex]}, {todayDay} de {MONTHS_ES[TODAY.getMonth()]} {TODAY.getFullYear()}</Text>
        </View>
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{departments.length}</Text>
            <Text style={styles.heroStatLabel}>Áreas</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{totalStaff}</Text>
            <Text style={styles.heroStatLabel}>Personal</Text>
          </View>
        </View>
      </Surface>

      {/* Áreas — cuadrícula de tarjetas */}
      <Text style={styles.sectionTitle}>Áreas</Text>
      <View style={styles.areaGrid}>
        {departments.map(dept => {
          const { icon, color } = getAreaVisual(dept.name);
          const sched = schedules[dept.id];
          const empCount = sched?.employees?.length || 0;
          const todayCounts = sched?.dailyCounts?.[todayDay] || {};
          return (
            <TouchableOpacity
              key={dept.id}
              style={styles.areaCardWrap}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Schedule', { departmentId: dept.id, departmentName: dept.name })}
            >
              <Surface style={styles.areaCard} elevation={2}>
                <View style={styles.areaTopRow}>
                  <View style={[styles.areaIcon, { backgroundColor: color + '18' }]}>
                    <Ionicons name={icon} size={26} color={color} />
                  </View>
                  <View style={[styles.areaBadge, { backgroundColor: color + '14' }]}>
                    <Ionicons name="people" size={13} color={color} />
                    <Text style={[styles.areaBadgeText, { color }]}>{empCount}</Text>
                  </View>
                </View>

                <View style={styles.areaMid}>
                  <Text style={styles.areaName} numberOfLines={2}>{dept.name}</Text>
                  <Text style={styles.areaSup} numberOfLines={1}>{dept.supervisor || 'Sin supervisor'}</Text>
                </View>

                <View style={styles.areaFooter}>
                  <View style={styles.miniShifts}>
                    <MiniShift label="M" value={todayCounts.A || 0} color="#2E7D32" />
                    <MiniShift label="T" value={todayCounts.B || 0} color="#1565C0" />
                    <MiniShift label="N" value={todayCounts.C || 0} color="#6A1B9A" />
                  </View>
                  <Ionicons name="arrow-forward-circle" size={26} color={color} />
                </View>
              </Surface>
            </TouchableOpacity>
          );
        })}
      </View>

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

function MiniShift({ label, value, color }) {
  return (
    <View style={styles.miniShift}>
      <Text style={[styles.miniShiftValue, { color }]}>{value}</Text>
      <Text style={styles.miniShiftLabel}>{label}</Text>
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
    margin: 16, marginBottom: 8, borderRadius: 22,
    backgroundColor: COLORS.header, padding: 20,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  heroIconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: {},
  heroHospital: { fontSize: 21, fontWeight: '800', color: '#fff' },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  heroDate: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 12 },
  heroDay: { fontSize: 15, color: '#fff', fontWeight: '600', textTransform: 'capitalize' },
  heroStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 24, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)' },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginHorizontal: 16, marginTop: 16, marginBottom: 10 },

  areaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 },
  areaCardWrap: { width: 158, flexGrow: 1, maxWidth: 230 },
  areaCard: { flex: 1, minHeight: 168, borderRadius: 20, padding: 16, backgroundColor: COLORS.surface, justifyContent: 'space-between' },
  areaTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  areaIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  areaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 },
  areaBadgeText: { fontSize: 13, fontWeight: '800' },
  areaMid: { marginTop: 12 },
  areaName: { fontSize: 16, fontWeight: '800', color: COLORS.text, lineHeight: 20 },
  areaSup: { fontSize: 12, color: COLORS.textLight, marginTop: 3 },
  areaFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 },
  miniShifts: { flexDirection: 'row', gap: 10 },
  miniShift: { alignItems: 'center' },
  miniShiftValue: { fontSize: 14, fontWeight: '800' },
  miniShiftLabel: { fontSize: 9, color: COLORS.textLight, fontWeight: '600' },

  legend: { margin: 16, borderRadius: 16, padding: 16, backgroundColor: COLORS.surface },
  legendTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { width: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 36, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  legendCode: { fontSize: 10, fontWeight: '800', color: '#fff' },
  legendLabel: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  legendDesc: { fontSize: 10, color: COLORS.textLight },
});
