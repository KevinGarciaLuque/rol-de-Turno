import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from '../api/client';
import { storage } from '../utils/storage';

const TOKEN_KEY = 'rolturno_token';
const USER_KEY  = 'rolturno_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);     // { id, username, full_name, role, departments }
  const [loading, setLoading] = useState(true); // cargando sesión guardada al iniciar

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(USER_KEY);
  }, []);

  // Restaurar sesión guardada al abrir la app
  useEffect(() => {
    // Si el backend devuelve 401 en cualquier momento, cerramos sesión
    setUnauthorizedHandler(() => { logout(); });

    (async () => {
      try {
        const token = await storage.getItem(TOKEN_KEY);
        const savedUser = await storage.getItem(USER_KEY);
        if (token && savedUser) {
          setAuthToken(token);
          setUser(JSON.parse(savedUser));
        }
      } catch (e) {
        // sesión corrupta → limpiar
        await logout();
      } finally {
        setLoading(false);
      }
    })();
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password); // { token, user }
    setAuthToken(data.token);
    setUser(data.user);
    await storage.setItem(TOKEN_KEY, data.token);
    await storage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
    role: user?.role || null,
    isAdmin: user?.role === 'admin',
    canEdit: user ? user.role !== 'lector' : false,
    // Empleada vinculada: cuenta de solo-lectura que ve únicamente su propio horario
    employee: user?.employee || null,
    isEmployee: !!user?.employee_id && user?.role === 'lector',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
