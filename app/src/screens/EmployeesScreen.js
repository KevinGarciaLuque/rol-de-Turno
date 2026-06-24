import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Surface, FAB, Chip, Modal, Portal, TextInput as PaperInput, Button, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { CATEGORY_LABELS, CATEGORY_COLOR, ROLE_LABELS } from '../constants/shifts';
import { ACCESS_ROLE_LABELS, ACCESS_ROLE_COLOR, APPROVAL_POSITIONS, APPROVAL_POSITION_LABELS } from '../constants/roles';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

const CATEGORY_KEYS = ['licenciada', 'auxiliar', 'servicio_social', 'hd_profesional', 'hd_auxiliar'];
const ROLE_KEYS = ['rotativa', 'jefe_sala', 'servicio_social'];

// Niveles de acceso que se pueden asignar desde la ficha del empleado.
// 'none' = sin cuenta. El resto corresponde a users.role.
const ACCESS_OPTIONS = [
  { value: 'none',       label: 'Sin cuenta',          desc: 'Solo aparece en el rol, no entra al sistema' },
  { value: 'lector',     label: 'Lector',              desc: 'Entra y ve únicamente su propio horario' },
  { value: 'jefe',       label: ACCESS_ROLE_LABELS.jefe,       desc: 'Gestiona y firma su propia sala' },
  { value: 'supervisor', label: ACCESS_ROLE_LABELS.supervisor, desc: 'Gestiona y edita su área' },
  { value: 'admin',      label: ACCESS_ROLE_LABELS.admin,      desc: 'Acceso total al sistema' },
];
const ACCESS_NEEDS_POSITION = ['jefe', 'supervisor']; // pueden firmar el rol
// Nivel de firma sugerido automáticamente según el rol de acceso (editable después).
const ACCESS_DEFAULT_POSITION = { jefe: 'jefe_area', supervisor: 'jefe_servicio' };

const emptyForm = {
  department_id: null, name: '', clave: '', category: 'auxiliar', role: 'rotativa', observations: '',
  // Acceso al sistema (solo admin)
  access: 'none', username: '', password: '', accountUserId: null, approval_position: '',
};

// Quita acentos para sugerir un nombre de usuario limpio
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
function stripAccents(s) {
  return (s || '').normalize('NFD').replace(DIACRITICS, '');
}
// Sugiere usuario a partir de la clave (preferido) o del nombre
function suggestUsername(name, clave) {
  if (clave && clave.trim()) return clave.trim().toLowerCase().replace(/\s+/g, '');
  const parts = stripAccents(name).toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}
