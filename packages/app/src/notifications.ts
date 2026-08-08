import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { api } from './api/client';

/** Alerts should surface even with the app open — that is the whole point. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface RegistrationResult {
  registered: boolean;
  reason?: string;
}

/**
 * Ask for permission, obtain an Expo push token and hand it to the server.
 *
 * Every failure path here is normal rather than exceptional — simulators have
 * no push support, users decline, web has no native push — so this reports a
 * reason instead of throwing and interrupting app start.
 */
export async function registerForPushNotifications(): Promise<RegistrationResult> {
  if (Platform.OS === 'web') {
    return { registered: false, reason: 'Push notifications are not supported on web.' };
  }
  if (!Device.isDevice) {
    return { registered: false, reason: 'Push notifications need a physical device.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('price-swings', {
      name: 'Price swings',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F5A524',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return { registered: false, reason: 'Notification permission was declined.' };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

  try {
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await api.registerPushToken(token.data, Platform.OS);
    return { registered: true };
  } catch (error) {
    return {
      registered: false,
      reason: error instanceof Error ? error.message : 'Could not obtain a push token.',
    };
  }
}
