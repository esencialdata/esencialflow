import React from 'react';
import { useToast } from '../context/ToastContext';
import './Toast.css';

const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-message">{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;

