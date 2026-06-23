import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Surface, FAB, Modal, Portal, TextInput, Button, Chip, Switch, Snackbar, SegmentedButtons } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { COLORS } from '../constants/theme';
import { ACCESS_ROLES, ACCESS_ROLE_LABELS, ACCESS_ROLE_DESC, ACCESS_ROLE_COLOR, APPROVAL_POSITIONS, APPROVAL_POSITION_LABELS } from '../constants/roles';
import { pickSignature } from '../utils/pickSignature';
import { useAuth } from '../context/AuthContext';

export default function AdminScreen() {
  const [tab, setTab] = useState('users');
  const [snack, setSnack] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.pageWrap}>
      <View style={styles.tabWrap}>
        <SegmentedButtons
          value={tab}
          onValueChange={setTab}
          buttons={[
            { value: 'users', label: 'Usuarios', icon: 'account-group' },
            { value: 'departments', label: 'Áreas', icon: 'hospital-building' },
          ]}
        />
      </View>

      {tab === 'users'
        ? <UsersManager notify={setSnack} />
        : <DepartmentsManager notify={setSnack} />}

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={2500}>{snack}</Snackbar>
      </View>
    </View>
  );
}

/* ----------------------------- USUARIOS ----------------------------- */

const emptyUserForm = { username: '', full_name: '', role: 'lector', password: '', departments: [], is_active: 1, email: '', approval_position: '', signature: null, signatureChanged: false, signatureName: '' };

