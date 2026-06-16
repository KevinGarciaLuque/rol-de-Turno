import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { getShift } from '../constants/shifts';

export default function ShiftCell({ code, size = 'md', onPress, editable }) {
  const shift = getShift(code);
  const s = sizes[size] || sizes.md;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!editable}
      style={[styles.cell, { backgroundColor: shift.color, width: s.w, height: s.h, borderRadius: s.r }]}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, { fontSize: s.fs, color: shift.textColor }]} numberOfLines={1}>
        {shift.label}
      </Text>
    </TouchableOpacity>
  );
}

const sizes = {
  sm: { w: 28, h: 26, fs: 8,  r: 4 },
  md: { w: 36, h: 32, fs: 10, r: 6 },
  lg: { w: 48, h: 42, fs: 12, r: 8 },
};

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
    ...Platform.select({ web: { cursor: 'pointer' } }),
  },
  label: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
