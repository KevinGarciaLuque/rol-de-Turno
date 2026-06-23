import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Modal, Portal, TextInput, Button, Chip, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { CATEGORY_LABELS, CATEGORY_COLOR, ROLE_LABELS } from '../constants/shifts';
import { COLORS } from '../constants/theme';

const CATEGORY_KEYS = ['licenciada', 'auxiliar', 'servicio_social', 'hd_profesional', 'hd_auxiliar'];
const ROLE_KEYS = ['rotativa', 'jefe_sala', 'servicio_social'];
const emptyForm = { name: '', clave: '', category: 'auxiliar', role: 'rotativa', observations: '' };

// Gestión de personal de UN área (área fija). Para usar desde el Horario.
export default function AreaStaffManager({ visible, onDismiss, departmentId, departmentName, canEdit, onChanged }) {
  const [emps, setEmps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState('');

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try { setEmps(await api.getEmployees({ department_id: departmentId })); }
    catch (e) { setSnack('No se pudo cargar el personal'); }
    finally { setLoading(false); }
  }, [departmentId]);

  useEffect(() => { if (visible) { setSearch(''); load(); } }, [visible, load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormVisible(true); };
  const openEdit = (e) => {
    setEditing(e);
    setForm({ name: e.name, clave: e.clave || '', category: e.category, role: e.role || 'rotativa', observations: e.observations || '' });
    setFormVisible(true);
  };

  const save = async () => {
    if (!form.name.trim()) return setSnack('El nombre es obligatorio');
    setSaving(true);
    try {
      const payload = {
        department_id: departmentId,
        name: form.name.trim(),
        clave: form.clave.trim() || null,
        category: form.category,
        role: form.role,
        observations: form.observations.trim() || null,
      };
      if (editing) { await api.updateEmployee(editing.id, { ...payload, is_active: 1 }); setSnack('Empleada actualizada'); }
      else { await api.createEmployee(payload); setSnack('Empleada agregada'); }
      setFormVisible(false);
      await load();
      onChanged && onChanged();
    } catch (e) { setSnack(e.response?.data?.error || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  const deactivate = async (e) => {
    try { await api.deleteEmployee(e.id); setSnack('Empleada dada de baja'); setFormVisible(false); await load(); onChanged && onChanged(); }
    catch (err) { setSnack(err.response?.data?.error || 'No se pudo dar de baja'); }
  };

  const filtered = emps.filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()) || (e.clave || '').includes(search));

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Personal del área</Text>
            <Text style={styles.sub}>{departmentName}</Text>
          </View>
          <TouchableOpacity onPress={onDismiss}><Ionicons name="close" size={24} color={COLORS.textLight} /></TouchableOpacity>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={COLORS.textLight} />
          <TextInput
            mode="flat" placeholder="Buscar..." value={search} onChangeText={setSearch}
            style={styles.searchInput} underlineColor="transparent" activeUnderlineColor="transparent" dense
          />
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 24 }} />
        ) : (
          <ScrollView style={{ maxHeight: 360 }}>
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={36} color={COLORS.textLight} />
                <Text style={styles.emptyText}>Sin personal todavía. Usa "Agregar".</Text>
              </View>
            ) : filtered.map(e => (
              <TouchableOpacity key={e.id} style={styles.row} onPress={() => canEdit && openEdit(e)} activeOpacity={canEdit ? 0.7 : 1}>
                <View style={[styles.avatar, { backgroundColor: CATEGORY_COLOR[e.category] || COLORS.primary }]}>
                  <Text style={styles.avatarText}>{e.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{e.name}</Text>
                  <Text style={styles.rowMeta}>{CATEGORY_LABELS[e.category] || e.category}{e.clave ? ` · ${e.clave}` : ''}</Text>
                </View>
                {canEdit && <Ionicons name="create-outline" size={18} color={COLORS.textLight} />}
              </TouchableOpacity>
            ))}
            <View style={{ height: 8 }} />
          </ScrollView>
        )}

        {canEdit && (
          <Button mode="contained" icon="account-plus" onPress={openCreate} style={{ marginTop: 10 }}>Agregar empleada</Button>
        )}
      </Modal>

      {/* Formulario alta/edición (área fija) */}
      <Modal visible={formVisible} onDismiss={() => setFormVisible(false)} contentContainerStyle={styles.modal}>
        <ScrollView>
          <Text style={styles.title}>{editing ? 'Editar empleada' : 'Nueva empleada'}</Text>
          <Text style={styles.sub}>Área: {departmentName}</Text>

          <TextInput label="Nombre completo" value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} mode="outlined" style={styles.input} />
          <TextInput label="Clave (opcional)" value={form.clave} onChangeText={v => setForm(f => ({ ...f, clave: v }))} mode="outlined" autoCapitalize="characters" style={styles.input} />

          <Text style={styles.fieldLabel}>Categoría</Text>
          <View style={styles.chipWrap}>
            {CATEGORY_KEYS.map(c => (
              <Chip key={c} selected={form.category === c} onPress={() => setForm(f => ({ ...f, category: c }))} showSelectedCheck style={styles.chip}>
                {CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Rol</Text>
          <View style={styles.chipWrap}>
            {ROLE_KEYS.map(r => (
              <Chip key={r} selected={form.role === r} onPress={() => setForm(f => ({ ...f, role: r }))} showSelectedCheck style={styles.chip}>
                {ROLE_LABELS[r]}
              </Chip>
            ))}
          </View>

          <TextInput label="Observaciones (opcional)" value={form.observations} onChangeText={v => setForm(f => ({ ...f, observations: v }))} mode="outlined" multiline numberOfLines={2} style={styles.input} />

          <View style={styles.formActions}>
            {editing && <Button mode="text" textColor={COLORS.danger} onPress={() => deactivate(editing)}>Dar de baja</Button>}
            <View style={{ flex: 1 }} />
            <Button mode="text" onPress={() => setFormVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Guardar</Button>
          </View>
        </ScrollView>
      </Modal>

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={2500}>{snack}</Snackbar>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { margin: 16, alignSelf: 'center', width: '100%', maxWidth: 560, backgroundColor: COLORS.surface, borderRadius: 18, padding: 18, maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textLight, marginTop: 2 },

  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F3F5', borderRadius: 10, paddingHorizontal: 10, marginBottom: 8 },
  searchInput: { flex: 1, backgroundColor: 'transparent', height: 40 },

  empty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyText: { color: COLORS.textLight },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowMeta: { fontSize: 12, color: COLORS.textLight, marginTop: 1 },

  input: { marginBottom: 10, backgroundColor: '#fff' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 6, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  chip: { marginBottom: 4 },
  formActions: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 4 },
});
