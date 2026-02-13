import React, { useState, useEffect, useRef } from 'react';

import { DragDropContext, Droppable, DropResult } from 'react-beautiful-dnd';
import { Card as CardType, User } from '../types/data';
import Card from './Card';
import './KanbanBoard.css';
import { useLists } from '../hooks/useLists';
import { useCards } from '../hooks/useSupabaseCards';
import ConfirmDialog from './ConfirmDialog';
import LoadingOverlay from './LoadingOverlay';
import { useToast } from '../context/ToastContext';

interface KanbanBoardProps {
  boardId: string;
  users: User[];
  onStartFocus: (card: CardType) => void;
  onEditCard: (card: CardType) => void;
  focusListId?: string;
  currentUserId?: string;
  filters?: { assignedToMe: boolean; assignedUserId?: string; dueToday: boolean; noDueDate: boolean; overdue: boolean; hasAttachments: boolean; showArchived: boolean; q: string };
  onChangeFilters?: (f: { assignedToMe: boolean; assignedUserId?: string; dueToday: boolean; noDueDate: boolean; overdue: boolean; hasAttachments: boolean; showArchived: boolean; q: string }) => void;
  readOnly?: boolean;
}

const KanbanBoard: React.FC<KanbanBoardProps> = ({
  boardId,
  users,
  onStartFocus,
  onEditCard,
  focusListId,
  currentUserId,
  filters,
  onChangeFilters,
  readOnly = false,
}) => {
  const { lists, isLoading: listsLoading, error: listsError, handleCreateList, handleUpdateList, handleDeleteList } = useLists(boardId);
  const { cards, isLoading: cardsLoading, error: cardsError, handleCreateCard, handleMoveCard, handleUpdateCard } = useCards(boardId);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [reordering, setReordering] = useState(false);
  const listRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [openMenuListId, setOpenMenuListId] = useState<string | null>(null);
  const [renamingListId, setRenamingListId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const defaultAssignedToUserId = users && users.length === 1 ? users[0].userId : undefined;
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; listId: string | null; busy: boolean }>({ open: false, listId: null, busy: false });
  const isReadOnly = Boolean(readOnly);

  useEffect(() => {
    if (focusListId && listRefs.current[focusListId]) {
      const el = listRefs.current[focusListId]!;
      try {
        el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        el.classList.add('focused');
        const t = setTimeout(() => el.classList.remove('focused'), 1200);
        return () => clearTimeout(t);
      } catch { }
    }
  }, [focusListId]);

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const metaK = (e.key.toLowerCase() === 'k') && (e.metaKey || e.ctrlKey);
      const slash = e.key === '/';
      if (metaK || slash) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDragEnd = async (result: DropResult) => {
    if (isReadOnly) return;
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Update local UI and persist
    try {
      setReordering(true);
      await handleMoveCard(draggableId, source.droppableId, destination.droppableId, destination.index);
    } finally {
      setReordering(false);
    }
  };

  const handleAddList = async () => {
    if (isReadOnly) return;
    if (!newListName.trim() || creatingList) return;
    setCreatingList(true);
    try {
      await handleCreateList(newListName.trim());
      setNewListName('');
    } finally {
      setCreatingList(false);
    }
  };

  // Ensure there is a 'Hecho' list; if not, create it and return its id
  const ensureDoneList = async (): Promise<string | null> => {
    if (isReadOnly) return null;
    const existing = lists.find(l => l.name?.toLowerCase() === 'hecho');
    if (existing) return existing.listId;
    const created = await handleCreateList('Hecho');
    return (created as any)?.listId || null;
  };

  // Toggle completed on a card; when completing, move to 'Hecho'
  const toggleComplete = async (card: CardType) => {
    if (isReadOnly) return;
    if (!card.completed) {
      const doneId = await ensureDoneList();
      const payload: Partial<CardType> = { completed: true, completedAt: new Date() } as any;
      if (doneId) (payload as any).listId = doneId;
      await handleUpdateCard(card.id, payload);
    } else {
      await handleUpdateCard(card.id, { completed: false, completedAt: null as any });
    }
  };

  const toggleArchive = async (card: CardType) => {
    if (isReadOnly) return;
    if (!card.archived) {
      await handleUpdateCard(card.id, { archived: true, archivedAt: new Date() } as any);
    } else {
      await handleUpdateCard(card.id, { archived: false, archivedAt: null as any } as any);
    }
  };

  if (listsLoading || cardsLoading) return <LoadingOverlay message="Cargando tablero…" />;
  if (listsError || cardsError) return <p className="error-message">{listsError || cardsError}</p>;

  return (
    <>
      {/* Filtros fuera del contenedor flex de columnas para evitar desplazamientos/mis-drops */}
      <div style={{ margin: '8px 12px 0 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Buscar…"
          value={filters?.q || ''}
          onChange={(e) => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), q: e.target.value })}
          style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          ref={searchRef}
        />
        {users.length > 1 && (
          <select
            value={filters?.assignedUserId || ''}
            onChange={(e) => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), assignedUserId: e.target.value })}
          >
            <option value="">Todos</option>
            {users.map(u => (<option key={u.userId} value={u.userId}>{u.name}</option>))}
          </select>
        )}
        <button
          onClick={() => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), assignedToMe: !filters?.assignedToMe })}
          className="filter-chip"
          style={{ opacity: filters?.assignedToMe ? 1 : 0.6 }}
        >Asignadas a mí</button>
        <button
          onClick={() => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), dueToday: !filters?.dueToday })}
          className="filter-chip"
          style={{ opacity: filters?.dueToday ? 1 : 0.6 }}
        >Vencen hoy</button>
        <button
          onClick={() => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), noDueDate: !filters?.noDueDate })}
          className="filter-chip"
          style={{ opacity: filters?.noDueDate ? 1 : 0.6 }}
        >Sin fecha</button>
        <button
          onClick={() => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), overdue: !filters?.overdue })}
          className="filter-chip"
          style={{ opacity: filters?.overdue ? 1 : 0.6 }}
        >Vencidas</button>
        <button
          onClick={() => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), hasAttachments: !filters?.hasAttachments })}
          className="filter-chip"
          style={{ opacity: filters?.hasAttachments ? 1 : 0.6 }}
        >Con adjuntos</button>
        <button
          onClick={() => onChangeFilters && onChangeFilters({ ...(filters || { q: '', assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false }), showArchived: !filters?.showArchived })}
          className="filter-chip"
          style={{ opacity: filters?.showArchived ? 1 : 0.6 }}
        >Archivadas</button>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-board">
          {lists.map((list) => (
            <Droppable key={list.listId} droppableId={list.listId} isDropDisabled={isReadOnly}>
              {(provided) => (
                <div
                  className="list"
                  ref={(el) => { provided.innerRef(el); listRefs.current[list.listId] = el; }}
                  {...provided.droppableProps}
                >
                  <div className="list-header">
                    {renamingListId === list.listId ? (
                      <>
                        <input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateList(list.listId, { name: renameValue });
                              setRenamingListId(null);
                            }
                            if (e.key === 'Escape') setRenamingListId(null);
                          }}
                        />
                        <div className="list-actions">
                          <button onClick={() => { handleUpdateList(list.listId, { name: renameValue }); setRenamingListId(null); }}>Guardar</button>
                          <button onClick={() => setRenamingListId(null)}>Cancelar</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h2>{list.name}</h2>
                        <div className="list-actions">
                          <button
                            onClick={() => {
                              if (isReadOnly) return;
                              setOpenMenuListId(openMenuListId === list.listId ? null : list.listId);
                            }}
                            disabled={isReadOnly}
                          >•••</button>
                        </div>
                      </>
                    )}
                  </div>
                  {!isReadOnly && openMenuListId === list.listId && renamingListId !== list.listId && (
                    <div className="list-actions" style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setRenamingListId(list.listId); setRenameValue(list.name); setOpenMenuListId(null); }}>Renombrar</button>
                      <button onClick={() => { setConfirmDelete({ open: true, listId: list.listId, busy: false }); setOpenMenuListId(null); }}>Eliminar</button>
                    </div>
                  )}
                  <div className="cards-container">
                    {(cards[list.listId] || [])
                      .filter((card) => {
                        // Archivadas: si showArchived está activo, mostramos sólo archivadas; si no, ocultamos archivadas
                        if (filters?.showArchived) {
                          if (!card.archived) return false;
                        } else {
                          if (card.archived) return false;
                        }
                        // Asignadas a mí (AND)
                        const assignedOk = (filters?.assignedUserId && filters.assignedUserId !== '')
                          ? card.assignedToUserId === filters.assignedUserId
                          : (!(filters?.assignedToMe) || (!!currentUserId && card.assignedToUserId === currentUserId));
                        // Fecha (OR entre dueToday / noDueDate)
                        const hasDue = !!card.dueDate;
                        const toLocal = (d: any) => { const dt = new Date(d); return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0); };
                        const today = toLocal(new Date());
                        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
                        const isToday = hasDue ? (toLocal(card.dueDate as any) >= today && toLocal(card.dueDate as any) < tomorrow) : false;
                        const isOverdue = hasDue ? (toLocal(card.dueDate as any) < today) : false;
                        let dateOk = true;
                        if (filters?.dueToday || filters?.noDueDate) {
                          dateOk = (filters?.dueToday ? isToday : false) || (filters?.noDueDate ? !hasDue : false);
                        }
                        if (filters?.overdue) {
                          dateOk = dateOk && isOverdue;
                        }
                        const attachmentsOk = !(filters?.hasAttachments) || (Array.isArray((card as any).attachments) && (card as any).attachments.length > 0);
                        const q = (filters?.q || '').trim().toLowerCase();
                        const textOk = !q || (card.title || '').toLowerCase().includes(q);
                        return assignedOk && dateOk && attachmentsOk && textOk;
                      })
                      .map((card, index) => (
                        <Card
                          key={card.id}
                          card={card}
                          index={index}
                          users={users}
                          onEditCard={onEditCard}
                          onStartFocus={onStartFocus}
                          onToggleComplete={toggleComplete}
                          onArchiveToggle={toggleArchive}
                          readOnly={isReadOnly}
                        />
                      ))}
                    {provided.placeholder}
                  </div>
                  {!isReadOnly && (
                    <AddCardForm
                      listId={list.listId}
                      handleCreateCard={handleCreateCard}
                      defaultAssignedToUserId={defaultAssignedToUserId}
                      currentUserId={currentUserId}
                      filters={filters}
                      onChangeFilters={onChangeFilters}
                    />
                  )}
                </div>
              )}
            </Droppable>
          ))}
          {!isReadOnly && (
            <div className="list">
              <div className="list-header">
                <h2>Nueva lista</h2>
              </div>
              <div className="cards-container">
                <input
                  type="text"
                  placeholder="Nombre de la lista"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddList();
                  }}
                />
                <button onClick={handleAddList} disabled={creatingList}>{creatingList ? 'Creando…' : '+ Añadir Lista'}</button>
              </div>
            </div>
          )}
        </div>
      </DragDropContext>
      {reordering && <LoadingOverlay message="Guardando orden…" />}
      {!isReadOnly && (
        <ConfirmDialog
          open={confirmDelete.open}
          title="Eliminar lista"
          message="Se eliminará la lista y sus tarjetas. ¿Deseas continuar?"
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          busy={confirmDelete.busy}
          onCancel={() => setConfirmDelete({ open: false, listId: null, busy: false })}
          onConfirm={async () => {
            if (!confirmDelete.listId) return;
            setConfirmDelete(prev => ({ ...prev, busy: true }));
            try {
              await handleDeleteList(confirmDelete.listId);
              setConfirmDelete({ open: false, listId: null, busy: false });
            } catch (e) {
              setConfirmDelete(prev => ({ ...prev, busy: false }));
            }
          }}
        />
      )}
    </>
  );
};

