import { Expo, type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';

import type { Alert } from '@pokedex/shared';

import type { Db } from '../db/index.js';
import { listUnpushedAlerts, markAlertsPushed } from '../repos/alerts.js';
import { deletePushToken, listPushTokens } from '../repos/push.js';

export interface PushResult {
  alerts: number;
  tokens: number;
  sent: number;
  errors: string[];
}

/**
 * Deliver pending alerts to every registered device via Expo's push service,
 * which fans out to APNs and FCM so the mobile builds need no per-platform
 * credentials of their own.
 */
export async function deliverPendingAlerts(db: Db, expo = new Expo()): Promise<PushResult> {
  const alerts = listUnpushedAlerts(db);
  const tokens = listPushTokens(db).filter((entry) => Expo.isExpoPushToken(entry.token));

  const result: PushResult = { alerts: alerts.length, tokens: tokens.length, sent: 0, errors: [] };
  if (alerts.length === 0) return result;

  // Nothing to deliver to, but the alerts still exist in the in-app feed —
  // mark them handled so they do not queue up forever.
  if (tokens.length === 0) {
    markAlertsPushed(db, alerts.map((alert) => alert.id));
    return result;
  }

  const messages: ExpoPushMessage[] = [];
  for (const alert of alerts) {
    for (const entry of tokens) {
      messages.push({
        to: entry.token,
        sound: 'default',
        title: alert.title,
        body: alert.body,
        data: { alertId: alert.id, cardId: alert.cardId, variant: alert.variant },
        priority: alert.magnitude === 'extreme' ? 'high' : 'default',
      });
    }
  }

  const tickets: ExpoPushTicket[] = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const [index, ticket] of tickets.entries()) {
    if (ticket.status === 'ok') {
      result.sent += 1;
      continue;
    }
    result.errors.push(ticket.message);
    // A device that uninstalled the app must be dropped or every future send
    // wastes a slot on it.
    if (ticket.details?.error === 'DeviceNotRegistered') {
      const token = messages[index]?.to;
      if (typeof token === 'string') deletePushToken(db, token);
    }
  }

  markAlertsPushed(db, alerts.map((alert) => alert.id));
  return result;
}

export function pushableAlertCount(alerts: readonly Alert[]): number {
  return alerts.filter((alert) => alert.pushedAt == null).length;
}
