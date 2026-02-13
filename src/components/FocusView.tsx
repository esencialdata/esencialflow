import React, { useState, useMemo } from 'react';
import { useCards } from '../hooks/useSupabaseCards';
import { Card } from '../types/data';
import { usePomodoro } from '../context/PomodoroContext';
import LoadingOverlay from './LoadingOverlay';
import QueueModal from './QueueModal';

interface FocusViewProps {
    boardId: string | null;
    onStartFocus: (card: Card) => void;
    onEditCard: (card: Card) => void;
}

const FocusView: React.FC<FocusViewProps> = ({ boardId, onStartFocus, onEditCard }) => {
    const { cards, isLoading, error, handleUpdateCard } = useCards(boardId);
    const { isRunning, activeCard, mmss, pause, stop, phase } = usePomodoro();
    const [queueOpen, setQueueOpen] = useState(false);

    // Strict Sorting Logic
    const sortedQueue = useMemo(() => {
        if (!cards) return [];

        const all = Object.values(cards).flat();
        const active = all.filter(c => !c.completed && !c.archived);

        // Sort Logic: High Priority > Due Date > Oldest Created
        return active.sort((a, b) => {
            // 1. Priority: High vs Non-High
            if (a.priority === 'high' && b.priority !== 'high') return -1;
            if (b.priority === 'high' && a.priority !== 'high') return 1;

            // 2. Due Date (Ascending: Earlier dates first)
            const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;

            if (dateA !== dateB) return dateA - dateB;

            // 3. Created At (Oldest first)
            const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return createdA - createdB;
        });
    }, [cards]);

    const heroCard = sortedQueue.length > 0 ? sortedQueue[0] : null;

    // The "Rest" of the queue (excluding hero)
    const viewableQueue = sortedQueue.slice(1);

    const handleToggleComplete = async (card: Card) => {
        try {
            await handleUpdateCard(card.id, { completed: !card.completed });
        } catch (e) {
            console.error('Failed to toggle complete', e);
        }
    };

    const togglePiP = async () => {
        if (!('documentPictureInPicture' in window)) return;
        try {
            const dpip = (window as any).documentPictureInPicture;
            if (dpip.window) {
                dpip.window.close();
                return;
            }
            const win = await dpip.requestWindow({ width: 300, height: 150 });

            Array.from(document.styleSheets).forEach((styleSheet) => {
                try {
                    if (styleSheet.href) {
                        const link = win.document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = styleSheet.href;
                        win.document.head.appendChild(link);
                    }
                } catch (e) { }
            });

            const container = win.document.createElement('div');
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.alignItems = 'center';
            container.style.justifyContent = 'center';
            container.style.height = '100vh';
            container.style.background = '#000';
            container.style.color = '#fff';
            container.style.fontFamily = 'monospace';

            const updatePiP = () => {
                // Determine phase text
                // Since we can't easily access the current 'phase' variable inside this interval closure without ref,
                // we'll just show the timer and title.
                // A full portal would be better but this is a quick implementation.
                container.innerHTML = `
                    <div style="font-size: 3rem; margin-bottom: 0.5rem; line-height: 1;">${document.querySelector('.timer-display')?.textContent || '--:--'}</div>
                    <div style="font-size: 1rem; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%;">${activeCard?.title || ''}</div>
                `;
            };

            updatePiP();
            const interval = setInterval(updatePiP, 1000);

            win.document.body.append(container);
            win.document.body.style.margin = '0';

            win.addEventListener('pagehide', () => clearInterval(interval));
        } catch (e) {
            console.error(e);
        }
    };

    if (isLoading) return <LoadingOverlay message="Sintonizando frecuencia..." />;
    if (error) return <div className="error-message">{error}</div>;

    // --- TIMER VIEW (Active Session) ---
    if (isRunning && activeCard) {
        return (
            <div className="focus-view-container timer-active" style={{
                height: '100vh',
                width: '100vw',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '2rem',
                boxSizing: 'border-box',
                position: 'relative',
                background: '#000', // Deep focus
                color: '#fff'
            }}>
                {/* Visual Pulse Background */}
                <div className="pulse-bg" />

                {/* Queue Toggle (still accessible) */}
                <button
                    onClick={() => setQueueOpen(true)}
                    className="queue-toggle-btn"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    {sortedQueue.length > 1 ? `Ver Cola (${sortedQueue.length - 1})` : 'Cola'}
                </button>

                <div style={{ textAlign: 'center', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="phase-badge" style={{
                        textTransform: 'uppercase',
                        letterSpacing: '0.2em',
                        fontSize: '1rem',
                        color: phase === 'focus' ? 'var(--color-primary)' : '#4ade80',
                        marginBottom: '2rem'
                    }}>
                        {phase === 'focus' ? 'ENFOQUE TOTAL' : 'DESCANSO'}
                    </div>

                    <div className="timer-display" style={{
                        fontSize: 'clamp(6rem, 20vw, 12rem)', // HUGE timer
                        fontFamily: "'Outfit', monospace", // Use monospace if available or standard sans
                        fontWeight: 200,
                        lineHeight: 0.9,
                        marginBottom: '2rem',
                        fontVariantNumeric: 'tabular-nums'
                    }}>
                        {mmss}
                    </div>

                    <h1 style={{
                        fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
                        fontWeight: 600,
                        margin: '0 0 3rem 0',
                        maxWidth: '900px',
                        opacity: 0.9
                    }}>
                        {activeCard.title}
                    </h1>

                    <div className="timer-controls" style={{ display: 'flex', gap: '2rem' }}>
                        <button onClick={pause} className="control-btn-large pause">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            <span>Pausar</span>
                        </button>
                        <button onClick={stop} className="control-btn-large stop">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                            <span>Terminar</span>
                        </button>
                        {'documentPictureInPicture' in window && (
                            <button onClick={togglePiP} className="control-btn-large" title="Ventana Flotante">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10"></path><line x1="16" y1="5" x2="21" y2="5"></line><line x1="21" y1="5" x2="21" y2="10"></line><line x1="12" y1="14" x2="21" y2="5"></line></svg>
                            </button>
                        )}
                    </div>
                </div>

                <QueueModal
                    isOpen={queueOpen}
                    onClose={() => setQueueOpen(false)}
                    queue={viewableQueue}
                    onJumpTo={(card) => { onStartFocus(card); }} // Switching focus
                    onToggleComplete={handleToggleComplete}
                    onEdit={onEditCard}
                />

                <style>{`
                    .pulse-bg {
                        position: absolute;
                        top: 50%; left: 50%;
                        transform: translate(-50%, -50%);
                        width: 100vw; height: 100vh;
                        background: radial-gradient(circle at center, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
                        z-index: 0;
                        animation: gentle-pulse 4s infinite alternate;
                        pointer-events: none;
                    }
                    @keyframes gentle-pulse {
                        0% { opacity: 0.5; transform: translate(-50%, -50%) scale(0.9); }
                        100% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
                    }
                    .queue-toggle-btn {
                        position: absolute;
                        top: 2rem; left: 2rem;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.1);
                        color: rgba(255,255,255,0.7);
                        cursor: pointer;
                        border-radius: 8px;
                        padding: 8px 16px;
                        font-size: 0.85rem;
                        display: flex; alignItems: center; gap: 8px;
                        transition: all 0.2s;
                        z-index: 10;
                    }
                    .queue-toggle-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
                    .control-btn-large {
                        background: transparent;
                        border: 2px solid rgba(255,255,255,0.2);
                        color: #fff;
                        padding: 1rem 2rem;
                        border-radius: 50px;
                        font-size: 1.1rem;
                        cursor: pointer;
                        display: flex; alignItems: center; gap: 12px;
                        transition: all 0.2s;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        font-weight: 600;
                    }
                    .control-btn-large:hover {
                         border-color: #fff;
                         background: rgba(255,255,255,0.05);
                         transform: translateY(-2px);
                    }
                    .control-btn-large.pause:hover { border-color: #fbbf24; color: #fbbf24; }
                    .control-btn-large.stop:hover { border-color: #f87171; color: #f87171; }
                `}</style>
            </div>
        );
    }

    // --- STANDARD HERO VIEW ---
    return (
        <div className="focus-view-container" style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem',
            boxSizing: 'border-box',
            position: 'relative'
        }}>

            {/* Top-Left Queue Toggle */}
            <button
                onClick={() => setQueueOpen(true)}
                style={{
                    position: 'absolute',
                    top: '2rem',
                    left: '2rem',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--color-text-2)',
                    cursor: 'pointer',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                {sortedQueue.length > 1 ? `Ver Cola (${sortedQueue.length - 1} más)` : 'Ver Cola'}
            </button>

            {/* Hero Section */}
            {heroCard ? (
                <div className="hero-card" style={{
                    textAlign: 'center',
                    maxWidth: '800px',
                    animation: 'fadeInUp 0.5s ease-out',
                    zIndex: 1
                }}>
                    <div style={{ marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.9rem', color: 'var(--color-primary)' }}>
                        TAREA #1
                    </div>

                    <h1 style={{
                        fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                        fontWeight: 700,
                        margin: '0 0 1.5rem 0',
                        lineHeight: 1.1,
                        textShadow: '0 10px 30px rgba(0,0,0,0.5)'
                    }}>
                        {heroCard.title}
                    </h1>

                    <div className="hero-meta" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem', opacity: 0.8 }}>
                        {heroCard.priority === 'high' && (
                            <span style={{ color: '#fca5a5', background: 'rgba(239, 68, 68, 0.2)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>Alta Prioridad</span>
                        )}
                        {heroCard.dueDate && (
                            <span style={{ color: '#cbd5e1', background: 'rgba(51, 65, 85, 0.5)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                                {new Date(heroCard.dueDate).toLocaleDateString()}
                            </span>
                        )}
                    </div>

                    {heroCard.description && (
                        <p style={{
                            fontSize: '1.2rem',
                            opacity: 0.7,
                            maxWidth: '600px',
                            margin: '0 auto 3rem auto',
                            lineHeight: 1.6
                        }}>
                            {heroCard.description.length > 200
                                ? heroCard.description.substring(0, 200) + '...'
                                : heroCard.description}
                        </p>
                    )}

                    <button
                        onClick={() => onStartFocus(heroCard)}
                        className="pulse-button"
                        style={{
                            background: 'var(--color-primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '100px',
                            height: '100px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 0 0 rgba(59, 130, 246, 0.7)',
                            transition: 'transform 0.2s',
                            marginTop: '1rem'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    </button>

                    <div style={{ marginTop: '1.5rem' }}>
                        <button
                            onClick={() => onEditCard(heroCard)}
                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '0.9rem' }}
                        >
                            Editar Tarea
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center', opacity: 0.6 }}>
                    <h2>Todo limpio.</h2>
                    <p>No hay tareas pendientes. Disfruta tu día.</p>
                </div>
            )}

            <QueueModal
                isOpen={queueOpen}
                onClose={() => setQueueOpen(false)}
                queue={viewableQueue}
                onJumpTo={(card) => { onStartFocus(card); }}
                onToggleComplete={handleToggleComplete}
                onEdit={onEditCard}
            />

            <style>{`
        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .pulse-button {
            animation: pulse-blue 2s infinite;
        }
        @keyframes pulse-blue {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(59, 130, 246, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
        }
      `}</style>
        </div>
    );
};

export default FocusView;
