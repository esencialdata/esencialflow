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

  const openPiP = useCallback(async (compact = collapsed) => {
    if (pipWindow) return;

    if (!('documentPictureInPicture' in window)) {
      showToast('Tu navegador no soporta ventanas flotantes (PiP). Prueba Chrome o Edge actualizados.', 'error');
      return;
    }

    try {
      // Request new window
      const dpip = (window as any).documentPictureInPicture;
      const win = await dpip.requestWindow({
        width: 240,
        height: compact ? 64 : 136,
      });

      copyStyles(document, win.document);

      win.document.documentElement.style.background = 'transparent';
      win.document.body.style.margin = '0';
      win.document.body.style.background = 'transparent';
      win.document.body.style.display = 'flex';
      win.document.body.style.alignItems = 'center';
      win.document.body.style.justifyContent = 'center';
      win.document.body.style.height = '100vh';
      win.document.body.style.boxSizing = 'border-box';

      win.addEventListener('pagehide', () => {
        setPipWindow(null);
      });

      setPipWindow(win);
    } catch (err) {
      console.error('Failed to open PiP window:', err);
      showToast('No se pudo abrir la ventana flotante.', 'error');
    }
  }, [pipWindow, collapsed, copyStyles, showToast]);

  const togglePiP = useCallback(async () => {
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }

    await openPiP();
  }, [pipWindow, openPiP]);

  useEffect(() => {
    const handleOpenPip = () => {
      setHidden(false);
      setCollapsed(true);
      void openPiP(true);
    };

    window.addEventListener('focus-widget:open-pip', handleOpenPip);
    return () => window.removeEventListener('focus-widget:open-pip', handleOpenPip);
  }, [openPiP]);

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
            aria-label={pipWindow ? "Volver a la pestaña" : "Abrir ventana flotante"}
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
            <button onClick={() => start()}>Start</button>
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
