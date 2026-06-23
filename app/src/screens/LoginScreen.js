import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ImageBackground } from 'react-native';
import { TextInput, Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

const BG_IMAGE =
  'https://images.unsplash.com/photo-1538108149393-fbbd81895907?auto=format&fit=crop&w=1600&q=80';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!username.trim() || !password) {
      setError('Ingresa tu usuario y contraseña');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      // Al iniciar sesión, el navegador cambia solo a la app
    } catch (e) {
      const msg = e.response?.data?.error || 'No se pudo iniciar sesión. Revisa tu conexión.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ImageBackground source={{ uri: BG_IMAGE }} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <View style={styles.brand}>
              <View style={styles.logoBadge}>
                <Ionicons name="calendar" size={26} color="#fff" />
              </View>
              <Text style={styles.title}>Rol de Turno</Text>
              <View style={styles.divider} />
              <Text style={styles.subtitle}>Sistema de programación de turnos</Text>
            </View>

            <Surface style={styles.card} elevation={5}>
              <Text style={styles.cardTitle}>Iniciar sesión</Text>
              <Text style={styles.cardSub}>Ingresa tus credenciales para continuar</Text>

              <TextInput
                label="Usuario"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                mode="outlined"
                left={<TextInput.Icon icon="account" />}
                style={styles.input}
                onSubmitEditing={onSubmit}
              />

              <TextInput
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                mode="outlined"
                left={<TextInput.Icon icon="lock" />}
                right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(s => !s)} />}
                style={styles.input}
                onSubmitEditing={onSubmit}
              />

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={COLORS.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Button
                mode="contained"
                onPress={onSubmit}
                loading={submitting}
                disabled={submitting}
                style={styles.button}
                contentStyle={{ paddingVertical: 5 }}
                labelStyle={{ fontSize: 15, fontWeight: '700', letterSpacing: 0.5 }}
              >
                Entrar
              </Button>
            </Surface>

            <Text style={styles.footer}>Acceso restringido · Personal autorizado</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, width: '100%', height: '100%', backgroundColor: COLORS.header },
  overlay: { flex: 1, backgroundColor: 'rgba(13,71,161,0.82)' },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 20 },

  brand: { alignItems: 'center', marginBottom: 18 },
  logoBadge: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  divider: { width: 44, height: 3, borderRadius: 2, backgroundColor: COLORS.accent, marginVertical: 8 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', letterSpacing: 0.3 },

  card: {
    padding: 22, borderRadius: 18, gap: 2, maxWidth: 380, width: '100%', alignSelf: 'center',
    backgroundColor: '#FFFFFF',
  },
  cardTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text },
  cardSub: { fontSize: 12, color: COLORS.textLight, marginBottom: 14 },
  input: { marginBottom: 10, backgroundColor: '#fff' },
  button: { marginTop: 6, borderRadius: 12 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FDECEA', padding: 9, borderRadius: 8, marginBottom: 6 },
  errorText: { color: COLORS.danger, flex: 1, fontSize: 13 },

  footer: { textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 16, letterSpacing: 0.3 },
});
