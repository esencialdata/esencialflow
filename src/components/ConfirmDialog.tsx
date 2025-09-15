import React from 'react';
import { createPortal } from 'react-dom';
import './ConfirmDialog.css';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title = 'Confirmar',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  busy = false,
}) => {
  if (!open) return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return createPortal(
    <div className="cd-overlay" onClick={onCancel}>
      <div className="cd-content" onClick={stop}>
        <h3 className="cd-title">{title}</h3>
        <p className="cd-message">{message}</p>
        <div className="cd-actions">
          <button onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="cd-confirm" onClick={() => onConfirm()} disabled={busy}>{busy ? 'Procesando…' : confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
