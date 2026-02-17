import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CalendarCheck, Zap, CalendarDays, Target, StickyNote, Settings } from 'lucide-react-native';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';
import { useAuthStore } from '../store/auth';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import SimpleHomeScreen from '../screens/SimpleHomeScreen';
import HabitsScreen from '../screens/HabitsScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import GoalsScreen from '../screens/GoalsScreen';
import NotesScreen from '../screens/NotesScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const bottomPadding = Platform.OS === 'android' ? Math.max(insets.bottom, 4) : 4;
  const tabBarHeight = 56 + bottomPadding;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          paddingBottom: bottomPadding,
          paddingTop: 4,
          height: tabBarHeight,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: '600',
          marginTop: -2,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tab.Screen
        name="Tasks"
        component={SimpleHomeScreen}
        options={{
          tabBarLabel: '오늘',
          tabBarIcon: ({ color }) => <CalendarCheck size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Habits"
        component={HabitsScreen}
        options={{
          tabBarLabel: '습관',
          tabBarIcon: ({ color }) => <Zap size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          tabBarLabel: '일정',
          tabBarIcon: ({ color }) => <CalendarDays size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          tabBarLabel: '목표',
          tabBarIcon: ({ color }) => <Target size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesScreen}
        options={{
          tabBarLabel: '메모',
          tabBarIcon: ({ color }) => <StickyNote size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: '설정',
          tabBarIcon: ({ color }) => <Settings size={19} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return null;
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
          <Stack.Screen name="Main" component={MainTabs} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
