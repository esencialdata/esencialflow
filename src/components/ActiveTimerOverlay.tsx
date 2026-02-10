import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { usePomodoro } from '../context/PomodoroContext';
import './ActiveTimerOverlay.css';

const ActiveTimerOverlay: React.FC = () => {
    const { activeCard, isRunning, mmss, phase, pause, stop } = usePomodoro();
    const [domReady, setDomReady] = useState(false);

    useEffect(() => {
        setDomReady(true);
    }, []);

    useEffect(() => {
        if (isRunning && activeCard) {
            document.body.classList.add('zen-active');
        } else {
            document.body.classList.remove('zen-active');
        }
        return () => {
            document.body.classList.remove('zen-active');
        };
    }, [isRunning, activeCard]);

    if (!domReady) return null;
    if (!isRunning || !activeCard) return null;

    return ReactDOM.createPortal(
        <div className="active-timer-overlay">
            <div className="timer-content">
                <div className="phase-indicator">{phase === 'focus' ? 'FOCUS' : 'BREAK'}</div>
                <div className="timer-huge">{mmss}</div>
                <div className="current-task">
                    <span className="task-label">Working on:</span>
                    <h1 className="task-title">{activeCard.title}</h1>
                </div>

                <div className="timer-controls">
                    <button className="control-btn pause-btn" onClick={pause}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                        Pause
                    </button>
                    <button className="control-btn stop-btn" onClick={stop}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                        Stop
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ActiveTimerOverlay;
