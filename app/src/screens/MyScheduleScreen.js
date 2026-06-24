import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Surface, SegmentedButtons, Portal, Modal } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { COLORS } from '../constants/theme';
import { getShift, MONTHS_ES } from '../constants/shifts';
import { useShifts } from '../context/ShiftsContext';
import { useAuth } from '../context/AuthContext';

// Cabecera de días con la semana iniciando en Lunes
const WEEK_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Construye las semanas del mes (lunes a domingo). Cada celda: { day } o null (relleno).
function buildWeeks(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  // getDay(): 0=Dom..6=Sáb → lo pasamos a 0=Lun..6=Dom
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export default function MyScheduleScreen() {
  const { employee } = useAuth();
  const { version } = useShifts(); // re-render si el admin cambia colores/etiquetas de turnos
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 720; // escritorio / tablet apaisada
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState('month'); // 'month' | 'week'
  const [weekIndex, setWeekIndex] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState(null); // { day, code }

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  const load = useCallback(async () => {
    try {
      const d = await api.getMySchedule(year, month);
      setData(d);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [year, month]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Mantener weekIndex dentro de rango al cambiar de mes/vista
  useEffect(() => { setWeekIndex(w => Math.min(w, weeks.length - 1)); }, [weeks.length]);

  const days = data?.days || {};
  const published = !!data?.published;
  const codeFor = (d) => days[d] || 'L'; // sin entrada = Libre (convención del sistema)

  // Totales del mes calculados sobre todos los días (incluye Libres)
  const totals = useMemo(() => {
    if (!published) return [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const tally = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const c = codeFor(d);
      tally[c] = (tally[c] || 0) + 1;
    }
    return Object.entries(tally).sort((a, b) => b[1] - a[1]);
  }, [published, days, year, month, version]);

  const goPrev = () => {
    if (view === 'week') {
      if (weekIndex > 0) { setWeekIndex(weekIndex - 1); return; }
      // Primera semana → mes anterior, última semana
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      setWeekIndex(buildWeeks(y, m).length - 1);
      setMonth(m); setYear(y);
      return;
    }
    if (month === 1) { setMonth(12); setYear(year - 1); } else setMonth(month - 1);
  };

  const goNext = () => {
    if (view === 'week') {
      if (weekIndex < weeks.length - 1) { setWeekIndex(weekIndex + 1); return; }
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      setWeekIndex(0);
      setMonth(m); setYear(y);
      return;
    }
    if (month === 12) { setMonth(1); setYear(year + 1); } else setMonth(month + 1);
  };

  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear()); setMonth(t.getMonth() + 1); setWeekIndex(0);
  };

  const isToday = (d) => {
    const t = new Date();
    return d === t.getDate() && month === t.getMonth() + 1 && year === t.getFullYear();
  };

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scroll, isWide && styles.scrollWide]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        {/* Encabezado del usuario */}
        <Surface style={styles.hero} elevation={2}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>
              {(employee?.name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName} numberOfLines={1}>{employee?.name || 'Mi Horario'}</Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              <Ionicons name="business-outline" size={12} color="rgba(255,255,255,0.85)" /> {employee?.department_name || ''}
            </Text>
          </View>
        </Surface>

        {/* Controles (vista + navegación). En escritorio se mantienen compactos y centrados. */}
        <View style={isWide && styles.controlsWide}>
          <View style={styles.viewToggle}>
            <SegmentedButtons
              value={view}
              onValueChange={setView}
              buttons={[
                { value: 'month', label: 'Mes', icon: 'calendar-month' },
                { value: 'week', label: 'Semana', icon: 'calendar-week' },
              ]}
            />
          </View>

          {/* Navegación de mes/semana */}
          <View style={styles.navBar}>
            <TouchableOpacity onPress={goPrev} style={styles.navBtn}><Ionicons name="chevron-back" size={22} color={COLORS.primary} /></TouchableOpacity>
            <TouchableOpacity onPress={goToday} style={styles.navTitleWrap} activeOpacity={0.7}>
              <Text style={styles.navTitle}>{MONTHS_ES[month - 1]} {year}</Text>
              <Text style={styles.navHint}>Toca para ir a hoy</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={goNext} style={styles.navBtn}><Ionicons name="chevron-forward" size={22} color={COLORS.primary} /></TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        ) : !published ? (
          <EmptyState month={month} year={year} />
        ) : (() => {
          // Piezas del contenido (se reordenan según el ancho de pantalla)
          const next = data?.nextShift ? <NextShiftCard nextShift={data.nextShift} /> : null;
          const calendar = view === 'month'
            ? <MonthGrid weeks={weeks} codeFor={codeFor} isToday={isToday} isWide={isWide} onPick={(d) => setDetail({ day: d, code: codeFor(d) })} />
            : <WeekList week={weeks[Math.min(weekIndex, weeks.length - 1)] || []} month={month} year={year} codeFor={codeFor} isToday={isToday} onPick={(d) => setDetail({ day: d, code: codeFor(d) })} />;
          const summary = totals.length > 0 ? <MonthSummary totals={totals} /> : null;
          const legend = <Legend codes={totals.map(([c]) => c)} />;

          // Escritorio/tablet apaisada: dos columnas (calendario | panel lateral)
          if (isWide) {
            return (
              <View style={styles.twoCol}>
                <View style={styles.leftCol}>{calendar}</View>
                <View style={styles.rightCol}>
                  {next}
                  {summary}
                  {legend}
                </View>
              </View>
            );
          }

          // Móvil: una sola columna
          return (
            <>
              {next}
              {calendar}
              {summary}
              {legend}
            </>
          );
        })()}
        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Detalle de un día */}
      <Portal>
        <Modal visible={!!detail} onDismiss={() => setDetail(null)} contentContainerStyle={styles.detailModal}>
          {detail && <DayDetail day={detail.day} code={detail.code} month={month} year={year} />}
        </Modal>
      </Portal>
    </View>
  );
}

