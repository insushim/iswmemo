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

import * as SecureStore from "expo-secure-store";
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

  const bottomPadding =
    Platform.OS === "android" ? Math.max(insets.bottom, 4) : 4;
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

// SplashScreen이 덮고 있는 동안 보이는 빈 화면 (Stack.Screen용)
const LoadingScreen = () => null;

export default function Navigation() {
  const { colors } = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  // 토큰이 있으면 로딩 중에도 MainTabs를 보여줘서 깜빡임 방지
  const [hasToken, setHasToken] = React.useState(false);
  React.useEffect(() => {
    SecureStore.getItemAsync("auth_token").then((t) => {
      if (t) setHasToken(true);
    });
  }, []);

  // 토큰이 있으면 로딩 중에도 Main 화면 유지 (null 화면 깜빡임 방지)
  const showMain = isAuthenticated || (isLoading && hasToken);

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          // 스크린 교체 시 네이티브 전환 애니메이션 비활성화 (깜빡임 방지)
          animation: "none",
        }}
      >
        {showMain ? (
          <Stack.Screen name="Main" component={MemoizedMainTabs} />
        ) : isLoading ? (
          <Stack.Screen name="Loading" component={LoadingScreen} />
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
