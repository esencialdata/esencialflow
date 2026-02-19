
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { PomodoroProvider } from './context/PomodoroContext'
import { ToastProvider } from './context/ToastContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <PomodoroProvider>
      <App />
    </PomodoroProvider>
  </ToastProvider>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service Worker registration failed:', error)
    })
  })
}
