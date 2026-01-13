import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePomodoro } from '../context/PomodoroContext';
import './FocusWidget.css';
import { useToast } from '../context/ToastContext';

const FocusWidget: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => {
  const { activeCard, mmss, phase, isRunning, start, pause, stop } = usePomodoro();
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    // Si cambia la tarjeta activa, mostramos el widget nuevamente
    setHidden(false);
  }, [activeCard?.id]);

  // Helper to copy styles from main window to PiP window
  const copyStyles = useCallback((sourceDoc: Document, targetDoc: Document) => {
    Array.from(sourceDoc.styleSheets).forEach((styleSheet) => {
      try {
        if (styleSheet.cssRules) {
          const newStyleEl = targetDoc.createElement('style');
          Array.from(styleSheet.cssRules).forEach((cssRule) => {
            newStyleEl.appendChild(targetDoc.createTextNode(cssRule.cssText));
          });
          targetDoc.head.appendChild(newStyleEl);
        } else if (styleSheet.href) {
          const newLinkEl = targetDoc.createElement('link');
          newLinkEl.rel = 'stylesheet';
          newLinkEl.href = styleSheet.href;
          targetDoc.head.appendChild(newLinkEl);
        }
      } catch (e) {
        // Accessing cross-origin stylesheets might fail
        console.warn('Could not copy stylesheet', e);
      }
    });
  }, []);

  const togglePiP = useCallback(async () => {
    // If PiP is active, close it
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }

    // Check availability
    if (!('documentPictureInPicture' in window)) {
      showToast('Tu navegador no soporta ventanas flotantes (PiP). Prueba Chrome o Edge actualizados.', 'error');
      return;
    }

    try {
      // Request new window
      const dpip = (window as any).documentPictureInPicture;
      const win = await dpip.requestWindow({
        width: collapsed ? 200 : 220,
        height: collapsed ? 50 : 120,
      });

      // Copy styles
      copyStyles(document, win.document);

      // Apply basic styles to the PiP window body to ensure no margins, dark theme, and centered content
      win.document.body.style.margin = '0';
      win.document.body.style.backgroundColor = '#0f172a';
      win.document.body.style.display = 'flex';
      win.document.body.style.alignItems = 'center';
      win.document.body.style.justifyContent = 'center';
      win.document.body.style.height = '100vh';
      win.document.body.style.boxSizing = 'border-box';

      // Handle close
      win.addEventListener('pagehide', () => {
        setPipWindow(null);
      });

      // Set state
      setPipWindow(win);
    } catch (err) {
      console.error('Failed to open PiP window:', err);
      showToast('No se pudo abrir la ventana flotante.', 'error');
    }
  }, [pipWindow, collapsed, copyStyles, showToast]);

  // Also close pip if widget is hidden explicitly or component unmounts
  useEffect(() => {
    if ((hidden || !activeCard) && pipWindow) {
      pipWindow.close();
      setPipWindow(null);
    }
  }, [hidden, activeCard, pipWindow]);

  if (!activeCard || hidden) return null;

  const content = (
    <div className={`focus-widget ${collapsed ? 'collapsed' : ''} ${pipWindow ? 'pip-mode' : ''}`}>
      <div className="fw-top">
        <div className="fw-title" title={activeCard.title}>{activeCard.title}</div>
        <button className="fw-min" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir' : 'Minimizar'}>{collapsed ? '▴' : '▾'}</button>
        {/* PiP Button */}
        {'documentPictureInPicture' in window && (
          <button
            className="fw-pip"
            onClick={togglePiP}
            title={pipWindow ? "Volver a la pestaña" : "Ventana Flotante"}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '14px' }}
          >
            {pipWindow ? '↲' : '❐'}
          </button>
        )}
        <button className="fw-close" onClick={() => { setHidden(true); showToast('Widget oculto. El temporizador sigue activo.', 'info'); }} aria-label="Cerrar">×</button>
      </div>
      <div className="fw-row">
        <span className="fw-phase">{phase}</span>
        <span className="fw-time">{mmss}</span>
      </div>
      {!collapsed && (
        <div className="fw-actions">
          {!isRunning ? (
            <button onClick={start}>Start</button>
          ) : (
            <button onClick={pause}>Pause</button>
          )}
          <button onClick={stop}>Stop</button>
          {onOpen && !pipWindow && <button onClick={onOpen}>Open</button>}
        </div>
      )}
    </div>
  );

  // If PiP is active, render into that window's body using Portal
  if (pipWindow) {
    return createPortal(content, pipWindow.document.body);
  }

  return content;
};

export default FocusWidget;
