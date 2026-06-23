import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { setShiftOverrides } from '../constants/shifts';
import { useAuth } from './AuthContext';

// Carga los tipos de turno (con horario/color/etiqueta) desde la BD una vez iniciada la sesión
// y los publica en el módulo shifts.js para que getShift() los use en toda la app.
const ShiftsContext = createContext({ shifts: [], version: 0, reload: async () => {} });

export function ShiftsProvider({ children }) {
  const { user } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [version, setVersion] = useState(0);

  const reload = useCallback(async () => {
    try {
      const rows = await api.getShiftTypes();
      setShiftOverrides(rows);   // actualiza getShift() globalmente
      setShifts(rows);
      setVersion(v => v + 1);    // fuerza re-render de quien use useShifts()
    } catch (e) {
      // Sin conexión: se mantienen los valores por defecto de shifts.js
    }
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  return (
    <ShiftsContext.Provider value={{ shifts, version, reload }}>
      {children}
    </ShiftsContext.Provider>
  );
}

export function useShifts() {
  return useContext(ShiftsContext);
}
