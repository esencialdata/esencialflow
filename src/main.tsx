
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { PomodoroProvider } from './context/PomodoroContext'
import { ToastProvider } from './context/ToastContext'
import { AuthProvider } from './context/AuthContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <AuthProvider>
      <PomodoroProvider>
        <App />
      </PomodoroProvider>
    </AuthProvider>
  </ToastProvider>
)
