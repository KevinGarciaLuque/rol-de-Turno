import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Surface, FAB, Modal, Portal, TextInput, Button, Chip, Switch, Snackbar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { COLORS } from '../constants/theme';
import { ACCESS_ROLES, ACCESS_ROLE_LABELS, ACCESS_ROLE_DESC, ACCESS_ROLE_COLOR, APPROVAL_POSITIONS, APPROVAL_POSITION_LABELS } from '../constants/roles';
import { pickSignature } from '../utils/pickSignature';
import { useAuth } from '../context/AuthContext';
import { useShifts } from '../context/ShiftsContext';
import EmployeesScreen from './EmployeesScreen';

const ADMIN_TABS = [
  { value: 'staff',       label: 'Personal',  icon: 'account-multiple'  },
  { value: 'users',       label: 'Usuarios',  icon: 'account-key'       },
  { value: 'departments', label: 'Áreas',     icon: 'hospital-building' },
  { value: 'shifts',      label: 'Turnos',    icon: 'clock-outline'     },
  { value: 'bitacora',    label: 'Bitácora',  icon: 'history'           },
];

export default function AdminScreen() {
  const [tab, setTab] = useState('staff');
  const [snack, setSnack] = useState('');

  return (
    <View style={styles.container}>
      <View style={styles.pageWrap}>
        {/* Barra de tabs con scroll horizontal — soporta cualquier número sin truncar */}
        <View style={styles.tabBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarContent}>
            {ADMIN_TABS.map(t => {
              const active = tab === t.value;
              return (
                <TouchableOpacity key={t.value} onPress={() => setTab(t.value)} style={[styles.tabBtn, active && styles.tabBtnActive]}>
                  <Ionicons name={t.icon} size={20} color={active ? COLORS.primary : COLORS.textLight} />
                  <Text style={[styles.tabBtnLabel, active && styles.tabBtnLabelActive]}>{t.label}</Text>
                  {active && <View style={styles.tabBtnUnderline} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.tabBarBorder} />
        </View>

        {tab === 'staff'       ? <EmployeesScreen />
        : tab === 'users'      ? <UsersManager notify={setSnack} />
        : tab === 'departments'? <DepartmentsManager notify={setSnack} />
        : tab === 'shifts'     ? <ShiftTypesManager notify={setSnack} />
        :                        <BitacoraManager />}

        <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={2500}>{snack}</Snackbar>
      </View>
    </View>
  );
}

/* ----------------------------- USUARIOS ----------------------------- */

const emptyUserForm = { username: '', full_name: '', role: 'lector', password: '', departments: [], is_active: 1, email: '', approval_position: '', signature: null, signatureChanged: false, signatureName: '', employee_id: null };

function UsersManager({ notify }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [empQuery, setEmpQuery] = useState('');
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
      const [u, d, e] = await Promise.all([api.getUsers(), api.getDepartments(), api.getEmployees()]);
      setUsers(u); setDepartments(d); setEmployees(e);
    } catch (e) {
      notify('No se pudieron cargar los usuarios');
    } finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyUserForm); setEmpQuery(''); setModal(true); };
  const openEdit = async (u) => {
    setEditing(u);
    setEmpQuery('');
    setForm({ username: u.username, full_name: u.full_name, role: u.role, password: '', departments: u.departments || [], is_active: u.is_active, email: u.email || '', approval_position: u.approval_position || '', signature: null, signatureChanged: false, signatureName: '', employee_id: u.employee_id || null });
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
      // El vínculo con empleada solo aplica al rol Lector
      const employeeId = form.role === 'lector' ? (form.employee_id || null) : null;
      if (editing) {
        const payload = { full_name: form.full_name.trim(), role: form.role, departments: form.departments, is_active: form.is_active, email: form.email.trim(), approval_position: form.approval_position || null, employee_id: employeeId };
        if (form.password) payload.password = form.password;
        if (form.signatureChanged) payload.signature = form.signature || ''; // '' = quitar
        await api.updateUser(editing.id, payload);
        notify('Usuario actualizado');
      } else {
        await api.createUser({
          username: form.username.trim(), password: form.password,
          full_name: form.full_name.trim(), role: form.role, departments: form.departments,
          email: form.email.trim(), approval_position: form.approval_position || null,
          signature: form.signature || null, employee_id: employeeId,
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
      <ScrollView contentContainerStyle={styles.gridList}>
        <View style={styles.grid}>
          {users.map(u => (
            <TouchableOpacity key={u.id} style={styles.cardItem} onPress={() => openEdit(u)} activeOpacity={0.8}>
              <Surface style={[styles.card, { flex: 1 }, !u.is_active && styles.cardInactive]} elevation={1}>
                <View style={[styles.avatar, { backgroundColor: ACCESS_ROLE_COLOR[u.role] || COLORS.primary }]}>
                  <Ionicons name="person" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{u.full_name}</Text>
                  <Text style={styles.cardMeta}>@{u.username}{!u.is_active ? ' · inactivo' : ''}</Text>
                  {!!u.employee_name && (
                    <View style={styles.linkTag}>
                      <Ionicons name="calendar" size={11} color={COLORS.primary} />
                      <Text style={styles.linkTagText} numberOfLines={1}>Mi Horario: {u.employee_name}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.roleBadge, { backgroundColor: (ACCESS_ROLE_COLOR[u.role] || COLORS.primary) + '20' }]}>
                  <Text style={[styles.roleBadgeText, { color: ACCESS_ROLE_COLOR[u.role] || COLORS.primary }]}>{ACCESS_ROLE_LABELS[u.role] || u.role}</Text>
                </View>
              </Surface>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <FAB icon="account-plus" label="Usuario" size="small" style={styles.fab} onPress={openCreate} color="#fff" />

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

            {form.role === 'lector' && (
              <EmployeeLinker
                employees={employees}
                departments={form.departments}
                value={form.employee_id}
                query={empQuery}
                setQuery={setEmpQuery}
                onSelect={(id) => setForm(f => ({ ...f, employee_id: id }))}
              />
            )}

            <Text style={styles.label}>¿Dónde firma este usuario?</Text>
            <Text style={styles.help}>Elige el nivel de la cadena de aprobación donde este usuario estampa su firma (opcional).</Text>
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

/* ---------------------- VÍNCULO USUARIO ↔ EMPLEADA ---------------------- */
// Permite que una cuenta de Lector vea SOLO el horario de la empleada elegida.

function EmployeeLinker({ employees, departments, value, query, setQuery, onSelect }) {
  const deptSet = new Set(departments || []);
  const q = query.trim().toLowerCase();
  const pool = employees.filter(e => deptSet.size === 0 || deptSet.has(e.department_id));
  const filtered = pool.filter(e =>
    !q || (e.name || '').toLowerCase().includes(q) || (e.clave || '').toLowerCase().includes(q)
  );
  const selected = employees.find(e => e.id === value);
  const shown = filtered.slice(0, 25);

  return (
    <View style={styles.linkBox}>
      <Text style={styles.label}>Vincular a empleada</Text>
      <Text style={styles.help}>
        La empleada entrará con este usuario y verá únicamente su propio horario (calendario).
        {departments.length === 0 ? ' Primero asigna al menos un área.' : ''}
      </Text>

      {selected && (
        <View style={styles.linkSelected}>
          <Ionicons name="link" size={16} color={COLORS.success} />
          <Text style={styles.linkSelectedText} numberOfLines={1}>Vinculada a: {selected.name}</Text>
          <TouchableOpacity onPress={() => onSelect(null)}>
            <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>
      )}

      {departments.length > 0 && (
        <>
          <TextInput
            label="Buscar empleada por nombre o clave"
            value={query} onChangeText={setQuery}
            mode="outlined" dense style={styles.input}
            left={<TextInput.Icon icon="magnify" />}
          />
          <View style={styles.empList}>
            {shown.length === 0 ? (
              <Text style={styles.empEmpty}>No hay empleadas que coincidan en las áreas asignadas.</Text>
            ) : shown.map(e => {
              const isSel = e.id === value;
              return (
                <TouchableOpacity key={e.id} onPress={() => onSelect(isSel ? null : e.id)} activeOpacity={0.7}
                  style={[styles.empRow, isSel && styles.empRowSel]}>
                  <Ionicons name={isSel ? 'radio-button-on' : 'radio-button-off'} size={18} color={isSel ? COLORS.primary : COLORS.textLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empName} numberOfLines={1}>{e.name}</Text>
                    <Text style={styles.empMeta} numberOfLines={1}>{e.clave ? `Clave ${e.clave} · ` : ''}{e.department_name}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {filtered.length > shown.length && (
              <Text style={styles.empEmpty}>… y {filtered.length - shown.length} más. Afina la búsqueda.</Text>
            )}
          </View>
        </>
      )}
    </View>
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
      <ScrollView contentContainerStyle={styles.gridList}>
        <View style={styles.grid}>
          {departments.map(d => (
            <TouchableOpacity key={d.id} style={styles.cardItem} onPress={() => openEdit(d)} activeOpacity={0.8}>
              <Surface style={[styles.card, { flex: 1 }]} elevation={1}>
                <View style={[styles.avatar, { backgroundColor: COLORS.secondary }]}>
                  <Ionicons name="business" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>{d.short_name ? d.short_name + ' · ' : ''}{d.supervisor || 'Sin supervisor'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
              </Surface>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <FAB icon="plus" label="Área" size="small" style={styles.fab} onPress={openCreate} color="#fff" />

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

/* ----------------------------- TURNOS ----------------------------- */

const COLOR_PRESETS = ['#2E7D32', '#1565C0', '#6A1B9A', '#E65100', '#00838F', '#AD1457', '#4527A0', '#757575', '#0277BD', '#B71C1C', '#F57F17', '#4E342E'];
const emptyShiftForm = { code: '', label: '', description: '', color: '#1565C0', text_color: '#FFFFFF', is_work_shift: true, start_time: '', end_time: '' };

function ShiftTypesManager({ notify }) {
  const { reload: reloadShifts } = useShifts();
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyShiftForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setShifts(await api.getShiftTypes()); }
    catch (e) { notify('No se pudieron cargar los turnos'); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyShiftForm); setModal(true); };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      code: s.code,
      label: s.label || '', description: s.description || '',
      color: s.color || '#1565C0', text_color: s.text_color || '#FFFFFF',
      is_work_shift: !!s.is_work_shift,
      start_time: (s.start_time || '').slice(0, 5), end_time: (s.end_time || '').slice(0, 5),
    });
    setModal(true);
  };

  const validTime = (t) => t === '' || /^\d{1,2}:\d{2}$/.test(t.trim());

  const save = async () => {
    if (!editing && !/^[A-Za-z0-9]{1,16}$/.test(form.code.trim())) return notify('El código debe tener 1 a 16 letras o números (sin espacios)');
    if (!form.label.trim()) return notify('La etiqueta es obligatoria');
    if (!validTime(form.start_time) || !validTime(form.end_time)) return notify('Usa el formato de hora HH:MM (ej. 07:00)');
    setSaving(true);
    const payload = {
      label: form.label.trim(),
      description: form.description.trim(),
      color: form.color.trim(),
      text_color: form.text_color,
      is_work_shift: form.is_work_shift ? 1 : 0,
      start_time: form.start_time.trim(),
      end_time: form.end_time.trim(),
    };
    try {
      if (editing) {
        await api.updateShiftType(editing.code, payload);
        notify('Turno actualizado');
      } else {
        await api.createShiftType({ ...payload, code: form.code.trim().toUpperCase() });
        notify('Turno creado');
      }
      setModal(false);
      await load();
      reloadShifts(); // refresca los turnos en toda la app (grid, selector, etc.)
    } catch (e) {
      notify(e.response?.data?.error || 'No se pudo guardar el turno');
    } finally { setSaving(false); }
  };

  if (loading) return <Centered />;

  const cleanTitle = (s) => (s.description || s.label || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || s.label;

  const renderCard = (s) => {
    const hours = s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : null;
    return (
      <TouchableOpacity key={s.code} style={styles.cardItem} onPress={() => openEdit(s)} activeOpacity={0.8}>
        <Surface style={[styles.card, { flex: 1 }]} elevation={1}>
          <View style={[styles.shiftSwatch, { backgroundColor: s.color }]}>
            <Text style={[styles.shiftSwatchCode, { color: s.text_color || '#fff' }]}>{s.code}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{cleanTitle(s)}</Text>
            {hours ? (
              <View style={styles.hoursBadge}>
                <Ionicons name="time-outline" size={12} color={COLORS.primary} />
                <Text style={styles.hoursBadgeText}>{hours}</Text>
              </View>
            ) : (
              <Text style={styles.cardMeta}>Sin horario</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </Surface>
      </TouchableOpacity>
    );
  };

  const workShifts = shifts.filter(s => s.is_work_shift);
  const otherShifts = shifts.filter(s => !s.is_work_shift);

  return (
    <>
      <ScrollView contentContainerStyle={styles.gridList}>
        {workShifts.length > 0 && <Text style={styles.sectionHeader}>Turnos de trabajo</Text>}
        <View style={styles.grid}>{workShifts.map(renderCard)}</View>
        {otherShifts.length > 0 && <Text style={styles.sectionHeader}>Ausencias y días especiales</Text>}
        <View style={styles.grid}>{otherShifts.map(renderCard)}</View>
        <View style={{ height: 90 }} />
      </ScrollView>

      <FAB icon="plus" label="Turno" size="small" style={styles.fab} onPress={openCreate} color="#fff" />

      <Portal>
        <Modal visible={modal} onDismiss={() => setModal(false)} contentContainerStyle={styles.modal}>
          <ScrollView>
            <Text style={styles.modalTitle}>{editing ? `Editar turno ${editing.code}` : 'Nuevo turno'}</Text>

            <View style={[styles.shiftSwatch, styles.shiftSwatchBig, { backgroundColor: form.color, alignSelf: 'center', marginBottom: 14 }]}>
              <Text style={[styles.shiftSwatchText, { color: form.text_color, fontSize: 16 }]}>{(editing ? editing.code : form.code) || '?'}</Text>
            </View>

            {!editing && (
              <>
                <TextInput label="Código (ej. A, DEN, TC)" value={form.code} onChangeText={v => setForm(f => ({ ...f, code: v.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} mode="outlined" autoCapitalize="characters" maxLength={16} style={styles.input} />
                <Text style={styles.help}>El código va dentro de cada celda del rol. No se puede cambiar después.</Text>
              </>
            )}

            <TextInput label="Etiqueta (texto en la celda)" value={form.label} onChangeText={v => setForm(f => ({ ...f, label: v }))} mode="outlined" style={styles.input} />
            <TextInput label="Descripción" value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} mode="outlined" style={styles.input} />

            <Text style={styles.label}>Horario (formato 24h, HH:MM)</Text>
            <View style={styles.timeRow}>
              <TextInput label="Inicio" value={form.start_time} onChangeText={v => setForm(f => ({ ...f, start_time: v }))} mode="outlined" placeholder="07:00" style={[styles.input, { flex: 1 }]} />
              <TextInput label="Fin" value={form.end_time} onChangeText={v => setForm(f => ({ ...f, end_time: v }))} mode="outlined" placeholder="15:00" style={[styles.input, { flex: 1 }]} />
            </View>
            <Text style={styles.help}>Déjalo vacío si el turno no tiene horario (ej. Libre, Vacaciones).</Text>

            <Text style={styles.label}>Color</Text>
            <View style={styles.swatchRow}>
              {COLOR_PRESETS.map(c => (
                <TouchableOpacity key={c} onPress={() => setForm(f => ({ ...f, color: c }))}
                  style={[styles.colorDot, { backgroundColor: c }, form.color.toUpperCase() === c.toUpperCase() && styles.colorDotActive]} />
              ))}
            </View>
            <TextInput label="Color (hex)" value={form.color} onChangeText={v => setForm(f => ({ ...f, color: v }))} mode="outlined" autoCapitalize="characters" style={styles.input} />

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Texto blanco</Text>
              <Switch value={form.text_color === '#FFFFFF'} onValueChange={v => setForm(f => ({ ...f, text_color: v ? '#FFFFFF' : '#000000' }))} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Cuenta como turno de trabajo</Text>
              <Switch value={form.is_work_shift} onValueChange={v => setForm(f => ({ ...f, is_work_shift: v }))} />
            </View>

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

/* ----------------------------- BITÁCORA ----------------------------- */

const ACTION_META = {
  edit_shift:      { icon: 'pencil',                color: '#1565C0', label: 'Turno editado' },
  bulk_edit:       { icon: 'table-edit',            color: '#6A1B9A', label: 'Edición masiva' },
  copy_month:      { icon: 'content-copy',          color: '#00838F', label: 'Mes copiado' },
  apply_template:  { icon: 'clipboard-arrow-down-outline', color: '#E65100', label: 'Plantilla aplicada' },
  create_user:     { icon: 'account-plus',          color: '#2E7D32', label: 'Usuario creado' },
  update_user:     { icon: 'account-edit',          color: '#F57F17', label: 'Usuario editado' },
  deactivate_user: { icon: 'account-off',           color: '#B71C1C', label: 'Usuario desactivado' },
  reopen_schedule: { icon: 'lock-open-variant',     color: '#AD1457', label: 'Rol reabierto' },
};

const FILTER_GROUPS = [
  { key: '', label: 'Todos' },
  { key: 'edit_shift', label: 'Turnos' },
  { key: 'bulk_edit', label: 'Masivo' },
  { key: 'create_user', label: 'Usuarios' },
  { key: 'reopen_schedule', label: 'Reaperturas' },
];

const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}  ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function describeEntry(entry) {
  const d = entry.detail || {};
  switch (entry.action) {
    case 'edit_shift': {
      const oldV = d.old || '(sin asignar)';
      return `${d.employee_name || 'Empleada'} · Día ${d.day}: ${oldV} → ${d.new}  ·  ${d.department_name} ${d.month}/${d.year}`;
    }
    case 'bulk_edit':
      return `${d.count} celdas editadas en ${d.department_name} ${d.month}/${d.year}`;
    case 'copy_month':
      return `${d.department_name} ${d.source_month}/${d.source_year} → ${d.month}/${d.year} (${d.copied} entradas)`;
    case 'apply_template':
      return `Plantilla "${d.template_name}" → ${d.department_name} ${d.month}/${d.year} (${d.applied} entradas)`;
    case 'create_user':
      return `${d.target_name} (@${d.target_username}) · ${d.role}`;
    case 'update_user': {
      const changes = d.changes?.length ? d.changes.join(', ') : 'sin cambios detectados';
      return `${d.target_name} (@${d.target_username}) · ${changes}`;
    }
    case 'deactivate_user':
      return `${d.target_name} (@${d.target_username})`;
    case 'reopen_schedule':
      return `${d.department_name} ${d.month}/${d.year}`;
    default:
      return entry.action;
  }
}

function BitacoraManager() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState('');
  const LIMIT = 50;

  const load = useCallback(async (actionFilter, offset = 0, append = false) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    try {
      const params = { limit: LIMIT, offset };
      if (actionFilter) params.action = actionFilter;
      const data = await api.getBitacora(params);
      setTotal(data.total);
      setRows(prev => append ? [...prev, ...data.rows] : data.rows);
    } catch (e) {
      // silencioso — la tabla puede no existir aún en local
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [load, filter]);

  const onFilterChange = (key) => {
    // Si el grupo es 'edit_shift' queremos también bulk/copy/template
    setFilter(key);
  };

  const loadMore = () => load(filter, rows.length, true);

  return (
    <View style={{ flex: 1 }}>
      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bitFilterBar} contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingVertical: 8 }}>
        {FILTER_GROUPS.map(g => (
          <TouchableOpacity key={g.key} onPress={() => onFilterChange(g.key)}
            style={[styles.bitFilterChip, filter === g.key && styles.bitFilterChipActive]}>
            <Text style={[styles.bitFilterChipText, filter === g.key && styles.bitFilterChipTextActive]}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="clipboard-outline" size={48} color={COLORS.textLight} />
          <Text style={[styles.cardMeta, { marginTop: 12, textAlign: 'center' }]}>Sin registros aún.{'\n'}Las acciones aparecerán aquí en tiempo real.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.bitList}>
          {rows.map(entry => {
            const meta = ACTION_META[entry.action] || { icon: 'information-outline', color: COLORS.textLight, label: entry.action };
            return (
              <View key={entry.id} style={styles.bitRow}>
                <View style={[styles.bitIcon, { backgroundColor: meta.color + '18' }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <View style={[styles.bitBadge, { backgroundColor: meta.color + '22' }]}>
                      <Text style={[styles.bitBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.bitUser}>{entry.user_name}</Text>
                  </View>
                  <Text style={styles.bitDesc} numberOfLines={2}>{describeEntry(entry)}</Text>
                  <Text style={styles.bitTime}>{fmtDate(entry.created_at)}</Text>
                </View>
              </View>
            );
          })}
          {rows.length < total && (
            <Button mode="outlined" onPress={loadMore} loading={loadingMore} disabled={loadingMore} style={{ marginTop: 8, alignSelf: 'center' }}>
              Cargar más ({total - rows.length} restantes)
            </Button>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

function Centered() {
  return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pageWrap: { maxWidth: 1080, width: '100%', alignSelf: 'center', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabBarWrap: { backgroundColor: COLORS.surface, borderBottomWidth: 0 },
  tabBarContent: { paddingHorizontal: 8 },
  tabBarBorder: { height: 1, backgroundColor: COLORS.border },
  tabBtn: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, position: 'relative', minWidth: 80 },
  tabBtnActive: {},
  tabBtnLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textLight, marginTop: 3 },
  tabBtnLabelActive: { color: COLORS.primary, fontWeight: '700' },
  tabBtnUnderline: { position: 'absolute', bottom: 0, left: 12, right: 12, height: 2.5, borderRadius: 2, backgroundColor: COLORS.primary },
  toolbar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 2, maxWidth: 960, width: '100%', alignSelf: 'center' },

  list: { padding: 12, gap: 8, alignItems: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: COLORS.surface, gap: 12, width: '100%', maxWidth: 660 },
  cardInactive: { opacity: 0.55 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardMeta: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },

  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: COLORS.primary },

  modal: { margin: 16, alignSelf: 'center', width: '100%', maxWidth: 520, backgroundColor: COLORS.surface, borderRadius: 18, padding: 20, maxHeight: '88%' },
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

  // Cuadrícula reutilizable (Usuarios, Áreas, Turnos)
  gridList: { padding: 12, paddingBottom: 90, maxWidth: 960, width: '100%', alignSelf: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  cardItem: { width: 300, maxWidth: '100%' },
  sectionHeader: { width: '100%', fontSize: 12, fontWeight: '800', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 4, marginLeft: 4 },
  shiftSwatch: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shiftSwatchBig: { width: 64, height: 64, borderRadius: 16 },
  shiftSwatchText: { fontSize: 13, fontWeight: '800' },
  shiftSwatchCode: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  hoursBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: COLORS.primary + '14', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  hoursBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  timeRow: { flexDirection: 'row', gap: 10 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: COLORS.text },

  // Bitácora
  bitFilterBar: { flexGrow: 0 },
  bitFilterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  bitFilterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  bitFilterChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  bitFilterChipTextActive: { color: '#fff' },
  bitList: { padding: 12, gap: 8, maxWidth: 860, width: '100%', alignSelf: 'center' },
  bitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  bitIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bitBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  bitBadgeText: { fontSize: 10, fontWeight: '800' },
  bitUser: { fontSize: 12, fontWeight: '700', color: COLORS.textLight },
  bitDesc: { fontSize: 13, color: COLORS.text, marginTop: 3 },
  bitTime: { fontSize: 11, color: COLORS.textLight, marginTop: 4 },

  // Vínculo usuario ↔ empleada
  linkBox: { backgroundColor: '#F7F9FC', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  linkSelected: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F5E9', borderRadius: 10, padding: 8, marginBottom: 8 },
  linkSelectedText: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.success },
  empList: { gap: 4 },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8 },
  empRowSel: { backgroundColor: COLORS.primary + '12' },
  empName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  empMeta: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  empEmpty: { fontSize: 12, color: COLORS.textLight, fontStyle: 'italic', paddingVertical: 6, textAlign: 'center' },
  linkTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start', backgroundColor: COLORS.primary + '12', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  linkTagText: { fontSize: 10, fontWeight: '700', color: COLORS.primary, maxWidth: 150 },
});
