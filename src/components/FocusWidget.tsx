import React, { useEffect, useState } from 'react';
import { usePomodoro } from '../context/PomodoroContext';
import './FocusWidget.css';
import { useToast } from '../context/ToastContext';

const FocusWidget: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => {
  const { activeCard, mmss, phase, isRunning, start, pause, stop } = usePomodoro();
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    // Si cambia la tarjeta activa, mostramos el widget nuevamente
    setHidden(false);
  }, [activeCard?.id]);

  if (!activeCard || hidden) return null;

  return (
    <div className={`focus-widget ${collapsed ? 'collapsed' : ''}`}>
      <div className="fw-top">
        <div className="fw-title" title={activeCard.title}>{activeCard.title}</div>
        <button className="fw-min" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir' : 'Minimizar'}>{collapsed ? '▴' : '▾'}</button>
        <button className="fw-close" onClick={() => { setHidden(true); showToast('Widget oculto. El temporizador sigue activo.', 'info'); }} aria-label="Cerrar">×</button>
      </div>
      <div className="fw-row">
        <span className="fw-phase">{phase}</span>
        <span className="fw-time">{mmss}</span>
      </div>
      {!collapsed && (
        <div className="fw-actions">
          {!isRunning ? (
            <button onClick={start}>Start</button>
          ) : (
            <button onClick={pause}>Pause</button>
          )}
          <button onClick={stop}>Stop</button>
          {onOpen && <button onClick={onOpen}>Open</button>}
        </div>
      )}
    </div>
  );
};

export default FocusWidget;
