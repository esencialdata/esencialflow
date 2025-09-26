import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { GoogleAuthProvider, User, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from '../config/firebase';

type AuthContextValue = {
  user: User | null;
  initializing: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutFromApp: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseAuth) {
      setInitializing(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (currentUser: User | null) => {
        setUser(currentUser);
        setInitializing(false);
      },
      (authError: Error) => {
        console.error('Firebase auth listener error:', authError);
        setError(authError.message);
        setInitializing(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (!firebaseAuth) {
      setError('Firebase Auth no está configurado.');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      setError(null);
      await signInWithPopup(firebaseAuth, provider);
    } catch (signInError: any) {
      console.error('Error iniciando sesión con Google:', signInError);
      setError(signInError?.message ?? 'No se pudo iniciar sesión');
    }
  };

  const signOutFromApp = async () => {
    if (!firebaseAuth) {
      setUser(null);
      return;
    }
    try {
      await signOut(firebaseAuth);
    } catch (signOutError: any) {
      console.error('Error al cerrar sesión:', signOutError);
      setError(signOutError?.message ?? 'No se pudo cerrar sesión');
    }
  };

  const getIdToken = async () => {
    if (!firebaseAuth) return null;
    const current = firebaseAuth.currentUser;
    if (!current) return null;
    try {
      return await current.getIdToken();
    } catch (tokenError) {
      console.error('Error obteniendo ID token:', tokenError);
      setError('No se pudo obtener el token de autenticación');
      return null;
    }
  };

  const value = useMemo<AuthContextValue>(
    () => ({ user, initializing, error, signInWithGoogle, signOutFromApp, getIdToken }),
    [user, initializing, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
    const ctx = useContext(AuthContext);
    if (!ctx) {
      throw new Error('useAuth debe usarse dentro de un AuthProvider');
    }
    return ctx;
};
