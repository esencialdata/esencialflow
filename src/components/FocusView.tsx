import React, { useState, useMemo } from 'react';
import { useCards } from '../hooks/useSupabaseCards';
import { Card } from '../types/data';

import ActiveTimerOverlay from './ActiveTimerOverlay';
import LoadingOverlay from './LoadingOverlay';
import QueueModal from './QueueModal';
import { api } from '../config/http';
import { API_URL } from '../config/api';

interface FocusViewProps {
    boardId: string | null;
    onStartFocus: (card: Card) => void;
    onEditCard: (card: Card) => void;
}

const FocusView: React.FC<FocusViewProps> = ({ boardId, onStartFocus, onEditCard }) => {
    const { cards, isLoading, error, fetchCards } = useCards(boardId);
    // const { isRunning, activeCard } = usePomodoro(); // Not used directly here anymore, handled by Overlay
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
            // If no due date, consider it "far future" (or maybe handled last? Request implied strict "High > DueDate")
            // Imputing no due date as MAX_SAFE_INTEGER puts them at the end.
            const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
            const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;

            if (dateA !== dateB) {
                return dateA - dateB;
            }

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
            await api.put(`${API_URL}/cards/${card.id}`, { ...card, completed: !card.completed });
            if (boardId) fetchCards(boardId);
        } catch (e) {
            console.error('Failed to toggle complete', e);
        }
    };

    if (isLoading) return <LoadingOverlay message="Sintonizando frecuencia..." />;
    if (error) return <div className="error-message">{error}</div>;

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
            {/* 1. Active Timer Overlay */}
            <ActiveTimerOverlay />

            {/* 2. Top-Left Queue Toggle */}
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

            {/* 3. Hero Section */}
            {heroCard ? (
                <div className="hero-card" style={{
                    textAlign: 'center',
                    maxWidth: '800px',
                    animation: 'fadeInUp 0.5s ease-out',
                    zIndex: 1 // Ensure it's above background but below overlays
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
