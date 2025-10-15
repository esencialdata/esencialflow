import React, { useState, useEffect } from 'react';
import { Webhook } from '../types/data';
import { API_URL } from '../config/api';
import { api } from '../config/http';

const N8nIntegration: React.FC = () => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [triggerEvent, setTriggerEvent] = useState('card_created');
  const [testPayload, setTestPayload] = useState('{"message":"Hello from Esencial Flow!"}');
  const [isSent, setIsSent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    void fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const response = await api.get(`${API_URL}/webhooks`);
      setWebhooks(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Error fetching webhooks:', error);
    }
  };

  const handleSave = async () => {
    try {
      await api.post(`${API_URL}/webhooks`, { url: webhookUrl, triggerEvent });
      setWebhookUrl('');
      void fetchWebhooks();
    } catch (error) {
      console.error('Error saving webhook:', error);
      alert('Ocurrió un error al guardar el webhook.');
    }
  };

  const handleSend = async () => {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(testPayload);
    } catch {
      alert('El JSON de prueba no es válido.');
      return;
    }

    payload.triggerEvent = triggerEvent;
    setIsSending(true);
    setIsSent(false);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setIsSent(true);
    } catch (error) {
      console.error('Error sending test data to n8n:', error);
      alert('No se pudo enviar el payload de prueba al webhook de n8n.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '640px' }}>
      <h2>Integración con n8n</h2>
      <p>
        Conecta Esencial Flow con tus automatizaciones en n8n usando webhooks. Copia la URL del nodo
        <code>Webhook</code> (modo producción) y configúrala como destino.
      </p>

      <section style={{ marginBottom: '24px' }}>
        <label htmlFor="webhook-url" style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
          URL del webhook de n8n
        </label>
        <input
          id="webhook-url"
          type="url"
          placeholder="https://tu-servidor-n8n/webhook/nombre-flujo"
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '12px' }}
        />

        <label htmlFor="trigger-event" style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>
          Evento a disparar
        </label>
        <select
          id="trigger-event"
          value={triggerEvent}
          onChange={(event) => setTriggerEvent(event.target.value)}
          style={{ width: '100%', padding: '8px', marginBottom: '12px' }}
        >
          <option value="card_created">Card Created</option>
          <option value="card_moved">Card Moved</option>
        </select>

        <button type="button" onClick={handleSave} disabled={!webhookUrl}>
          Guardar webhook
        </button>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <h3>Webhooks guardados</h3>
        {webhooks.length === 0 ? (
          <p>No hay webhooks registrados todavía.</p>
        ) : (
          <ul style={{ paddingLeft: '20px' }}>
            {webhooks.map((webhook) => (
              <li key={webhook.id}>
                <code>{webhook.url}</code> — <em>{webhook.triggerEvent}</em>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Enviar payload de prueba</h3>
        <p style={{ marginBottom: '8px' }}>
          Usa este payload para validar que n8n recibe la información correctamente. El evento seleccionado se añadirá automáticamente.
        </p>
        <textarea
          id="test-payload"
          value={testPayload}
          onChange={(event) => setTestPayload(event.target.value)}
          style={{ width: '100%', height: '140px', padding: '8px', marginBottom: '12px' }}
        />
        <button type="button" onClick={handleSend} disabled={!webhookUrl || isSending}>
          {isSending ? 'Enviando…' : 'Enviar payload de prueba'}
        </button>
        {isSent && <p style={{ color: 'green', marginTop: '8px' }}>Payload enviado con éxito a n8n.</p>}
      </section>
    </div>
  );
};

export default N8nIntegration;
