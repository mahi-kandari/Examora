/* Firebase Cloud Messaging service worker.
 *
 * Handles push messages while the app is in the background / closed and shows
 * a system notification. Service workers can't read Vite env vars, so the
 * (public) Firebase web config is inlined here — these are the same values that
 * already ship in the client bundle, not secrets.
 *
 * If you upgrade the firebase JS SDK, bump the version in the two importScripts
 * URLs below to match.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBAoJx7cbNMSEleCuh0g45JlZKtkUHNDR8',
  authDomain: 'examora-engine.firebaseapp.com',
  projectId: 'examora-engine',
  storageBucket: 'examora-engine.firebasestorage.app',
  messagingSenderId: '16064266330',
  appId: '1:16064266330:web:26fcb4e5e51a8a0617d863',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Examora';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/favicon.svg',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});
