import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

// Etiquetas cortas por nivel (para que quepan bajo cada nodo)
const SHORT = { 1: 'Jefe\nÁrea', 2: 'Jefe\nServicio', 3: 'Coord.\nGral.', 4: 'Sub\nCoord.', 5: 'Dirección' };

// Anillo de pulso (efecto radar) para el nodo actual
function PulseRing({ size, color }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.delay(3500), // pausa para completar un ciclo de 5s
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, transform: [{ scale }], opacity,
      }}
    />
  );
}

// Stepper visual del flujo de aprobación: verde=firmado, ámbar=actual (con pulso), gris=pendiente
// La línea verde de progreso se anima hasta el punto donde va la solicitud.
// compact=true → versión mini (solo puntos y línea, sin etiquetas) para la vista colapsada
export default function ApprovalProgress({ approval, compact = false }) {
  const [w, setW] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;

  const chain = approval?.chain || [];
  const current_level = approval?.current_level;
  const approved = approval?.state === 'approved';
  const n = chain.length;

  // Fracción de la línea que debe ir pintada (hasta el nodo actual)
  const fraction = approved ? 1 : n > 1 ? Math.max(0, (current_level - 1) / (n - 1)) : 0;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: fraction, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [fraction, fill]);

  if (!approval || n === 0) return null;

  const isSigned  = (lvl) => approved || lvl < current_level;
  const isCurrent = (lvl) => !approved && lvl === current_level;

  const nodeSize = compact ? 18 : 28;
  const topPad = compact ? 0 : 8;
  const lineH = compact ? 4 : 4;                      // grosor de la línea punto a punto
  const lineTop = topPad + nodeSize / 2 - lineH / 2;  // centrar la línea sobre los nodos
  const trackLeft = (w * 0.5) / n;                    // centro del primer nodo
  const trackWidth = n > 1 ? (w * (n - 1)) / n : 0;   // del primer al último nodo
  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: [0, trackWidth] });

  return (
    <View
      style={[styles.wrap, compact && styles.wrapCompact]}
      onLayout={e => setW(e.nativeEvent.layout.width)}
    >
      {/* Línea base (gris) y línea de progreso (verde animada) */}
      {w > 0 && (
        <>
          <View style={[styles.trackBase, { left: trackLeft, width: trackWidth, top: lineTop, height: lineH, borderRadius: lineH / 2 }]} />
          <Animated.View style={[styles.trackFill, { left: trackLeft, width: fillWidth, top: lineTop, height: lineH, borderRadius: lineH / 2 }]} />
        </>
      )}

      {/* Nodos por encima de la línea */}
      <View style={[styles.nodesRow, { marginTop: topPad }]}>
        {chain.map((c) => {
          const signed = isSigned(c.level);
          const current = isCurrent(c.level);
          return (
            <View key={c.level} style={styles.step}>
              <View style={styles.nodeBox}>
                {current && <PulseRing size={nodeSize} color={COLORS.warning} />}
                <View style={[
                  styles.node, compact && styles.nodeCompact,
                  signed && styles.nodeSigned, current && styles.nodeCurrent,
                ]}>
                  {compact
                    ? (signed
                        ? <Ionicons name="checkmark" size={11} color="#fff" />
                        : <View style={[styles.dot, current && styles.dotCurrent]} />)
                    : (signed
                        ? <Ionicons name="checkmark" size={15} color="#fff" />
                        : <Text style={[styles.nodeNum, current && { color: '#fff' }]}>{c.level}</Text>)}
                </View>
              </View>
              {!compact && (
                <Text style={[styles.label, signed && styles.labelSigned, current && styles.labelCurrent]} numberOfLines={2}>
                  {SHORT[c.level] || c.label}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', paddingTop: 8, paddingBottom: 2 },
  wrapCompact: { paddingTop: 0, paddingBottom: 0 },

  trackBase: { position: 'absolute', height: 3, backgroundColor: '#CFD8DC', borderRadius: 2 },
  trackFill: { position: 'absolute', height: 3, backgroundColor: COLORS.success, borderRadius: 2 },

  nodesRow: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center' },
  nodeBox: { alignItems: 'center', justifyContent: 'center' },

  node: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#ECEFF1',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#CFD8DC',
  },
  nodeCompact: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  nodeSigned: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  nodeCurrent: { backgroundColor: COLORS.warning, borderColor: '#E65100' },
  nodeNum: { fontSize: 12, fontWeight: '800', color: '#90A4AE' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#B0BEC5' },
  dotCurrent: { backgroundColor: '#fff' },

  label: { fontSize: 9, color: COLORS.textLight, marginTop: 5, textAlign: 'center', fontWeight: '600', lineHeight: 11 },
  labelSigned: { color: COLORS.success },
  labelCurrent: { color: '#E65100', fontWeight: '800' },
});
