import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Surface, FAB, Chip, Modal, Portal } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { CATEGORY_LABELS, CATEGORY_COLOR, ROLE_LABELS } from '../constants/shifts';
import { COLORS } from '../constants/theme';

export default function EmployeesScreen() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [selected, setSelected]   = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [emps, depts] = await Promise.all([api.getEmployees(), api.getDepartments()]);
      setEmployees(emps);
      setDepartments(depts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const categories = [...new Set(employees.map(e => e.category))];

  const filtered = employees.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.clave || '').includes(search);
    const matchCat  = filterCat === 'all' || e.category === filterCat;
    const matchDept = filterDept === 'all' || String(e.department_id) === String(filterDept);
    return matchSearch && matchCat && matchDept;
  });

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search */}
      <Surface style={styles.searchBar} elevation={2}>
        <Ionicons name="search" size={20} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o clave..."
          placeholderTextColor={COLORS.textLight}
          value={search}
          onChangeText={setSearch}
        />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color={COLORS.textLight} /></TouchableOpacity> : null}
      </Surface>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        <Chip selected={filterDept === 'all'} onPress={() => setFilterDept('all')} compact style={styles.chip}>Todos los Depts.</Chip>
        {departments.map(d => (
          <Chip key={d.id} selected={String(filterDept) === String(d.id)} onPress={() => setFilterDept(d.id)} compact style={styles.chip}>{d.short_name}</Chip>
        ))}
        <View style={{ width: 1, backgroundColor: COLORS.border, marginHorizontal: 4, height: '100%' }} />
        <Chip selected={filterCat === 'all'} onPress={() => setFilterCat('all')} compact style={styles.chip}>Todas Cat.</Chip>
        {categories.map(cat => (
          <Chip key={cat} selected={filterCat === cat} onPress={() => setFilterCat(cat)} compact style={[styles.chip, { borderColor: CATEGORY_COLOR[cat] }]}>{CATEGORY_LABELS[cat]}</Chip>
        ))}
      </ScrollView>

      <Text style={styles.count}>{filtered.length} empleada(s)</Text>

      {/* List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {filtered.map((emp, idx) => (
          <TouchableOpacity key={emp.id} onPress={() => setSelected(emp)} activeOpacity={0.8}>
            <Surface style={styles.empCard} elevation={1}>
              <View style={[styles.empAvatar, { backgroundColor: CATEGORY_COLOR[emp.category] || COLORS.primary }]}>
                <Text style={styles.empAvatarText}>
                  {emp.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </Text>
              </View>
              <View style={styles.empInfo}>
                <View style={styles.empNameRow}>
                  <Text style={styles.empName}>{emp.name}</Text>
                  {emp.role === 'jefe_sala' && <View style={styles.jefeBadge}><Text style={styles.jefeText}>Jefe</Text></View>}
                </View>
                <Text style={styles.empMeta}>
                  {emp.department_name} · Clave: {emp.clave || 'N/A'}
                </Text>
                <View style={styles.catRow}>
                  <View style={[styles.catBadge, { backgroundColor: CATEGORY_COLOR[emp.category] + '20', borderColor: CATEGORY_COLOR[emp.category] }]}>
                    <Text style={[styles.catText, { color: CATEGORY_COLOR[emp.category] }]}>
                      {CATEGORY_LABELS[emp.category] || emp.category}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
            </Surface>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Employee Detail Modal */}
      <Portal>
        <Modal visible={!!selected} onDismiss={() => setSelected(null)} contentContainerStyle={styles.modal}>
          {selected && (
            <ScrollView>
              <View style={[styles.modalHeader, { backgroundColor: CATEGORY_COLOR[selected.category] || COLORS.primary }]}>
                <View style={styles.modalAvatar}>
                  <Text style={styles.modalAvatarText}>
                    {selected.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modalName}>{selected.name}</Text>
                <Text style={styles.modalDept}>{selected.department_name}</Text>
              </View>

              <View style={styles.modalBody}>
                <InfoRow icon="id-card-outline" label="Clave"      value={selected.clave || 'N/A'} />
                <InfoRow icon="briefcase-outline" label="Categoría" value={CATEGORY_LABELS[selected.category] || selected.category} />
                <InfoRow icon="star-outline"     label="Rol"        value={ROLE_LABELS[selected.role] || selected.role} />
                {selected.observations && (
                  <InfoRow icon="document-text-outline" label="Observaciones" value={selected.observations} multiline />
                )}
              </View>

              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                <Text style={styles.closeBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </Modal>
      </Portal>
    </View>
  );
}

function InfoRow({ icon, label, value, multiline }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={COLORS.textLight} style={styles.infoIcon} />
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, multiline && { lineHeight: 18 }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 10, backgroundColor: COLORS.surface },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text },

  filterRow: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
  chip: { marginRight: 4 },

  count: { fontSize: 13, color: COLORS.textLight, marginHorizontal: 16, marginBottom: 8 },

  list: { paddingHorizontal: 12, paddingBottom: 80, gap: 8 },

  empCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: COLORS.surface, gap: 12 },
  empAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  empAvatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  empInfo: { flex: 1 },
  empNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  empName: { fontSize: 14, fontWeight: '700', color: COLORS.text, flex: 1 },
  empMeta: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  catRow: { flexDirection: 'row', marginTop: 4 },
  catBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  catText: { fontSize: 11, fontWeight: '600' },
  jefeBadge: { backgroundColor: '#FFF8E1', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  jefeText: { fontSize: 10, fontWeight: '700', color: '#F57F17' },

  modal: { margin: 20, backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden' },
  modalHeader: { padding: 24, alignItems: 'center' },
  modalAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  modalAvatarText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  modalName: { fontSize: 18, fontWeight: '800', color: '#fff', textAlign: 'center' },
  modalDept: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  modalBody: { padding: 20, gap: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoIcon: { marginTop: 2 },
  infoLabel: { fontSize: 11, color: COLORS.textLight, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: 15, color: COLORS.text, fontWeight: '500', marginTop: 2 },
  closeBtn: { margin: 20, marginTop: 4, backgroundColor: COLORS.primary, padding: 14, borderRadius: 14, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
