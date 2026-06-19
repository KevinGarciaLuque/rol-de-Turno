import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Modal, Portal, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { COLORS } from '../constants/theme';

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [visible, setVisible] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getNotifications();
      setUnread(data.unread || 0);
      setItems(data.items || []);
    } catch (e) { /* silencioso */ }
  }, []);

  // Carga inicial + sondeo cada 30s
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const open = () => { setVisible(true); load(); };

  const markRead = async (n) => {
    if (!n.is_read) {
      try { await api.markNotificationRead(n.id); } catch {}
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: 1 } : x));
      setUnread(u => Math.max(0, u - 1));
    }
  };

  const markAll = async () => {
    try { await api.markAllNotificationsRead(); } catch {}
    setItems(prev => prev.map(x => ({ ...x, is_read: 1 })));
    setUnread(0);
  };

  return (
    <>
      <TouchableOpacity onPress={open} style={styles.bellBtn}>
        <Ionicons name="notifications-outline" size={24} color="#fff" />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Portal>
        <Modal visible={visible} onDismiss={() => setVisible(false)} contentContainerStyle={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Notificaciones</Text>
            {unread > 0 && <TouchableOpacity onPress={markAll}><Text style={styles.markAll}>Marcar todas</Text></TouchableOpacity>}
          </View>

          <ScrollView style={{ maxHeight: 420 }}>
            {items.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={40} color={COLORS.textLight} />
                <Text style={styles.emptyText}>Sin notificaciones</Text>
              </View>
            ) : (
              items.map(n => (
                <TouchableOpacity key={n.id} onPress={() => markRead(n)} style={[styles.item, !n.is_read && styles.itemUnread]}>
                  {!n.is_read && <View style={styles.dot} />}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{n.title}</Text>
                    <Text style={styles.itemBody}>{n.body}</Text>
                    <Text style={styles.itemDate}>{new Date(n.created_at).toLocaleString()}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <Button mode="contained" onPress={() => setVisible(false)} style={{ marginTop: 12 }}>Cerrar</Button>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  badge: { position: 'absolute', top: 0, right: 2, backgroundColor: COLORS.danger, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  modal: { margin: 16, backgroundColor: COLORS.surface, borderRadius: 18, padding: 18 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  markAll: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },

  empty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyText: { color: COLORS.textLight },

  item: { flexDirection: 'row', gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border, borderRadius: 8 },
  itemUnread: { backgroundColor: '#E3F2FD' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 6 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  itemBody: { fontSize: 13, color: COLORS.text, marginTop: 2 },
  itemDate: { fontSize: 10, color: COLORS.textLight, marginTop: 4 },
});
