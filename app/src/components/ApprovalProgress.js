import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

// Etiquetas cortas por nivel (para que quepan bajo cada nodo)
const SHORT = { 1: 'Jefe\nÁrea', 2: 'Jefe\nServicio', 3: 'Coord.\nGral.', 4: 'Sub\nCoord.', 5: 'Dirección' };

// Stepper visual del flujo de aprobación: verde=firmado, ámbar=actual, gris=pendiente
export default function ApprovalProgress({ approval }) {
  if (!approval) return null;
  const { chain = [], current_level, state } = approval;
  const approved = state === 'approved';
  const isSigned  = (lvl) => approved || lvl < current_level;
  const isCurrent = (lvl) => !approved && lvl === current_level;

  return (
    <View style={styles.row}>
      {chain.map((c, i) => {
        const signed = isSigned(c.level);
        const current = isCurrent(c.level);
        const leftDone = i > 0 && isSigned(chain[i - 1].level);
        return (
          <View key={c.level} style={styles.step}>
            <View style={styles.lineRow}>
              <View style={[styles.half, i === 0 && styles.hidden, leftDone && styles.halfDone]} />
              <View style={[styles.node, signed && styles.nodeSigned, current && styles.nodeCurrent]}>
                {signed
                  ? <Ionicons name="checkmark" size={15} color="#fff" />
                  : <Text style={[styles.nodeNum, current && { color: '#fff' }]}>{c.level}</Text>}
              </View>
              <View style={[styles.half, i === chain.length - 1 && styles.hidden, signed && styles.halfDone]} />
            </View>
            <Text style={[styles.label, signed && styles.labelSigned, current && styles.labelCurrent]} numberOfLines={2}>
              {SHORT[c.level] || c.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 8, paddingBottom: 2 },
  step: { flex: 1, alignItems: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  half: { flex: 1, height: 3, backgroundColor: '#CFD8DC', borderRadius: 2 },
  halfDone: { backgroundColor: COLORS.success },
  hidden: { backgroundColor: 'transparent' },
  node: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#ECEFF1',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#CFD8DC',
  },
  nodeSigned: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  nodeCurrent: { backgroundColor: COLORS.warning, borderColor: '#E65100' },
  nodeNum: { fontSize: 12, fontWeight: '800', color: '#90A4AE' },
  label: { fontSize: 9, color: COLORS.textLight, marginTop: 5, textAlign: 'center', fontWeight: '600', lineHeight: 11 },
  labelSigned: { color: COLORS.success },
  labelCurrent: { color: '#E65100', fontWeight: '800' },
});
