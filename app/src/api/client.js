import axios from 'axios';
import { Platform } from 'react-native';

// Backend en la nube (Railway). Para volver a desarrollo local, cambia USE_LOCAL a true.
const PROD_URL = 'https://rol.up.railway.app/api';
const USE_LOCAL = true; // ← cambiar a false para producción

// En desarrollo local: localhost (web/iOS) o 10.0.2.2 (emulador Android)
const LOCAL_URL = Platform.select({
  android: 'http://10.0.2.2:3001/api',
  ios:     'http://localhost:3001/api',
  web:     'http://localhost:3001/api',
  default: 'http://localhost:3001/api',
});

const BASE_URL = USE_LOCAL ? LOCAL_URL : PROD_URL;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Token en memoria; el AuthContext lo fija al iniciar sesión / restaurar sesión.
let _token = null;
let _onUnauthorized = null;

export function setAuthToken(token) {
  _token = token;
  if (token) client.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete client.defaults.headers.common.Authorization;
}

// Callback que se dispara cuando el backend responde 401 (sesión expirada)
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

client.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401 && _onUnauthorized) _onUnauthorized();
    return Promise.reject(error);
  }
);

export const api = {
  // Auth
  login: (username, password) => client.post('/auth/login', { username, password }).then(r => r.data),
  me:    () => client.get('/auth/me').then(r => r.data),

  // Users (solo Admin)
  getUsers:   () => client.get('/users').then(r => r.data),
  createUser: (data) => client.post('/users', data).then(r => r.data),
  updateUser: (id, data) => client.put(`/users/${id}`, data).then(r => r.data),
  deleteUser: (id) => client.delete(`/users/${id}`).then(r => r.data),
  getUserSignature: (id) => client.get(`/users/${id}/signature`).then(r => r.data),

  // Departments
  getDepartments: () => client.get('/departments').then(r => r.data),
  getDepartment:  (id) => client.get(`/departments/${id}`).then(r => r.data),
  createDepartment: (data) => client.post('/departments', data).then(r => r.data),
  updateDepartment: (id, data) => client.put(`/departments/${id}`, data).then(r => r.data),

  // Employees
  getEmployees: (params) => client.get('/employees', { params }).then(r => r.data),
  getEmployee:  (id) => client.get(`/employees/${id}`).then(r => r.data),
  createEmployee: (data) => client.post('/employees', data).then(r => r.data),
  updateEmployee: (id, data) => client.put(`/employees/${id}`, data).then(r => r.data),
  deleteEmployee: (id) => client.delete(`/employees/${id}`).then(r => r.data),

  // Schedule
  getSchedule: (deptId, year, month) => client.get(`/schedule/${deptId}/${year}/${month}`).then(r => r.data),
  updateEntry: (data) => client.put('/schedule/entry', data).then(r => r.data),
  updateStatus: (smId, status) => client.put(`/schedule/${smId}/status`, { status }).then(r => r.data),
  getShiftTypes: () => client.get('/schedule/shift-types/all').then(r => r.data),
  getScheduleSummary: (deptId) => client.get(`/schedule/summary/${deptId}`).then(r => r.data),

  // Aprobación (flujo de firmas)
  signSchedule:   (smId) => client.post(`/schedule/${smId}/sign`).then(r => r.data),
  rejectSchedule: (smId, target_level, note) => client.post(`/schedule/${smId}/reject`, { target_level, note }).then(r => r.data),
  reopenSchedule: (smId) => client.post(`/schedule/${smId}/reopen`).then(r => r.data),
  getTimeline:    (smId) => client.get(`/schedule/${smId}/timeline`).then(r => r.data),
  getScheduleSignatures: (smId) => client.get(`/schedule/${smId}/signatures`).then(r => r.data),

  // Notificaciones
  getNotifications: () => client.get('/notifications').then(r => r.data),
  markNotificationRead: (id) => client.put(`/notifications/${id}/read`).then(r => r.data),
  markAllNotificationsRead: () => client.put('/notifications/read-all').then(r => r.data),
  testEmail: (to) => client.post('/notifications/test', { to }).then(r => r.data),

  // Bulk / auto-fill
  bulkEntries:   (data) => client.put('/schedule/bulk-entries', data).then(r => r.data),
  copyPrevious:  (data) => client.post('/schedule/copy-previous', data).then(r => r.data),

  // Templates
  getTemplates:   (deptId) => client.get(`/schedule/templates/${deptId}`).then(r => r.data),
  saveTemplate:   (data)   => client.post('/schedule/templates', data).then(r => r.data),
  applyTemplate:  (id, data) => client.post(`/schedule/templates/${id}/apply`, data).then(r => r.data),
  deleteTemplate: (id)     => client.delete(`/schedule/templates/${id}`).then(r => r.data),

  // Health
  health: () => client.get('/health').then(r => r.data),
};
