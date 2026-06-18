import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

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
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Ionicons name="medical" size={56} color={COLORS.primary} />
          <Text style={styles.title}>Rol de Turno</Text>
          <Text style={styles.subtitle}>Hospital María Especialidades Pediátricas</Text>
        </View>

        <Surface style={styles.card} elevation={2}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>

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
            contentStyle={{ paddingVertical: 6 }}
          >
            Entrar
          </Button>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: COLORS.bg },
  logoWrap: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.header, marginTop: 8 },
  subtitle: { fontSize: 13, color: COLORS.textLight, marginTop: 4, textAlign: 'center' },
  card: { padding: 24, borderRadius: 16, gap: 4, maxWidth: 420, width: '100%', alignSelf: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  input: { marginBottom: 12, backgroundColor: '#fff' },
  button: { marginTop: 8, borderRadius: 12 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FDECEA', padding: 10, borderRadius: 8, marginBottom: 8 },
  errorText: { color: COLORS.danger, flex: 1, fontSize: 13 },
});
