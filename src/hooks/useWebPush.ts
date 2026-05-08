import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../utils/api';

type WebPushState = {
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush(): WebPushState {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      return 'unsupported';
    }
    return Notification.permission;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check existing subscription on mount
  useEffect(() => {
    if (permission === 'unsupported') return;

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(sub !== null);
      });
    }).catch(() => {
      // SW not ready yet
    });
  }, [permission]);

  const subscribe = useCallback(async () => {
    if (permission === 'unsupported') return;
    setIsLoading(true);
    setError(null);

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return;

      const keyRes = await authenticatedFetch('/api/settings/push/vapid-public-key');
      if (!keyRes.ok) throw new Error(`VAPID key request failed (${keyRes.status})`);
      const { publicKey } = await keyRes.json();
      if (typeof publicKey !== 'string' || !publicKey) throw new Error('Missing VAPID public key');

      const registration = await navigator.serviceWorker.ready;
      await registration.update().catch(() => undefined);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      const subJson = subscription.toJSON();
      const subscribeResponse = await authenticatedFetch('/api/settings/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });
      if (!subscribeResponse.ok) {
        throw new Error(`Push subscription save failed (${subscribeResponse.status})`);
      }

      setIsSubscribed(true);
    } catch (err) {
      console.error('Push subscribe failed:', err);
      setError(err instanceof Error ? err.message : 'Push subscribe failed');
    } finally {
      setIsLoading(false);
    }
  }, [permission]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await authenticatedFetch('/api/settings/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        });
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      setError(err instanceof Error ? err.message : 'Push unsubscribe failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { permission, isSubscribed, isLoading, error, subscribe, unsubscribe };
}
