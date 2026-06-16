import { MD3LightTheme } from 'react-native-paper';

export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1565C0',
    primaryContainer: '#E3F2FD',
    secondary: '#00695C',
    secondaryContainer: '#E0F2F1',
    tertiary: '#6A1B9A',
    surface: '#FFFFFF',
    surfaceVariant: '#F5F5F5',
    background: '#F0F4F8',
    error: '#B71C1C',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
  },
  roundness: 12,
};

export const COLORS = {
  primary:   '#1565C0',
  secondary: '#00695C',
  accent:    '#FF6F00',
  bg:        '#F0F4F8',
  surface:   '#FFFFFF',
  border:    '#E0E0E0',
  text:      '#212121',
  textLight: '#757575',
  danger:    '#B71C1C',
  success:   '#2E7D32',
  warning:   '#F57F17',
  info:      '#0277BD',
  header:    '#0D47A1',
};
