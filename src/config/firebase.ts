import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const readConfig = () => {
  const {
    VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID,
  } = import.meta.env;

  if (
    VITE_FIREBASE_API_KEY &&
    VITE_FIREBASE_AUTH_DOMAIN &&
    VITE_FIREBASE_PROJECT_ID &&
    VITE_FIREBASE_STORAGE_BUCKET &&
    VITE_FIREBASE_MESSAGING_SENDER_ID &&
    VITE_FIREBASE_APP_ID
  ) {
    return {
      apiKey: VITE_FIREBASE_API_KEY,
      authDomain: VITE_FIREBASE_AUTH_DOMAIN,
      projectId: VITE_FIREBASE_PROJECT_ID,
      storageBucket: VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: VITE_FIREBASE_APP_ID,
    };
  }

  console.warn('Firebase config env vars missing. Auth will remain disabled.');
  return null;
};

export const firebaseConfig = readConfig();

export const firebaseApp = (() => {
  if (!firebaseConfig) return null;
  if (!getApps().length) {
    return initializeApp(firebaseConfig);
  }
  return getApps()[0];
})();

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
