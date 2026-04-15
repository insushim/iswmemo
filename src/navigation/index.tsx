import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  ListTodo,
  Zap,
  CalendarDays,
  Target,
  StickyNote,
  Settings,
} from "lucide-react-native";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";
import { useAuthStore } from "../store/auth";
import { useBannerStore } from "../store/banner";

import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";
import SimpleHomeScreen from "../screens/SimpleHomeScreen";
import HabitsScreen from "../screens/HabitsScreen";
import ScheduleScreen from "../screens/ScheduleScreen";
import GoalsScreen from "../screens/GoalsScreen";
import NotesScreen from "../screens/NotesScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // 날씨/배터리 데이터 글로벌 초기화 (1회만 실행)
  React.useEffect(() => {
    useBannerStore.getState().init();
  }, []);

  // 잠금화면 wake 시 insets.bottom이 일시적으로 0으로 떨어지면서
  // 탭바 height가 줄었다가 다시 늘어나며 깜빡임 발생.
  // 한번 측정된 최대값을 유지해서 stable height 보장.
  const stablePaddingRef = React.useRef(0);
  const rawPadding =
    Platform.OS === "android" ? Math.max(insets.bottom, 4) : 4;
  if (rawPadding > stablePaddingRef.current) {
    stablePaddingRef.current = rawPadding;
  }
  const bottomPadding = stablePaddingRef.current || rawPadding;
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
          fontWeight: "600",
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
          tabBarLabel: "할일",
          tabBarIcon: ({ color }) => <ListTodo size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Habits"
        component={HabitsScreen}
        options={{
          tabBarLabel: "습관",
          tabBarIcon: ({ color }) => <Zap size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          tabBarLabel: "일정",
          tabBarIcon: ({ color }) => <CalendarDays size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          tabBarLabel: "목표",
          tabBarIcon: ({ color }) => <Target size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesScreen}
        options={{
          tabBarLabel: "메모",
          tabBarIcon: ({ color }) => <StickyNote size={19} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: "설정",
          tabBarIcon: ({ color }) => <Settings size={19} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

const MemoizedMainTabs = React.memo(MainTabs);

export default function Navigation() {
  const { colors } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // App.tsx에서 초기화 완료 후 마운트되므로 isLoading/hasToken 체크 불필요
  // isAuthenticated만으로 즉시 올바른 화면 결정 (레이스 컨디션 없음)
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "none",
        }}
      >
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MemoizedMainTabs} />
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
