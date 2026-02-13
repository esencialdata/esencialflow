import React from 'react';
import { Card } from '../types/data';
import './FocusMode.css';
import { usePomodoro } from '../context/PomodoroContext';

interface FocusModeProps {
  card: Card | null;
  onClose: () => void;
}

const FocusMode: React.FC<FocusModeProps> = ({ card, onClose }) => {
  const { activeCard, setActiveCard, isRunning, phase, mmss, start, pause, stop, setPreset } = usePomodoro();

  if (!card) return null;

  // Ensure context has the current card
  React.useEffect(() => {
    if (card && (!activeCard || activeCard.id !== card.id)) {
      setActiveCard(card);
    }
  }, [card, activeCard, setActiveCard]);

  const handleClose = () => {
    // No detener el timer al cerrar: se mantiene corriendo en el widget
    onClose();
  };

  return (
    <div className="focus-mode-overlay" onClick={handleClose}>
      <div className="focus-mode-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={handleClose}>×</button>
        <h2>{card.title}</h2>
        <p><strong>Prioridad:</strong> {card.priority === 'high' ? 'Alta' : card.priority === 'low' ? 'Baja' : 'Media'}</p>
        {card.dueDate && <p><strong>Due:</strong> {new Date(card.dueDate).toLocaleDateString()}</p>}

        <div className="pomodoro">
          <div className="phase">{phase === 'focus' ? 'Focus' : 'Break'}</div>
          <div className="timer-display">{mmss}</div>
          <div className="controls">
            {!isRunning ? (
              <button onClick={() => start()}>Start</button>
            ) : (
              <button onClick={pause}>Pause</button>
            )}
            <button onClick={stop}>Stop</button>
          </div>
          <div className="presets">
            <button onClick={() => setPreset(25, 5)}>25/5</button>
            <button onClick={() => setPreset(50, 10)}>50/10</button>
            <button onClick={() => setPreset(90, 15)}>90/15</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FocusMode;
