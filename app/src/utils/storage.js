import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Almacenamiento seguro multiplataforma:
// - Móvil (iOS/Android): expo-secure-store (cifrado)
// - Web: localStorage (SecureStore no existe en web)
export const storage = {
  async getItem(key) {
    if (Platform.OS === 'web') {
      try { return window.localStorage.getItem(key); } catch { return null; }
    }
    return SecureStore.getItemAsync(key);
  },
  async setItem(key, value) {
    if (Platform.OS === 'web') {
      try { window.localStorage.setItem(key, value); } catch {}
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  async removeItem(key) {
    if (Platform.OS === 'web') {
      try { window.localStorage.removeItem(key); } catch {}
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};
