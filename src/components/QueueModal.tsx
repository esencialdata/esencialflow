import React from 'react';
import { Card } from '../types/data';
import { getPrioritySignals } from '../utils/prioritization';

interface QueueModalProps {
    isOpen: boolean;
    onClose: () => void;
    queue: Card[];
    onJumpTo: (card: Card) => void;
    onToggleComplete: (card: Card) => void;
    onEdit: (card: Card) => void;
}

const QueueModal: React.FC<QueueModalProps> = ({ isOpen, onClose, queue, onJumpTo, onToggleComplete, onEdit }) => {
    if (!isOpen) return null;

    return (
        <div className="queue-modal-overlay">
            <div className="queue-modal-content">
                <div className="queue-header">
                    <h2>La Cola de Ejecución</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>

                <div className="queue-list">
                    {queue.length === 0 ? (
                        <p className="empty-queue">No hay más tareas. Eres libre.</p>
                    ) : (
                        queue.map((card, index) => {
                            const signals = getPrioritySignals(card);
                            return (
                            <div key={card.id} className="queue-item">
                                <div className="queue-item-left">
                                    <span className="queue-index">#{index + 1}</span>
                                    <button
                                        className={`check-circle ${card.completed ? 'completed' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); onToggleComplete(card); }}
                                        title="Marcar como completado"
                                    >
                                        {card.completed && <span>✓</span>}
                                    </button>
                                    <div
                                        className="queue-item-details"
                                        onClick={() => onEdit(card)}
                                        title="Ver detalles / Editar"
                                    >
                                        <h3 className={card.completed ? 'completed-text' : ''}>{card.title}</h3>
                                        <div className="tags-row">
                                            <span className="tag score">S/{Math.round(signals.score)}</span>
                                            {signals.label && <span className="tag">{signals.label}</span>}
                                            {card.priority === 'high' && <span className="tag high">Alta</span>}
                                            {card.dueDate && <span className="tag date">{new Date(card.dueDate).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                </div>
                                <button className="jump-btn" onClick={(e) => { e.stopPropagation(); onJumpTo(card); onClose(); }}>
                                    Saltar aquí
                                </button>
                            </div>
                        )})
                    )}
                </div>
            </div>

            <style>{`
                .queue-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.24);
                    backdrop-filter: blur(18px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    animation: fadeIn 0.2s;
                }
                .queue-modal-content {
                    background: rgba(255, 255, 255, 0.82);
                    border: 1px solid rgba(255, 255, 255, 0.72);
                    border-radius: 28px;
                    width: 90%;
                    max-width: 720px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    backdrop-filter: blur(28px) saturate(1.18);
                    -webkit-backdrop-filter: blur(28px) saturate(1.18);
                    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.14);
                }
                .queue-header {
                    padding: 1.15rem 1.25rem;
                    border-bottom: 1px solid var(--color-border-light);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .queue-header h2 {
                    margin: 0;
                    font-size: 1.35rem;
                    color: var(--color-text);
                    font-weight: 900;
                }
                .close-btn {
                    background: none;
                    border: 1px solid var(--color-border-light);
                    color: var(--color-text);
                    font-size: 2rem;
                    line-height: 1;
                    cursor: pointer;
                    border-radius: 999px;
                    width: 40px;
                    height: 40px;
                    padding: 0;
                }
                .queue-list {
                    padding: 1rem;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .queue-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.9rem;
                    background: transparent;
                    border-radius: 16px;
                    border: 1px solid var(--color-border-light);
                    transition: border-color 0.2s, background 0.2s;
                }
                .queue-item:hover {
                    border-color: var(--color-border-light);
                    background: rgba(242, 242, 247, 0.86);
                }
                .queue-item-left {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex: 1;
                    min-width: 0;
                }
                .queue-index {
                    color: var(--color-text-muted);
                    font-family: monospace;
                    font-size: 0.9rem;
                    min-width: 24px;
                }
                .check-circle {
                    width: 20px;
                    height: 20px;
                    border-radius: 999px;
                    border: 1px solid var(--color-border-light);
                    background: transparent;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    color: var(--color-text);
                    font-size: 12px;
                    flex-shrink: 0;
                }
                .check-circle:hover {
                    background: var(--color-surface-2);
                }
                .check-circle.completed {
                    background: var(--color-accent-green);
                    border-color: var(--color-accent-green);
                    color: #fff;
                }
                .queue-item-details {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    overflow: hidden;
                    cursor: pointer;
                    flex: 1;
                }
                .queue-item-details:hover h3 {
                    color: var(--color-text);
                    text-decoration: underline;
                    text-decoration-color: var(--color-border);
                }
                .tags-row {
                    display: flex; gap: 6px; flex-wrap: wrap;
                }
                .queue-item-details h3 {
                    margin: 0;
                    font-size: 1rem;
                    color: var(--color-text);
                    font-weight: 800;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .completed-text {
                    text-decoration: line-through;
                    color: var(--color-text-muted);
                }
                .tag {
                    font-size: 0.7rem;
                    padding: 3px 6px;
                    border-radius: 999px;
                    border: 1px solid var(--color-border-light);
                    background: transparent;
                    color: var(--color-text-muted);
                    width: fit-content;
                    font-weight: 800;
                }
                .tag.high {
                    border-color: var(--color-accent-red);
                    color: var(--color-accent-red);
                }
                .tag.score {
                    border-color: var(--color-border-light);
                    background: var(--color-accent-blue);
                    color: #fff;
                }
                .jump-btn {
                    padding: 8px 10px;
                    font-size: 0.82rem;
                    color: #fff;
                    background: var(--color-accent-blue);
                    border: 1px solid transparent;
                    border-radius: 999px;
                    cursor: pointer;
                    white-space: nowrap;
                    margin-left: 0.5rem;
                    font-weight: 800;
                }
                .jump-btn:hover {
                    background: #006ee6;
                }
                .empty-queue {
                    text-align: center;
                    color: var(--color-text-muted);
                    padding: 2rem;
                }
                @media (max-width: 640px) {
                    .queue-modal-overlay { align-items: flex-end; }
                    .queue-modal-content {
                        width: 100%;
                        max-height: 86vh;
                        border-radius: 16px 16px 0 0;
                        border-bottom: 0;
                        box-shadow: 0 -18px 50px rgba(0, 0, 0, 0.1);
                    }
                    .queue-item {
                        align-items: flex-start;
                        gap: 10px;
                    }
                    .queue-item-left {
                        gap: 0.65rem;
                    }
                    .jump-btn {
                        padding: 8px;
                    }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default QueueModal;
