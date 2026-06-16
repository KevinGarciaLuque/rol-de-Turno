import axios from 'axios';
import { Platform } from 'react-native';

// For web: localhost; for Android emulator: 10.0.2.2; for real device: your machine's IP
const BASE_URL = Platform.select({
  android: 'http://10.0.2.2:3001/api',
  ios:     'http://localhost:3001/api',
  web:     'http://localhost:3001/api',
  default: 'http://localhost:3001/api',
});

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

export const api = {
  // Departments
  getDepartments: () => client.get('/departments').then(r => r.data),
  getDepartment:  (id) => client.get(`/departments/${id}`).then(r => r.data),

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

  // Health
  health: () => client.get('/health').then(r => r.data),
};
