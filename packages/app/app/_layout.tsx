import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { registerForPushNotifications } from '../src/notifications';
import { colors } from '../src/theme';

export default function RootLayout() {
  useEffect(() => {
    // Fire and forget: a device that cannot register still gets the in-app
    // alert feed, so this must never block or fail app start.
    void registerForPushNotifications();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="card/[id]" options={{ title: 'Card' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