function UsersManager({ notify }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null); // user being edited or null (create)
  const [form, setForm] = useState(emptyUserForm);
  const [saving, setSaving] = useState(false);
  const [testVisible, setTestVisible] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, d] = await Promise.all([api.getUsers(), api.getDepartments()]);
      setUsers(u); setDepartments(d);
    } catch (e) {
      notify('No se pudieron cargar los usuarios');
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyUserForm); setModal(true); };
  const openEdit = async (u) => {
    setEditing(u);
    setForm({ username: u.username, full_name: u.full_name, role: u.role, password: '', departments: u.departments || [], is_active: u.is_active, email: u.email || '', approval_position: u.approval_position || '', signature: null, signatureChanged: false, signatureName: '' });
    setModal(true);
    // Cargar la firma existente para previsualizarla (no se reenvía salvo que se cambie)
    if (u.has_signature) {
      try { const { signature } = await api.getUserSignature(u.id); setForm(f => ({ ...f, signature })); } catch {}
    }
  };

  const onPickSignature = async () => {
    try {
      const r = await pickSignature();
      if (r) setForm(f => ({ ...f, signature: r.dataUrl, signatureChanged: true, signatureName: r.name }));
    } catch (e) { notify(e.message || 'No se pudo cargar el archivo'); }
  };
  const onRemoveSignature = () => setForm(f => ({ ...f, signature: '', signatureChanged: true, signatureName: '' }));

  const toggleDept = (id) => setForm(f => ({
    ...f,
    departments: f.departments.includes(id) ? f.departments.filter(x => x !== id) : [...f.departments, id],
  }));

  const save = async () => {
    if (!form.full_name.trim() || !form.role) return notify('Completa el nombre y el rol');
    if (!editing && (!form.username.trim() || !form.password)) return notify('El usuario y la contraseña son obligatorios');
    if (form.role !== 'admin' && form.departments.length === 0) return notify('Asigna al menos un área (o usa el rol Administrador)');

    setSaving(true);
    try {
      if (editing) {
        const payload = { full_name: form.full_name.trim(), role: form.role, departments: form.departments, is_active: form.is_active, email: form.email.trim(), approval_position: form.approval_position || null };
        if (form.password) payload.password = form.password;
        if (form.signatureChanged) payload.signature = form.signature || ''; // '' = quitar
        await api.updateUser(editing.id, payload);
        notify('Usuario actualizado');
      } else {
        await api.createUser({
          username: form.username.trim(), password: form.password,
          full_name: form.full_name.trim(), role: form.role, departments: form.departments,
          email: form.email.trim(), approval_position: form.approval_position || null,
          signature: form.signature || null,
        });
        notify('Usuario creado');
      }
      setModal(false);
      load();
    } catch (e) {
      notify(e.response?.data?.error || 'No se pudo guardar el usuario');
    } finally { setSaving(false); }
  };

  const deactivate = async (u) => {
    try { await api.deleteUser(u.id); notify('Usuario desactivado'); load(); }
    catch (e) { notify(e.response?.data?.error || 'No se pudo desactivar'); }
  };

  const sendTest = async () => {
    if (!testTo.trim()) return notify('Escribe un correo destino');
    setTesting(true);
    try {
      const r = await api.testEmail(testTo.trim());
      notify(r.message || 'Listo');
      if (r.sent) setTestVisible(false);
    } catch (e) { notify(e.response?.data?.error || 'No se pudo enviar'); }
    finally { setTesting(false); }
  };

  if (loading) return <Centered />;

  return (
    <>
      <View style={styles.toolbar}>
        <Button mode="text" icon="email-check-outline" compact onPress={() => setTestVisible(true)}>Probar correo</Button>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {users.map(u => (
          <TouchableOpacity key={u.id} onPress={() => openEdit(u)} activeOpacity={0.8}>
            <Surface style={[styles.card, !u.is_active && styles.cardInactive]} elevation={1}>
              <View style={[styles.avatar, { backgroundColor: ACCESS_ROLE_COLOR[u.role] || COLORS.primary }]}>
                <Ionicons name="person" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{u.full_name}</Text>
                <Text style={styles.cardMeta}>@{u.username}{!u.is_active ? ' · inactivo' : ''}</Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: (ACCESS_ROLE_COLOR[u.role] || COLORS.primary) + '20' }]}>
                <Text style={[styles.roleBadgeText, { color: ACCESS_ROLE_COLOR[u.role] || COLORS.primary }]}>{ACCESS_ROLE_LABELS[u.role] || u.role}</Text>
              </View>
            </Surface>
          </TouchableOpacity>
        ))}
        <View style={{ height: 80 }} />
      </ScrollView>

      <FAB icon="account-plus" label="Usuario" style={styles.fab} onPress={openCreate} color="#fff" />

      <Portal>
        <Modal visible={testVisible} onDismiss={() => setTestVisible(false)} contentContainerStyle={styles.modal}>
          <Text style={styles.modalTitle}>Probar correo</Text>
          <Text style={styles.help}>Envía un correo de prueba para verificar la configuración SMTP en el servidor.</Text>
          <TextInput label="Correo destino" value={testTo} onChangeText={setTestTo} mode="outlined" autoCapitalize="none" keyboardType="email-address" style={styles.input} />
          <View style={styles.modalActions}>
            <View style={{ flex: 1 }} />
            <Button mode="text" onPress={() => setTestVisible(false)}>Cancelar</Button>
            <Button mode="contained" onPress={sendTest} loading={testing} disabled={testing}>Enviar prueba</Button>
          </View>
        </Modal>
      </Portal>

      <Portal>
        <Modal visible={modal} onDismiss={() => setModal(false)} contentContainerStyle={styles.modal}>
          <ScrollView>
            <Text style={styles.modalTitle}>{editing ? 'Editar usuario' : 'Nuevo usuario'}</Text>

            <TextInput label="Nombre completo" value={form.full_name} onChangeText={v => setForm(f => ({ ...f, full_name: v }))} mode="outlined" style={styles.input} />

            <TextInput
              label="Nombre de usuario" value={form.username}
              onChangeText={v => setForm(f => ({ ...f, username: v }))}
              mode="outlined" autoCapitalize="none" disabled={!!editing}
              style={styles.input}
            />

            <TextInput
              label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))}
              mode="outlined" secureTextEntry style={styles.input}
              placeholder={editing ? 'Dejar en blanco para no cambiar' : undefined}
            />

            <Text style={styles.label}>Rol de acceso</Text>
            <View style={styles.roleGrid}>
              {ACCESS_ROLES.map(r => (
                <TouchableOpacity key={r} onPress={() => setForm(f => ({ ...f, role: r }))} style={{ flexBasis: '48%' }}>
                  <Surface style={[styles.roleOption, form.role === r && { borderColor: ACCESS_ROLE_COLOR[r], borderWidth: 2, backgroundColor: ACCESS_ROLE_COLOR[r] + '12' }]} elevation={0}>
                    <Text style={[styles.roleOptionTitle, form.role === r && { color: ACCESS_ROLE_COLOR[r] }]}>{ACCESS_ROLE_LABELS[r]}</Text>
                    <Text style={styles.roleOptionDesc}>{ACCESS_ROLE_DESC[r]}</Text>
                  </Surface>
                </TouchableOpacity>
              ))}
            </View>

            {form.role === 'admin' ? (
              <View style={styles.note}>
                <Ionicons name="information-circle" size={18} color={COLORS.info} />
                <Text style={styles.noteText}>El Administrador ve todas las áreas automáticamente.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Áreas asignadas</Text>
                <View style={styles.chipWrap}>
                  {departments.map(d => (
                    <Chip key={d.id} selected={form.departments.includes(d.id)} onPress={() => toggleDept(d.id)} showSelectedCheck style={styles.deptChip}>
                      {d.short_name || d.name}
                    </Chip>
                  ))}
                </View>
              </>
            )}

            <TextInput
              label="Correo (opcional, para avisos)" value={form.email}
              onChangeText={v => setForm(f => ({ ...f, email: v }))}
              mode="outlined" autoCapitalize="none" keyboardType="email-address" style={styles.input}
            />

            <Text style={styles.label}>Posición en el flujo de firmas</Text>
            <Text style={styles.help}>Define en qué nivel firma el rol de turno (opcional).</Text>
            <View style={styles.chipWrap}>
              <Chip selected={!form.approval_position} onPress={() => setForm(f => ({ ...f, approval_position: '' }))} showSelectedCheck style={styles.deptChip}>Ninguna</Chip>
              {APPROVAL_POSITIONS.map(p => (
                <Chip key={p} selected={form.approval_position === p} onPress={() => setForm(f => ({ ...f, approval_position: p }))} showSelectedCheck style={styles.deptChip}>
                  {APPROVAL_POSITION_LABELS[p]}
                </Chip>
              ))}
            </View>

            <Text style={styles.label}>Firma</Text>
            <Text style={styles.help}>Imagen (PNG/JPG) o PDF. Se usará al firmar el rol.</Text>
            {form.signature ? (
              <View style={styles.sigBox}>
                {form.signature.startsWith('data:image') ? (
                  <Image source={{ uri: form.signature }} style={styles.sigPreview} resizeMode="contain" />
                ) : (
                  <View style={styles.sigPdf}>
                    <Ionicons name="document-text" size={28} color={COLORS.danger} />
                    <Text style={styles.sigPdfText}>{form.signatureName || 'Documento PDF'}</Text>
                  </View>
                )}
                <View style={styles.sigActions}>
                  <Button mode="text" compact icon="swap-horizontal" onPress={onPickSignature}>Reemplazar</Button>
                  <Button mode="text" compact textColor={COLORS.danger} icon="delete-outline" onPress={onRemoveSignature}>Quitar</Button>
                </View>
              </View>
            ) : (
              <Button mode="outlined" icon="upload" onPress={onPickSignature} style={{ marginBottom: 6 }}>Subir firma (imagen o PDF)</Button>
            )}

            {editing && (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Usuario activo</Text>
                <Switch value={!!form.is_active} onValueChange={v => setForm(f => ({ ...f, is_active: v ? 1 : 0 }))} disabled={editing?.id === me?.id} />
              </View>
            )}

            <View style={styles.modalActions}>
              {editing && editing.id !== me?.id && (
                <Button mode="text" textColor={COLORS.danger} onPress={() => { setModal(false); deactivate(editing); }}>Desactivar</Button>
              )}
              <View style={{ flex: 1 }} />
              <Button mode="text" onPress={() => setModal(false)}>Cancelar</Button>
              <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Guardar</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </>
  );
}

