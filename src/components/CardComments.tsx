import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useToast } from '../context/ToastContext';
import { Comment, User } from '../types/data';

const API_URL = 'http://localhost:3001/api';

interface CardCommentsProps {
  cardId: string;
  users: User[];
  currentUserId?: string; // opcional por ahora
}

const CardComments: React.FC<CardCommentsProps> = ({ cardId, users, currentUserId = 'user-1' }) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const usersByName = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach(u => map.set(u.name, u.userId));
    return map;
  }, [users]);

  const mapComment = (c: any): Comment => {
    const createdAt = c?.createdAt?._seconds ? new Date(c.createdAt._seconds * 1000) : (c?.createdAt || new Date());
    return { ...(c as any), createdAt } as Comment;
  };

  const fetchComments = async () => {
    try {
      setLoading(true);
      const res = await axios.get<any[]>(`${API_URL}/cards/${cardId}/comments`);
      const list = (res.data || []).map(mapComment);
      setComments(list);
      setError(null);
    } catch (e) {
      console.error('Error fetching comments', e);
      setError('No se pudieron cargar los comentarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchComments(); }, [cardId]);

  const insertMention = (userId: string) => {
    const u = users.find(x => x.userId === userId);
    if (!u) return;
    setText(prev => (prev ? prev + ` @${u.name}` : `@${u.name}`));
  };

  const extractMentions = (t: string): string[] => {
    const regex = /@([^\s@]+)/g;
    const ids: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(t)) !== null) {
      const name = m[1];
      const uid = usersByName.get(name);
      if (uid && !ids.includes(uid)) ids.push(uid);
    }
    return ids;
  };

  const addComment = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const mentions = extractMentions(trimmed);
      const res = await axios.post(`${API_URL}/cards/${cardId}/comments`, {
        authorUserId: currentUserId,
        text: trimmed,
        mentions,
      });
      const saved = mapComment(res.data);
      setText('');
      // Optimistic update
      setComments(prev => [...prev, saved]);
      if (mentions.length) {
        const names = mentions.map(id => users.find(u=>u.userId===id)?.name || id).join(', ');
        showToast(`Comentario agregado. Notificados: ${names}`, 'success');
      } else {
        showToast('Comentario agregado', 'success');
      }
    } catch (e) {
      console.error('Error creating comment', e);
      setError('No se pudo agregar el comentario');
      showToast('No se pudo agregar el comentario', 'error');
    }
  };

  const startEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditingText(c.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText('');
  };

  const saveEdit = async (c: Comment) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    try {
      setBusyId(c.id);
      const mentions = extractMentions(trimmed);
      const res = await axios.put(`${API_URL}/cards/${cardId}/comments/${c.id}`, { text: trimmed, mentions });
      const updated = mapComment(res.data);
      setComments(prev => prev.map(x => (x.id === c.id ? updated : x)));
      if (mentions.length) {
        const names = mentions.map(id => users.find(u=>u.userId===id)?.name || id).join(', ');
        showToast(`Comentario actualizado. Notificados: ${names}`, 'success');
      } else {
        showToast('Comentario actualizado', 'success');
      }
      cancelEdit();
    } catch (e) {
      console.error('Error updating comment', e);
      showToast('No se pudo actualizar el comentario', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const deleteComment = async (c: Comment) => {
    if (!confirm('¿Eliminar este comentario?')) return;
    try {
      setBusyId(c.id);
      await axios.delete(`${API_URL}/cards/${cardId}/comments/${c.id}`);
      setComments(prev => prev.filter(x => x.id !== c.id));
      showToast('Comentario eliminado', 'success');
    } catch (e: any) {
      console.error('Error deleting comment', e);
      const msg = e?.response?.data?.message || 'No se pudo eliminar el comentario';
      showToast(msg, 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: '8px 0' }}>Comentarios</h3>
      {loading && <p>Cargando comentarios...</p>}
      {error && <p className="error-message">{error}</p>}
      {comments.length === 0 && !loading && <p>No hay comentarios.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.map((c) => {
          const author = users.find(u => u.userId === c.authorUserId);
          return (
            <div key={c.id} style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{author ? author.name : c.authorUserId}</div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => startEdit(c)} disabled={busyId===c.id}>Editar</button>
                  <button onClick={() => deleteComment(c)} disabled={busyId===c.id}>Eliminar</button>
                </div>
              </div>
              {editingId === c.id ? (
                <div style={{ display:'grid', gap:6, marginTop:6 }}>
                  <textarea rows={3} value={editingText} onChange={(e)=>setEditingText(e.target.value)} />
                  <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                    <button onClick={cancelEdit} disabled={busyId===c.id}>Cancelar</button>
                    <button onClick={() => saveEdit(c)} disabled={busyId===c.id}>{busyId===c.id ? 'Guardando…' : 'Guardar'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop:6 }}>{c.text}</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select onChange={(e) => { if (e.target.value) { insertMention(e.target.value); e.currentTarget.selectedIndex = 0; } }}>
            <option value="">@ Mencionar...</option>
            {users.map(u => <option key={u.userId} value={u.userId}>{u.name}</option>)}
          </select>
        </div>
        <textarea rows={3} placeholder="Escribe un comentario... Usa @Nombre para mencionar" value={text} onChange={(e) => setText(e.target.value)} />
        <div>
          <button onClick={addComment}>Agregar comentario</button>
        </div>
      </div>
    </div>
  );
};

export default CardComments;