// Contraseña temporal legible (sin caracteres ambiguos)
function tempPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let p = '';
  for (let i = 0; i < 8; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

export default function EmployeesScreen() {
  const { canEdit, isAdmin } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [selected, setSelected]   = useState(null);

  // Alta / edición
  const [formVisible, setFormVisible] = useState(false);
  const [editingEmp, setEditingEmp]   = useState(null);
  const [form, setForm]               = useState(emptyForm);
  const [saving, setSaving]           = useState(false);
  const [snack, setSnack]             = useState('');

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

  function openCreate() {
    setEditingEmp(null);
    setForm({ ...emptyForm, department_id: filterDept !== 'all' ? Number(filterDept) : (departments[0]?.id ?? null) });
    setFormVisible(true);
  }

  function openEdit(emp) {
    setSelected(null);
    setEditingEmp(emp);
    // Estado de la cuenta de acceso vinculada (si existe y está activa)
    const hasActiveAccount = !!emp.account_user_id && !!emp.account_is_active;
    setForm({
      department_id: emp.department_id,
      name: emp.name,
      clave: emp.clave || '',
      category: emp.category,
      role: emp.role || 'rotativa',
      observations: emp.observations || '',
      access: hasActiveAccount ? emp.account_role : 'none',
      username: emp.account_username || '',
      password: '',
      accountUserId: emp.account_user_id || null,
      approval_position: emp.account_approval_position || '',
    });
    setFormVisible(true);
  }

  // Al elegir un nivel de acceso, sugiere usuario/contraseña si la cuenta es nueva
  // y propone automáticamente su nivel de firma (se puede cambiar luego).
  function setAccess(access) {
    setForm(f => {
      const next = { ...f, access };
      if (access !== 'none' && !f.accountUserId) {
        if (!f.username) next.username = suggestUsername(f.name, f.clave);
        if (!f.password) next.password = tempPassword();
      }
      // Sugerencia de firma: solo si el rol firma y aún no hay una posición elegida.
      if (ACCESS_NEEDS_POSITION.includes(access) && !f.approval_position) {
        next.approval_position = ACCESS_DEFAULT_POSITION[access] || '';
      }
      return next;
    });
  }

  async function save() {
    if (!form.department_id) return setSnack('Selecciona un área');
    if (!form.name.trim())   return setSnack('El nombre es obligatorio');
    if (!form.category)      return setSnack('Selecciona una categoría');

    // Validación de la cuenta de acceso (solo admin)
    const managingAccount = isAdmin && form.access !== 'none';
    if (managingAccount) {
      if (!form.username.trim()) return setSnack('Escribe un nombre de usuario para la cuenta');
      if (!form.accountUserId && !form.password) return setSnack('Asigna una contraseña a la cuenta');
    }

    setSaving(true);
    try {
      const payload = {
        department_id: form.department_id,
        name: form.name.trim(),
        clave: form.clave.trim() || null,
        category: form.category,
        role: form.role,
        observations: form.observations.trim() || null,
      };

      // 1) Guardar la empleada (y obtener su id si es nueva)
      let empId = editingEmp?.id;
      if (editingEmp) {
        await api.updateEmployee(editingEmp.id, { ...payload, is_active: 1 });
      } else {
        const r = await api.createEmployee(payload);
        empId = r.id;
      }

      // 2) Gestionar la cuenta de acceso (solo admin)
      if (isAdmin) {
        const departments = form.access === 'admin' ? [] : [form.department_id];
        const approval_position = ACCESS_NEEDS_POSITION.includes(form.access) ? (form.approval_position || null) : null;

        if (form.access === 'none') {
          // Si había cuenta, se desactiva (no se borra, conserva historial)
          if (form.accountUserId) await api.updateUser(form.accountUserId, { is_active: 0 });
        } else if (form.accountUserId) {
          // Actualizar la cuenta existente
          const up = {
            full_name: form.name.trim(), role: form.access, departments,
            is_active: 1, employee_id: empId, approval_position,
          };
          if (form.password) up.password = form.password;
          await api.updateUser(form.accountUserId, up);
        } else {
          // Crear la cuenta nueva, ya vinculada a la empleada
          await api.createUser({
            username: form.username.trim(), password: form.password,
            full_name: form.name.trim(), role: form.access, departments,
            employee_id: empId, approval_position,
          });
        }
      }

      setSnack(editingEmp ? 'Empleada actualizada' : 'Empleada agregada');
      setFormVisible(false);
      loadData();
    } catch (e) {
      setSnack(e.response?.data?.error || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(emp) {
    try {
      await api.deleteEmployee(emp.id);
      setSnack('Empleada dada de baja');
      setSelected(null);
      loadData();
    } catch (e) {
      setSnack(e.response?.data?.error || 'No se pudo dar de baja');
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
      <View style={styles.pageWrap}>
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

      {/* Filters (se acomodan en varias líneas para que no se recorten) */}
      <View style={styles.filterRow}>
        <Chip selected={filterDept === 'all'} onPress={() => setFilterDept('all')} compact style={styles.chip}>Todos los Depts.</Chip>
        {departments.map(d => (
          <Chip key={d.id} selected={String(filterDept) === String(d.id)} onPress={() => setFilterDept(d.id)} compact style={styles.chip}>{d.short_name || d.name}</Chip>
        ))}
        <Chip selected={filterCat === 'all'} onPress={() => setFilterCat('all')} compact style={styles.chip}>Todas Cat.</Chip>
        {categories.map(cat => (
          <Chip key={cat} selected={filterCat === cat} onPress={() => setFilterCat(cat)} compact style={[styles.chip, { borderColor: CATEGORY_COLOR[cat] }]}>{CATEGORY_LABELS[cat]}</Chip>
        ))}
      </View>

      <Text style={styles.count}>{filtered.length} empleada(s)</Text>

      {/* List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {filtered.map((emp) => (
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
                  {emp.account_user_id && !!emp.account_is_active && (
                    <View style={[styles.acctBadge, { backgroundColor: (ACCESS_ROLE_COLOR[emp.account_role] || COLORS.primary) + '18' }]}>
                      <Ionicons name="key" size={9} color={ACCESS_ROLE_COLOR[emp.account_role] || COLORS.primary} />
                      <Text style={[styles.acctText, { color: ACCESS_ROLE_COLOR[emp.account_role] || COLORS.primary }]}>{ACCESS_ROLE_LABELS[emp.account_role] || emp.account_role}</Text>
                    </View>
                  )}
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
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB agregar (solo quien puede editar) */}
      {canEdit && (
        <FAB icon="account-plus" label="Agregar" style={styles.fab} color="#fff" onPress={openCreate} />
      )}
      </View>

      {/* Detalle de empleada */}
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
                {selected.account_user_id && !!selected.account_is_active && (
                  <InfoRow icon="key-outline" label="Acceso al sistema"
                    value={`@${selected.account_username} · ${ACCESS_ROLE_LABELS[selected.account_role] || selected.account_role}`} />
                )}
                {selected.observations && (
                  <InfoRow icon="document-text-outline" label="Observaciones" value={selected.observations} multiline />
                )}
              </View>

              {canEdit && (
                <View style={styles.detailActions}>
                  <Button mode="text" textColor={COLORS.danger} icon="account-off" onPress={() => deactivate(selected)}>Dar de baja</Button>
                  <Button mode="contained" icon="pencil" onPress={() => openEdit(selected)}>Editar</Button>
                </View>
              )}

              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                <Text style={styles.closeBtnText}>Cerrar</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </Modal>
      </Portal>

      {/* Formulario alta / edición */}
      <Portal>
        <Modal visible={formVisible} onDismiss={() => setFormVisible(false)} contentContainerStyle={styles.formModal}>
          <ScrollView>
            <Text style={styles.formTitle}>{editingEmp ? 'Editar empleada' : 'Nueva empleada'}</Text>

            <Text style={styles.fieldLabel}>Área</Text>
            <View style={styles.chipWrap}>
              {departments.map(d => (
                <Chip key={d.id} selected={form.department_id === d.id} onPress={() => setForm(f => ({ ...f, department_id: d.id }))} showSelectedCheck style={styles.formChip}>
                  {d.short_name || d.name}
                </Chip>
              ))}
            </View>

            <PaperInput label="Nombre completo" value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} mode="outlined" style={styles.input} />
            <PaperInput label="Clave (opcional)" value={form.clave} onChangeText={v => setForm(f => ({ ...f, clave: v }))} mode="outlined" autoCapitalize="characters" style={styles.input} />

            <Text style={styles.fieldLabel}>Categoría</Text>
            <View style={styles.chipWrap}>
              {CATEGORY_KEYS.map(cat => (
                <Chip key={cat} selected={form.category === cat} onPress={() => setForm(f => ({ ...f, category: cat }))} showSelectedCheck
                  style={[styles.formChip, form.category === cat && { backgroundColor: (CATEGORY_COLOR[cat] || COLORS.primary) + '22' }]}>
                  {CATEGORY_LABELS[cat]}
                </Chip>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Rol</Text>
            <View style={styles.chipWrap}>
              {ROLE_KEYS.map(r => (
                <Chip key={r} selected={form.role === r} onPress={() => setForm(f => ({ ...f, role: r }))} showSelectedCheck style={styles.formChip}>
                  {ROLE_LABELS[r]}
                </Chip>
              ))}
            </View>

            <PaperInput label="Observaciones (opcional)" value={form.observations} onChangeText={v => setForm(f => ({ ...f, observations: v }))} mode="outlined" multiline numberOfLines={2} style={styles.input} />

            {/* ------- Acceso al sistema (solo admin) ------- */}
            {isAdmin && (
              <View style={styles.accessBox}>
                <View style={styles.accessHeader}>
                  <Ionicons name="key" size={16} color={COLORS.primary} />
                  <Text style={styles.accessTitle}>Acceso al sistema</Text>
                </View>
                <Text style={styles.accessHelp}>
                  Define si esta persona entra al sistema y con qué nivel. La cuenta queda vinculada a ella y se asigna su área automáticamente.
                </Text>

                <View style={styles.chipWrap}>
                  {ACCESS_OPTIONS.map(opt => (
                    <Chip key={opt.value} selected={form.access === opt.value} onPress={() => setAccess(opt.value)} showSelectedCheck
                      style={[styles.formChip, form.access === opt.value && opt.value !== 'none' && { backgroundColor: (ACCESS_ROLE_COLOR[opt.value] || COLORS.primary) + '22' }]}>
                      {opt.label}
                    </Chip>
                  ))}
                </View>
                <Text style={styles.accessDesc}>{ACCESS_OPTIONS.find(o => o.value === form.access)?.desc}</Text>

                {form.access !== 'none' && (
                  <>
                    <PaperInput
                      label="Nombre de usuario" value={form.username}
                      onChangeText={v => setForm(f => ({ ...f, username: v.trim() }))}
                      mode="outlined" autoCapitalize="none" disabled={!!form.accountUserId}
                      style={styles.input}
                      right={!form.accountUserId ? <PaperInput.Icon icon="auto-fix" onPress={() => setForm(f => ({ ...f, username: suggestUsername(f.name, f.clave) }))} /> : null}
                    />
                    <PaperInput
                      label={form.accountUserId ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                      value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))}
                      mode="outlined" autoCapitalize="none" style={styles.input}
                      placeholder={form.accountUserId ? 'Dejar en blanco para no cambiar' : undefined}
                      right={<PaperInput.Icon icon="dice-5-outline" onPress={() => setForm(f => ({ ...f, password: tempPassword() }))} />}
                    />
                    {!!form.password && (
                      <Text style={styles.accessPwHint}>Contraseña a entregar: <Text style={styles.accessPwValue}>{form.password}</Text></Text>
                    )}

                    {ACCESS_NEEDS_POSITION.includes(form.access) && (
                      <>
                        <Text style={styles.fieldLabel}>Posición en el flujo de firmas (opcional)</Text>
                        <View style={styles.chipWrap}>
                          <Chip selected={!form.approval_position} onPress={() => setForm(f => ({ ...f, approval_position: '' }))} showSelectedCheck style={styles.formChip}>Ninguna</Chip>
                          {APPROVAL_POSITIONS.map(p => (
                            <Chip key={p} selected={form.approval_position === p} onPress={() => setForm(f => ({ ...f, approval_position: p }))} showSelectedCheck style={styles.formChip}>
                              {APPROVAL_POSITION_LABELS[p]}
                            </Chip>
                          ))}
                        </View>
                      </>
                    )}
                  </>
                )}

                {form.access === 'none' && form.accountUserId && (
                  <View style={styles.accessWarn}>
                    <Ionicons name="alert-circle-outline" size={16} color={COLORS.warning} />
                    <Text style={styles.accessWarnText}>Esta persona tiene una cuenta (@{form.username}). Al guardar con "Sin cuenta" se desactivará su acceso.</Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.formActions}>
              <View style={{ flex: 1 }} />
              <Button mode="text" onPress={() => setFormVisible(false)}>Cancelar</Button>
              <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Guardar</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={2500}>{snack}</Snackbar>
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
  pageWrap: { maxWidth: 1080, width: '100%', alignSelf: 'center', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  searchBar: { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, gap: 10, backgroundColor: COLORS.surface },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.text },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 4, marginBottom: 4 },
  chip: {},

  count: { fontSize: 13, color: COLORS.textLight, marginHorizontal: 16, marginTop: 4, marginBottom: 8 },

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

  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: COLORS.primary },

  modal: { margin: 20, alignSelf: 'center', width: '100%', maxWidth: 520, backgroundColor: COLORS.surface, borderRadius: 20, overflow: 'hidden' },
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
  detailActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 4 },
  closeBtn: { margin: 20, marginTop: 12, backgroundColor: COLORS.primary, padding: 14, borderRadius: 14, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  formModal: { margin: 16, alignSelf: 'center', width: '100%', maxWidth: 560, backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, maxHeight: '88%' },
  formTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 6, marginBottom: 8 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  formChip: { marginBottom: 4 },
  formActions: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 4 },

  // Indicador de cuenta en la tarjeta
  acctBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  acctText: { fontSize: 10, fontWeight: '700' },

  // Sección "Acceso al sistema"
  accessBox: { backgroundColor: '#F7F9FC', borderRadius: 12, padding: 12, marginTop: 4, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  accessHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  accessTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  accessHelp: { fontSize: 11, color: COLORS.textLight, marginBottom: 10, lineHeight: 15 },
  accessDesc: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginTop: -2, marginBottom: 10 },
  accessPwHint: { fontSize: 12, color: COLORS.textLight, marginTop: -4, marginBottom: 8 },
  accessPwValue: { fontWeight: '800', color: COLORS.text, letterSpacing: 1 },
  accessWarn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF8E1', borderRadius: 10, padding: 10, marginTop: 4 },
  accessWarnText: { flex: 1, fontSize: 12, color: '#8D6E00' },
});
