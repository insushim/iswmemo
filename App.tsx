import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Navigation from './src/navigation';
import { useAuthStore } from './src/store/auth';

// 스플래시 스크린 유지
SplashScreen.preventAutoHideAsync();

export default function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    const init = async () => {
      try {
        await checkAuth();
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    init();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Navigation />
    </SafeAreaProvider>
  );
}
