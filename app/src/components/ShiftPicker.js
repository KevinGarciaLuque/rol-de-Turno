import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Platform } from 'react-native';
import { SHIFT_ORDER, getShift } from '../constants/shifts';
import { COLORS } from '../constants/theme';

export default function ShiftPicker({ visible, onSelect, onClose, currentCode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.container}>
          <Text style={styles.title}>Seleccionar turno</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {SHIFT_ORDER.map(code => {
              const shift = getShift(code);
              const isSelected = code === currentCode;
              return (
                <TouchableOpacity
                  key={code}
                  style={[styles.option, { backgroundColor: shift.color }, isSelected && styles.selected]}
                  onPress={() => { onSelect(code); onClose(); }}
                >
                  <Text style={[styles.optLabel, { color: shift.textColor }]}>{shift.label}</Text>
                  <Text style={[styles.optDesc, { color: shift.textColor + 'CC' }]} numberOfLines={1}>
                    {shift.description}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  container: {
    width: '90%', maxWidth: 400, maxHeight: '80%',
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16,
    ...Platform.select({ web: { boxShadow: '0 8px 32px rgba(0,0,0,0.3)' } }),
  },
  title: {
    fontSize: 18, fontWeight: '700', color: COLORS.text,
    marginBottom: 12, textAlign: 'center',
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 8,
  },
  option: {
    width: '48%', borderRadius: 10, padding: 10,
    alignItems: 'flex-start',
  },
  selected: {
    borderWidth: 3, borderColor: '#FFD700',
  },
  optLabel: {
    fontSize: 16, fontWeight: '800', marginBottom: 2,
  },
  optDesc: {
    fontSize: 11,
  },
  cancelBtn: {
    marginTop: 12, padding: 12, borderRadius: 10,
    backgroundColor: COLORS.border, alignItems: 'center',
  },
  cancelText: {
    fontSize: 15, fontWeight: '600', color: COLORS.text,
  },
});
