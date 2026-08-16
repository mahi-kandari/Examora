// Frontend FCM helper: request permission, obtain a device token, and store it
// on users/{uid} so the backend notification engine can reach this device.
// Everything here is best-effort — it never throws — and is a no-op in browsers
// without notification/messaging support.
import { getApp } from 'firebase/app';
import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from './firebase';

const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;

let messagingInstance = null;

async function getMessagingInstance() {
  if (messagingInstance) return messagingInstance;
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;
  try {
    messagingInstance = getMessaging(getApp());
  } catch {
    return null;
  }
  return messagingInstance;
}

/**
 * Ask for notification permission, fetch an FCM token, and persist it on
 * users/{uid}. Returns the token, or null if unavailable / denied.
 */
export async function registerPushToken(user) {
  if (!user || typeof window === 'undefined' || !('Notification' in window)) return null;
  if (!VAPID_KEY) {
    console.warn('VITE_VAPID_KEY is not set — skipping push registration.');
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return null;

    await setDoc(
      doc(db, 'users', user.uid),
      {
        notificationToken: token,
        notificationsEnabled: true,
        firstName: (user.displayName || user.email || 'there').split(' ')[0],
      },
      { merge: true }
    );
    return token;
  } catch (err) {
    console.warn('Push registration failed:', err);
    return null;
  }
}

/** Remove the FCM token locally and from users/{uid} (on logout). */
export async function unregisterPushToken(user) {
  try {
    const messaging = await getMessagingInstance();
    if (messaging) await deleteToken(messaging).catch(() => {});
    if (user?.uid) {
      await updateDoc(doc(db, 'users', user.uid), {
        notificationToken: deleteField(),
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('Push unregistration failed:', err);
  }
}
