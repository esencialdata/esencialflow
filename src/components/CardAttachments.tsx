import React, { useState } from 'react';
import { useToast } from '../context/ToastContext';
import Spinner from './Spinner';
import { Attachment } from '../types/data';
import { supabase } from '../config/supabase';

interface CardAttachmentsProps {
  cardId: string;
  attachments: Attachment[];
  onAttachmentsChange: (attachments: Attachment[]) => void;
}

const CardAttachments: React.FC<CardAttachmentsProps> = ({ cardId, attachments, onAttachmentsChange }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<Record<string, string>>({});
  const { showToast } = useToast();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      // 1) Generar un path unico
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `${cardId}/${fileName}`;

      // 2) Subir archivo al bucket de Supabase
      const { error: uploadError } = await supabase.storage
        .from('card_attachments')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // 3) Obtener URL publica
      const { data: { publicUrl } } = supabase.storage
        .from('card_attachments')
        .getPublicUrl(filePath);

      // 4) Actualizar registro de la tarjeta en la BD
      const attPayload: Attachment = {
        attachmentId: filePath,
        fileName: file.name,
        url: publicUrl,
        fileType: file.type || 'application/octet-stream',
        createdAt: new Date().toISOString(),
      };

      const newAttachments = [...attachments, attPayload];
      const { error: dbError } = await supabase
        .from('cards')
        .update({ attachments: newAttachments })
        .eq('id', cardId);

      if (dbError) throw new Error(dbError.message);

      onAttachmentsChange(newAttachments);
      showToast('Adjunto agregado', 'success');

    } catch (err: any) {
      console.error('Error uploading attachment', err);
      setError(err.message || 'No se pudo subir el archivo');
      showToast('No se pudo asociar el archivo', 'error');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const openAttachment = async (a: Attachment) => {
    setOpening(a.attachmentId);
    window.open(a.url, '_blank', 'noopener');
    setOpening(null);
  };

  const togglePreview = async (a: Attachment) => {
    if (previewUrl[a.attachmentId]) {
      const next = { ...previewUrl };
      delete next[a.attachmentId];
      setPreviewUrl(next);
      return;
    }
    setPreviewUrl(prev => ({ ...prev, [a.attachmentId]: a.url }));
  };

  const deleteAttachment = async (a: Attachment) => {
    if (!confirm('¿Eliminar este adjunto?')) return;
    try {
      // Borrar de storage
      const { error: storageError } = await supabase.storage
        .from('card_attachments')
        .remove([a.attachmentId]);

      if (storageError) console.error("Error borrar storage:", storageError.message);

      // Borrar de Database
      const remaining = attachments.filter(x => x.attachmentId !== a.attachmentId);
      const { error: dbError } = await supabase
        .from('cards')
        .update({ attachments: remaining })
        .eq('id', cardId);

      if (dbError) throw new Error(dbError.message);

      onAttachmentsChange(remaining);
      setError(null);
      showToast('Adjunto eliminado', 'success');
    } catch (e: any) {
      console.error('Error deleting attachment', e);
      setError(e.message || 'No se pudo eliminar el adjunto');
      showToast('No se pudo eliminar el adjunto', 'error');
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: '8px 0' }}>Adjuntos</h3>
      {attachments.length === 0 && <p style={{ margin: 0 }}>No hay archivos adjuntos.</p>}
      <ul style={{ listStyle: 'none', paddingLeft: 0, display: 'grid', gap: 8 }}>
        {attachments.map((a) => (
          <li key={a.attachmentId} style={{ background: 'var(--color-background-card)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span title={a.fileName} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{a.fileName}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {a.fileType?.startsWith('image/') && (
                  <button onClick={() => togglePreview(a)}>{previewUrl[a.attachmentId] ? 'Ocultar' : 'Vista previa'}</button>
                )}
                <button onClick={() => openAttachment(a)} disabled={opening === a.attachmentId}>{opening === a.attachmentId ? 'Abriendo...' : 'Abrir'}</button>
                <button onClick={() => deleteAttachment(a)}>Eliminar</button>
              </div>
            </div>
            {previewUrl[a.attachmentId] && (
              <img src={previewUrl[a.attachmentId]} alt={a.fileName} style={{ maxWidth: 240, borderRadius: 6 }} />
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error-message">{error}</p>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <input type="file" onChange={onFileChange} disabled={isUploading} />
        {isUploading && <><Spinner /><span>Subiendo…</span></>}
      </div>
    </div>
  );
};

export default CardAttachments;
