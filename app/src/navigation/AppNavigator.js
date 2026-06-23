import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

import DashboardScreen  from '../screens/DashboardScreen';
import ScheduleScreen   from '../screens/ScheduleScreen';
import EmployeesScreen  from '../screens/EmployeesScreen';
import ReportsScreen    from '../screens/ReportsScreen';
import LoginScreen      from '../screens/LoginScreen';
import AdminScreen      from '../screens/AdminScreen';
import NotificationBell from '../components/NotificationBell';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

// Botón de cerrar sesión + nombre del usuario, para el header
function HeaderLogout() {
  const { user, logout } = useAuth();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}>
      <NotificationBell />
      <TouchableOpacity onPress={logout} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{user?.full_name}</Text>
        <Ionicons name="log-out-outline" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.header }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Rol de Turno', headerRight: () => <HeaderLogout /> }} />
      <Stack.Screen name="Schedule"  component={ScheduleScreen}  options={({ route }) => ({ title: route.params?.departmentName || 'Programación' })} />
    </Stack.Navigator>
  );
}

function ScheduleStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.header }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="ScheduleSelect" component={DepartmentSelect} options={{ title: 'Seleccionar Área' }} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={({ route }) => ({ title: route.params?.departmentName || 'Programación' })} />
    </Stack.Navigator>
  );
}

import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Surface } from 'react-native-paper';
import { api } from '../api/client';
import { useState, useEffect } from 'react';

function DepartmentSelect({ navigation }) {
  const [departments, setDepts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDepartments().then(d => { setDepts(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}><ActivityIndicator color={COLORS.primary} /></View>;

  return (
    <View style={{ flex:1, backgroundColor: COLORS.bg, alignItems: 'center' }}>
      <View style={{ maxWidth: 760, width: '100%', padding: 16, gap: 12 }}>
      <Text style={{ fontSize:18, fontWeight:'700', color: COLORS.text, marginBottom: 8 }}>Selecciona un área para ver su rol:</Text>
      {departments.map(d => (
        <TouchableOpacity key={d.id} onPress={() => navigation.navigate('Schedule', { departmentId: d.id, departmentName: d.name })}>
          <Surface style={{ padding: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }} elevation={2}>
            <Ionicons name={d.id === 1 ? 'water-outline' : 'pulse-outline'} size={28} color={COLORS.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: COLORS.text }}>{d.name}</Text>
              <Text style={{ fontSize: 13, color: COLORS.textLight }}>{d.supervisor}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
          </Surface>
        </TouchableOpacity>
      ))}
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: COLORS.primary,
          tabBarInactiveTintColor: COLORS.textLight,
          tabBarStyle: { backgroundColor: '#fff', borderTopColor: COLORS.border, height: 60, paddingBottom: 8 },
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          tabBarIcon: ({ focused, color, size }) => {
            const icons = {
              Home:      focused ? 'home' : 'home-outline',
              Horario:   focused ? 'calendar' : 'calendar-outline',
              Personal:  focused ? 'people' : 'people-outline',
              Reportes:  focused ? 'bar-chart' : 'bar-chart-outline',
              Admin:     focused ? 'shield' : 'shield-outline',
            };
            return <Ionicons name={icons[route.name] || 'ellipse-outline'} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home"     component={DashboardStack} options={{ title: 'Inicio' }} />
        <Tab.Screen name="Horario"  component={ScheduleStack}  options={{ title: 'Horario' }} />
        <Tab.Screen name="Personal" component={withHeader(EmployeesScreen, 'Personal')}  options={{ title: 'Personal' }} />
        <Tab.Screen name="Reportes" component={withHeader(ReportsScreen,   'Reportes')}  options={{ title: 'Reportes' }} />
        {isAdmin && (
          <Tab.Screen name="Admin" component={withHeader(AdminScreen, 'Administración')} options={{ title: 'Admin' }} />
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
}

function withHeader(Component, title) {
  const Wrapped = (props) => {
    return (
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: COLORS.header }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name={title} component={Component} options={{ title }} />
      </Stack.Navigator>
    );
  };
  return Wrapped;
}
