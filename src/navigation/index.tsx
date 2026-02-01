import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, CheckSquare, Target, Repeat, StickyNote, Clock, ListTodo } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { useAuthStore } from '../store/auth';
import { useSettingsStore } from '../store/settings';

// Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import DashboardScreen from '../screens/DashboardScreen';
import SimpleHomeScreen from '../screens/SimpleHomeScreen';
import TasksScreen from '../screens/TasksScreen';
import HabitsScreen from '../screens/HabitsScreen';
import GoalsScreen from '../screens/GoalsScreen';
import NotesScreen from '../screens/NotesScreen';
import RoutinesScreen from '../screens/RoutinesScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { startScreen, loadSettings, isLoaded } = useSettingsStore();
  const navigationRef = useRef<any>(null);
  const hasNavigated = useRef(false);

  // 설정 로드
  useEffect(() => {
    loadSettings();
  }, []);

  // 시작 화면으로 이동 (기본값: Simple)
  useEffect(() => {
    if (isLoaded && !hasNavigated.current && navigationRef.current) {
      hasNavigated.current = true;
      // Simple 화면이 기본값
      const screenToNavigate = startScreen === 'Routines' ? 'Routines' : 'Simple';
      if (screenToNavigate !== 'Simple') {
        setTimeout(() => {
          navigationRef.current?.navigate(screenToNavigate);
        }, 100);
      }
    }
  }, [isLoaded, startScreen]);

  // Android 네비게이션 바 겹침 방지를 위한 패딩 계산
  const bottomPadding = Platform.OS === 'android' ? Math.max(insets.bottom, 8) : 8;
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tab.Navigator
      // @ts-ignore
      ref={navigationRef}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          height: tabBarHeight,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tab.Screen
        name="Simple"
        component={SimpleHomeScreen}
        options={{
          tabBarLabel: '할일',
          tabBarIcon: ({ color, size }) => <ListTodo size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Routines"
        component={RoutinesScreen}
        options={{
          tabBarLabel: '루틴',
          tabBarIcon: ({ color, size }) => <Clock size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return null; // 또는 스플래시 스크린
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        {!isAuthenticated ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
