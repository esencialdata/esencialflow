import React, { useState } from 'react';
import axios from 'axios';
import { useToast } from '../context/ToastContext';
import Spinner from './Spinner';

const API_URL = 'http://localhost:3001/api';

interface Attachment {
  attachmentId: string;
  fileName: string;
  url: string;
  fileType: string;
  createdAt?: any;
}

interface CardAttachmentsProps {
  cardId: string;
  attachments?: Attachment[];
}

const CardAttachments: React.FC<CardAttachmentsProps> = ({ cardId, attachments = [] }) => {
  const [items, setItems] = useState<Attachment[]>(attachments);
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
      // 1) Request signed URL
      let signedUrl = '';
      let filePath = '';
      try {
        const reqRes = await axios.post(`${API_URL}/cards/${cardId}/request-upload-url`, {
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
        });
        ({ signedUrl, filePath } = reqRes.data as { signedUrl: string; filePath: string });
      } catch (err: any) {
        console.error('Error requesting signed URL', err);
        const msg = err?.response?.data?.message || 'No se pudo generar URL de carga';
        setError(msg);
        return;
      }

      // 2) Upload to GCS signed URL
      try {
        const putRes = await fetch(signedUrl, {
          method: 'PUT',
          // No enviamos Content-Type fijo; la URL firmada ya no lo requiere
          body: file as any,
        });
        if (!putRes.ok) {
          const txt = await putRes.text().catch(() => '');
          throw new Error(`PUT failed ${putRes.status}: ${txt}`);
        }
      } catch (err: any) {
        console.error('Error uploading to signed URL', err);
        setError('No se pudo subir el archivo (CORS o permisos del bucket). Revisa la consola/Network.');
        return;
      }

      // Build public URL using the bucket from the signed URL to avoid hardcoding
      let publicUrl = '';
      try {
        const u = new URL(signedUrl);
        // signed URL path looks like /<bucket>/<object>
        const parts = u.pathname.split('/').filter(Boolean);
        const bucketName = parts[0];
        publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
      } catch {
        // fallback (may not be publicly readable)
        publicUrl = filePath;
      }

      // 3) Tell backend to attach to card
      const attPayload: Attachment = {
        attachmentId: filePath,
        fileName: file.name,
        url: publicUrl,
        fileType: file.type || 'application/octet-stream',
      };
      try {
        const res = await axios.post(`${API_URL}/cards/${cardId}/attachments`, attPayload);
        const saved = res.data as Attachment;
        setItems(prev => [...prev, saved]);
        showToast('Adjunto agregado', 'success');
      } catch (err: any) {
        console.error('Error attaching to card', err);
        const msg = err?.response?.data?.message || 'No se pudo asociar el archivo a la tarjeta';
        setError(msg);
        showToast('No se pudo asociar el archivo', 'error');
        return;
      }
    } catch (err) {
      console.error('Error uploading attachment', err);
      setError('No se pudo subir el archivo');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const openAttachment = async (a: Attachment) => {
    try {
      setOpening(a.attachmentId);
      const params = new URLSearchParams({ filePath: a.attachmentId });
      const res = await axios.get(`${API_URL}/cards/${cardId}/attachments/signed-read?${params.toString()}`);
      const url = res.data?.url || a.url;
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      console.error('Error getting signed READ URL, falling back to direct URL', err);
      window.open(a.url, '_blank', 'noopener');
    } finally {
      setOpening(null);
    }
  };

  const togglePreview = async (a: Attachment) => {
    try {
      if (previewUrl[a.attachmentId]) {
        const next = { ...previewUrl };
        delete next[a.attachmentId];
        setPreviewUrl(next);
        return;
      }
      const params = new URLSearchParams({ filePath: a.attachmentId });
      const res = await axios.get(`${API_URL}/cards/${cardId}/attachments/signed-read?${params.toString()}`);
      const url = res.data?.url || a.url;
      setPreviewUrl(prev => ({ ...prev, [a.attachmentId]: url }));
    } catch (e) {
      console.error('Error generating preview URL', e);
      setError('No se pudo generar la vista previa');
    }
  };

  const deleteAttachment = async (a: Attachment) => {
    if (!confirm('¿Eliminar este adjunto?')) return;
    try {
      await axios.delete(`${API_URL}/cards/${cardId}/attachments/${encodeURIComponent(a.attachmentId)}`, { params: { deleteObject: true } });
      setItems(prev => prev.filter(x => x.attachmentId !== a.attachmentId));
      setError(null);
      showToast('Adjunto eliminado', 'success');
    } catch (e) {
      console.error('Error deleting attachment', e);
      setError('No se pudo eliminar el adjunto');
      showToast('No se pudo eliminar el adjunto', 'error');
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <h3 style={{ margin: '8px 0' }}>Adjuntos</h3>
      {items.length === 0 && <p style={{ margin: 0 }}>No hay archivos adjuntos.</p>}
      <ul style={{ listStyle: 'none', paddingLeft: 0, display: 'grid', gap: 8 }}>
        {items.map((a) => (
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
