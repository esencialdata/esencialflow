import React from 'react';
import { Card } from '../types/data';

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
                        queue.map((card, index) => (
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
                                            {card.priority === 'high' && <span className="tag high">Alta</span>}
                                            {card.dueDate && <span className="tag date">{new Date(card.dueDate).toLocaleDateString()}</span>}
                                        </div>
                                    </div>
                                </div>
                                <button className="jump-btn" onClick={(e) => { e.stopPropagation(); onJumpTo(card); onClose(); }}>
                                    Saltar aquí
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <style>{`
                .queue-modal-overlay {
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0, 0, 0, 0.85);
                    backdrop-filter: blur(5px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    animation: fadeIn 0.2s;
                }
                .queue-modal-content {
                    background: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 12px;
                    width: 90%;
                    max-width: 600px;
                    max-height: 80vh;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
                }
                .queue-header {
                    padding: 1.5rem;
                    border-bottom: 1px solid #334155;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .queue-header h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    color: #f8fafc;
                }
                .close-btn {
                    background: none;
                    border: none;
                    color: #94a3b8;
                    font-size: 2rem;
                    line-height: 1;
                    cursor: pointer;
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
                    padding: 0.75rem;
                    background: #0f172a;
                    border-radius: 8px;
                    border: 1px solid transparent;
                    transition: border-color 0.2s;
                }
                .queue-item:hover {
                    border-color: #334155;
                }
                .queue-item-left {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex: 1;
                    min-width: 0;
                }
                .queue-index {
                    color: #475569;
                    font-family: monospace;
                    font-size: 0.9rem;
                    min-width: 24px;
                }
                .check-circle {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 2px solid #475569;
                    background: transparent;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    color: white;
                    font-size: 12px;
                    flex-shrink: 0;
                }
                .check-circle:hover {
                    border-color: #94a3b8;
                }
                .check-circle.completed {
                    background: #22c55e;
                    border-color: #22c55e;
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
                    color: #fff;
                    text-decoration: underline;
                    text-decoration-color: rgba(255,255,255,0.3);
                }
                .tags-row {
                    display: flex; gap: 6px;
                }
                .queue-item-details h3 {
                    margin: 0;
                    font-size: 0.95rem;
                    color: #e2e8f0;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .completed-text {
                    text-decoration: line-through;
                    color: #64748b;
                }
                .tag {
                    font-size: 0.7rem;
                    padding: 2px 6px;
                    border-radius: 4px;
                    background: #334155;
                    color: #cbd5e1;
                    width: fit-content;
                }
                .tag.high {
                    background: rgba(239, 68, 68, 0.2);
                    color: #fca5a5;
                }
                .jump-btn {
                    padding: 4px 10px;
                    font-size: 0.8rem;
                    color: #3b82f6;
                    background: rgba(59, 130, 246, 0.1);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    white-space: nowrap;
                    margin-left: 0.5rem;
                }
                .jump-btn:hover {
                    background: rgba(59, 130, 246, 0.2);
                }
                .empty-queue {
                    text-align: center;
                    color: #64748b;
                    padding: 2rem;
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