/* ------------------------------ ÁREAS ------------------------------ */

const emptyDeptForm = { name: '', short_name: '', supervisor: '', area_chief: '' };

function DepartmentsManager({ notify }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyDeptForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setDepartments(await api.getDepartments()); }
    catch (e) { notify('No se pudieron cargar las áreas'); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyDeptForm); setModal(true); };
  const openEdit = (d) => {
    setEditing(d);
    setForm({ name: d.name, short_name: d.short_name || '', supervisor: d.supervisor || '', area_chief: d.area_chief || '' });
    setModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) return notify('El nombre del área es obligatorio');
    setSaving(true);
    try {
      if (editing) {
        await api.updateDepartment(editing.id, form);
        notify('Área actualizada');
      } else {
        const hospitalId = departments[0]?.hospital_id || 1;
        await api.createDepartment({ ...form, hospital_id: hospitalId });
        notify('Área creada');
      }
      setModal(false);
      load();
    } catch (e) {
      notify(e.response?.data?.error || 'No se pudo guardar el área');
    } finally { setSaving(false); }
  };

  if (loading) return <Centered />;

  return (
    <>
      <ScrollView contentContainerStyle={styles.list}>
        {departments.map(d => (
          <TouchableOpacity key={d.id} onPress={() => openEdit(d)} activeOpacity={0.8}>
            <Surface style={styles.card} elevation={1}>
              <View style={[styles.avatar, { backgroundColor: COLORS.secondary }]}>
                <Ionicons name="business" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{d.name}</Text>
                <Text style={styles.cardMeta}>{d.short_name ? d.short_name + ' · ' : ''}{d.supervisor || 'Sin supervisor'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
            </Surface>
          </TouchableOpacity>
        ))}
        <View style={{ height: 80 }} />
      </ScrollView>

      <FAB icon="plus" label="Área" style={styles.fab} onPress={openCreate} color="#fff" />

      <Portal>
        <Modal visible={modal} onDismiss={() => setModal(false)} contentContainerStyle={styles.modal}>
          <ScrollView>
            <Text style={styles.modalTitle}>{editing ? 'Editar área' : 'Nueva área'}</Text>
            <TextInput label="Nombre (ej. UCIP, Hospitalización)" value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} mode="outlined" style={styles.input} />
            <TextInput label="Nombre corto (ej. UCIP)" value={form.short_name} onChangeText={v => setForm(f => ({ ...f, short_name: v }))} mode="outlined" style={styles.input} />
            <TextInput label="Supervisor(a)" value={form.supervisor} onChangeText={v => setForm(f => ({ ...f, supervisor: v }))} mode="outlined" style={styles.input} />
            <TextInput label="Jefe(a) de área" value={form.area_chief} onChangeText={v => setForm(f => ({ ...f, area_chief: v }))} mode="outlined" style={styles.input} />

            <View style={styles.modalActions}>
              <View style={{ flex: 1 }} />
              <Button mode="text" onPress={() => setModal(false)}>Cancelar</Button>
              <Button mode="contained" onPress={save} loading={saving} disabled={saving}>Guardar</Button>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </>
  );
}

function Centered() {
  return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pageWrap: { maxWidth: 1080, width: '100%', alignSelf: 'center', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabWrap: { padding: 12 },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 2 },

  list: { padding: 12, gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: COLORS.surface, gap: 12 },
  cardInactive: { opacity: 0.55 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },

  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: COLORS.primary },

  modal: { margin: 16, backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, maxHeight: '88%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 14 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 6, marginBottom: 8 },
  help: { fontSize: 11, color: COLORS.textLight, marginTop: -4, marginBottom: 8 },

  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  roleOption: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff', minHeight: 64 },
  roleOptionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  roleOptionDesc: { fontSize: 10, color: COLORS.textLight, marginTop: 2 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deptChip: { marginBottom: 4 },

  note: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3F2FD', padding: 10, borderRadius: 10, marginTop: 6 },
  noteText: { color: COLORS.info, flex: 1, fontSize: 12 },

  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },

  sigBox: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 10, marginBottom: 6, backgroundColor: '#FAFAFA' },
  sigPreview: { width: '100%', height: 90, backgroundColor: '#fff', borderRadius: 8 },
  sigPdf: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  sigPdfText: { fontSize: 13, color: COLORS.text, flex: 1 },
  sigActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },

  modalActions: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 4 },
});
