import React from 'react';
import Spinner from './Spinner';
import './LoadingOverlay.css';

const LoadingOverlay: React.FC<{ message?: string }> = ({ message = 'Cargando…' }) => {
  return (
    <div className="loading-overlay">
      <div className="loading-box">
        <Spinner size="lg" />
        <span className="loading-message">{message}</span>
      </div>
    </div>
  );
};

export default LoadingOverlay;