export default KanbanBoard;

// Componente sencillo para añadir tarjetas dentro de una lista
interface AddCardFormProps {
  listId: string;
  handleCreateCard: (
    listId: string,
    cardData: Omit<CardType, 'id' | 'listId' | 'createdAt' | 'updatedAt'>
  ) => void;
  defaultAssignedToUserId?: string;
  currentUserId?: string;
  filters?: { assignedToMe: boolean; assignedUserId?: string; dueToday: boolean; noDueDate: boolean; overdue: boolean; hasAttachments: boolean; showArchived: boolean; q: string };
  onChangeFilters?: (f: { assignedToMe: boolean; assignedUserId?: string; dueToday: boolean; noDueDate: boolean; overdue: boolean; hasAttachments: boolean; showArchived: boolean; q: string }) => void;
}

const AddCardForm: React.FC<AddCardFormProps> = ({ listId, handleCreateCard, defaultAssignedToUserId, currentUserId, filters, onChangeFilters }) => {
  const [newCardTitle, setNewCardTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const { showToast } = useToast();

  const onAddCard = async () => {
    if (!newCardTitle.trim() || adding) return;
    setAdding(true);
    try {
      const payload: any = { title: newCardTitle.trim(), priority };
      if ((filters?.assignedToMe && currentUserId) || defaultAssignedToUserId) {
        payload.assignedToUserId = filters?.assignedToMe ? currentUserId : defaultAssignedToUserId;
      }
      const today = new Date(); const local = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      if (filters?.dueToday) payload.dueDate = local;
      else if (filters?.overdue) payload.dueDate = new Date(local.getTime() - 24 * 60 * 60 * 1000);

      await handleCreateCard(listId, payload);
      setNewCardTitle('');
      setPriority('medium');

      const title = (payload.title || '').toLowerCase();
      const hiddenBySearch = (filters?.q || '').trim() && !title.includes((filters?.q || '').trim().toLowerCase());
      const hiddenByAttachments = !!filters?.hasAttachments;
      if ((hiddenBySearch || hiddenByAttachments) && onChangeFilters && filters) {
        onChangeFilters({ ...filters, hasAttachments: false, q: '' });
        showToast('Se limpiaron filtros para mostrar la nueva tarjeta', 'info');
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="add-card-form">
      <input
        type="text"
        placeholder="Nueva tarjeta..."
        value={newCardTitle}
        onChange={(e) => setNewCardTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAddCard();
        }}
      />
      <select value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}>
        <option value="low">Baja</option>
        <option value="medium">Media</option>
        <option value="high">Alta</option>
      </select>
      <button onClick={onAddCard} disabled={adding}>{adding ? 'Añadiendo…' : '+ Añadir Tarjeta'}</button>
    </div>
  );

};
