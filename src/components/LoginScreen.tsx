import { useAuth } from '../context/AuthContext';

const LoginScreen = () => {
  const { signInWithGoogle, error } = useAuth();

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Acceso seguro</h1>
        <p>Autentícate con tu cuenta de Google para continuar.</p>
        <button type="button" onClick={signInWithGoogle}>Continuar con Google</button>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
};

export default LoginScreen;