/* --------------------------- Subcomponentes --------------------------- */

function NextShiftCard({ nextShift }) {
  const sh = getShift(nextShift.shift_code);
  const date = new Date(nextShift.date);
  const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][date.getDay()];
  return (
    <Surface style={[styles.nextCard, { backgroundColor: sh.color }]} elevation={3}>
      <View style={styles.nextIcon}><Ionicons name="alarm-outline" size={26} color="#fff" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.nextLabel}>TU PRÓXIMO TURNO</Text>
        <Text style={styles.nextTitle}>{dayName} {nextShift.day}</Text>
        <Text style={styles.nextDesc}>
          {sh.description}{sh.startTime && sh.endTime ? '' : ''}
        </Text>
      </View>
      <View style={[styles.nextBadge]}>
        <Text style={[styles.nextBadgeText, { color: sh.textColor }]}>{sh.cellText}</Text>
      </View>
    </Surface>
  );
}

function MonthGrid({ weeks, codeFor, isToday, isWide, onPick }) {
  // En escritorio las celdas se hacen rectangulares (más anchas que altas) para
  // que no queden como cuadrados gigantes; en móvil se mantienen cuadradas.
  const cellShape = isWide && { aspectRatio: 1.5 };
  return (
    <Surface style={styles.card} elevation={1}>
      <View style={styles.weekHeader}>
        {WEEK_LABELS.map((l, i) => (
          <Text key={i} style={[styles.weekHeaderCell, (i >= 5) && styles.weekend]}>{l}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell, ci) => {
            if (!cell) return <View key={ci} style={[styles.dayCell, cellShape]} />;
            const sh = getShift(codeFor(cell.day));
            const today = isToday(cell.day);
            return (
              <TouchableOpacity key={ci} style={[styles.dayCell, cellShape]} activeOpacity={0.7} onPress={() => onPick(cell.day)}>
                <View style={[styles.dayInner, { backgroundColor: sh.color }, today && styles.dayToday]}>
                  <Text style={[styles.dayNum, { color: sh.textColor }]}>{cell.day}</Text>
                  <Text style={[styles.dayCode, { color: sh.textColor }]} numberOfLines={1}>{sh.cellText}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </Surface>
  );
}

function WeekList({ week, month, year, codeFor, isToday, onPick }) {
  const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const items = week.map((cell, i) => ({ cell, dow: DOW[i] })).filter(x => x.cell);
  return (
    <Surface style={styles.card} elevation={1}>
      {items.map(({ cell, dow }) => {
        const sh = getShift(codeFor(cell.day));
        const today = isToday(cell.day);
        const hours = sh.startTime && sh.endTime ? `${sh.startTime} – ${sh.endTime}` : (sh.isWork ? 'Sin horario' : '');
        return (
          <TouchableOpacity key={cell.day} activeOpacity={0.7} onPress={() => onPick(cell.day)}
            style={[styles.weekItem, today && styles.weekItemToday]}>
            <View style={styles.weekDate}>
              <Text style={[styles.weekDow, today && { color: COLORS.primary }]}>{dow}</Text>
              <Text style={[styles.weekDayNum, today && { color: COLORS.primary }]}>{cell.day}</Text>
            </View>
            <View style={[styles.weekSwatch, { backgroundColor: sh.color }]}>
              <Text style={[styles.weekSwatchText, { color: sh.textColor }]}>{sh.cellText}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.weekShiftName}>{sh.description}</Text>
              {!!hours && <Text style={styles.weekHours}>{hours}</Text>}
            </View>
            {today && <View style={styles.todayChip}><Text style={styles.todayChipText}>HOY</Text></View>}
          </TouchableOpacity>
        );
      })}
    </Surface>
  );
}

function DayDetail({ day, code, month, year }) {
  const sh = getShift(code);
  const date = new Date(year, month - 1, day);
  const dayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][date.getDay()];
  const hours = sh.startTime && sh.endTime ? `${sh.startTime} – ${sh.endTime}` : null;
  return (
    <View>
      <View style={[styles.detailHeader, { backgroundColor: sh.color }]}>
        <Text style={[styles.detailCode, { color: sh.textColor }]}>{sh.cellText}</Text>
      </View>
      <Text style={styles.detailDate}>{dayName} {day} de {MONTHS_ES[month - 1]}</Text>
      <Text style={styles.detailDesc}>{sh.description}</Text>
      {hours ? (
        <View style={styles.detailHours}>
          <Ionicons name="time-outline" size={16} color={COLORS.primary} />
          <Text style={styles.detailHoursText}>{hours}</Text>
        </View>
      ) : (
        <View style={styles.detailHours}>
          <Ionicons name={sh.isWork ? 'briefcase-outline' : 'cafe-outline'} size={16} color={COLORS.textLight} />
          <Text style={[styles.detailHoursText, { color: COLORS.textLight }]}>{sh.isWork ? 'Turno de trabajo' : 'Día libre / ausencia'}</Text>
        </View>
      )}
    </View>
  );
}

function MonthSummary({ totals }) {
  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.cardTitle}>Resumen del mes</Text>
      <View style={styles.totalsWrap}>
        {totals.map(([code, n]) => {
          const sh = getShift(code);
          return (
            <View key={code} style={styles.totalPill}>
              <View style={[styles.totalDot, { backgroundColor: sh.color }]} />
              <Text style={styles.totalLabel}>{sh.cellText}</Text>
              <Text style={styles.totalCount}>{n}</Text>
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

function Legend({ codes }) {
  if (!codes.length) return null;
  return (
    <Surface style={styles.card} elevation={1}>
      <Text style={styles.cardTitle}>Leyenda</Text>
      <View style={styles.legendWrap}>
        {codes.map(code => {
          const sh = getShift(code);
          return (
            <View key={code} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: sh.color }]} />
              <Text style={styles.legendText}>{sh.cellText} · {sh.description}</Text>
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

function EmptyState({ month, year }) {
  return (
    <Surface style={[styles.card, styles.empty]} elevation={1}>
      <Ionicons name="calendar-outline" size={54} color={COLORS.textLight} />
      <Text style={styles.emptyTitle}>Aún no hay rol publicado</Text>
      <Text style={styles.emptyText}>
        El rol de {MONTHS_ES[month - 1]} {year} todavía no ha sido aprobado y firmado por tu jefatura.
        Aparecerá aquí en cuanto esté listo.
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollView: { flex: 1, width: '100%' },
  scroll: { padding: 14, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center' },
  scrollWide: { maxWidth: 1000, paddingHorizontal: 24 },
  center: { padding: 40, alignItems: 'center' },

  // Escritorio: controles compactos arriba + dos columnas debajo
  controlsWide: { maxWidth: 680, width: '100%', alignSelf: 'center' },
  twoCol: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  leftCol: { flex: 1, minWidth: 0 },
  rightCol: { width: 320 },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, backgroundColor: COLORS.header, marginBottom: 14 },
  heroAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroAvatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroName: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroMeta: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 3 },

  viewToggle: { marginBottom: 12 },

  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 1 },
  navTitleWrap: { alignItems: 'center' },
  navTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, textTransform: 'capitalize' },
  navHint: { fontSize: 10, color: COLORS.textLight, marginTop: 1 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 10 },

  // Próximo turno
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, marginBottom: 14 },
  nextIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  nextLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  nextTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textTransform: 'capitalize' },
  nextDesc: { color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 1 },
  nextBadge: { backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 48, alignItems: 'center' },
  nextBadgeText: { fontSize: 16, fontWeight: '900' },

  // Calendario mensual
  weekHeader: { flexDirection: 'row', marginBottom: 6 },
  weekHeaderCell: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '800', color: COLORS.textLight },
  weekend: { color: COLORS.danger },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, aspectRatio: 1, padding: 2 },
  dayInner: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 2 },
  dayToday: { borderWidth: 2.5, borderColor: '#FFD600' },
  dayNum: { fontSize: 13, fontWeight: '800' },
  dayCode: { fontSize: 10, fontWeight: '700', marginTop: 1 },

  // Vista semanal
  weekItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  weekItemToday: { backgroundColor: '#FFFDE7', borderRadius: 10, paddingHorizontal: 8 },
  weekDate: { width: 42, alignItems: 'center' },
  weekDow: { fontSize: 11, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase' },
  weekDayNum: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  weekSwatch: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  weekSwatchText: { fontSize: 15, fontWeight: '900' },
  weekShiftName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  weekHours: { fontSize: 12, color: COLORS.textLight, marginTop: 1 },
  todayChip: { backgroundColor: COLORS.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  todayChipText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // Totales
  totalsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  totalPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F7FA', borderRadius: 20, paddingLeft: 8, paddingRight: 12, paddingVertical: 6 },
  totalDot: { width: 12, height: 12, borderRadius: 6 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  totalCount: { fontSize: 13, fontWeight: '900', color: COLORS.primary },

  // Leyenda
  legendWrap: { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendSwatch: { width: 20, height: 20, borderRadius: 6 },
  legendText: { fontSize: 13, color: COLORS.text },

  // Detalle de día
  detailModal: { margin: 24, alignSelf: 'center', width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  detailHeader: { height: 70, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  detailCode: { fontSize: 28, fontWeight: '900' },
  detailDate: { fontSize: 17, fontWeight: '800', color: COLORS.text, textTransform: 'capitalize' },
  detailDesc: { fontSize: 14, color: COLORS.text, marginTop: 4 },
  detailHours: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  detailHoursText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  // Vacío
  empty: { alignItems: 'center', padding: 30, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  emptyText: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 19 },
});
