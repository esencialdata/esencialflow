import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Webhook } from '../types/data';
import { API_URL } from '../config/api';

const ZapierIntegration: React.FC = () => {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [testData, setTestData] = useState('{"message": "Hello from Esencial Flow!"}');
  const [isSent, setIsSent] = useState(false);
  const [triggerEvent, setTriggerEvent] = useState('card_created');

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const fetchWebhooks = async () => {
    try {
      const response = await axios.get(`${API_URL}/webhooks`);
      setWebhooks(response.data);
    } catch (error) {
      console.error("Error fetching webhooks:", error);
    }
  };

  const handleSend = () => {
    const data = JSON.parse(testData);
    data.triggerEvent = triggerEvent;

    fetch(webhookUrl, {
      method: 'POST',
      body: JSON.stringify(data),
    })
      .then(response => {
        if (response.ok) {
          setIsSent(true);
        } else {
          alert('Failed to send test data to Zapier.');
        }
      })
      .catch(error => {
        console.error('Error sending test data to Zapier:', error);
        alert('An error occurred while sending test data to Zapier.');
      });
  };

  const handleSave = async () => {
    try {
      await axios.post(`${API_URL}/webhooks`, { url: webhookUrl, triggerEvent });
      fetchWebhooks();
    } catch (error) {
      console.error("Error saving webhook:", error);
      alert('An error occurred while saving the webhook.');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>Zapier Integration</h2>
      <p>Connect Esencial Flow to Zapier using a webhook.</p>
      <div>
        <label htmlFor="webhook-url">Zapier Webhook URL:</label>
        <input
          id="webhook-url"
          type="text"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }}
        />
        <button onClick={handleSave} disabled={!webhookUrl}>Save Webhook</button>
      </div>
      <div>
        <label htmlFor="trigger-event">Trigger Event:</label>
        <select id="trigger-event" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
          <option value="card_created">Card Created</option>
          <option value="card_moved">Card Moved</option>
        </select>
      </div>
      <div>
        <h3>Saved Webhooks</h3>
        <ul>
          {webhooks.map(webhook => (
            <li key={webhook.id}>{webhook.url}</li>
          ))}
        </ul>
      </div>
      <div>
        <label htmlFor="test-data">Test Data (JSON):</label>
        <textarea
          id="test-data"
          value={testData}
          onChange={(e) => setTestData(e.target.value)}
          style={{ width: '100%', height: '100px', marginBottom: '10px' }}
        />
      </div>
      <button onClick={handleSend} disabled={!webhookUrl}>Send Test Data</button>
      {isSent && <p style={{ color: 'green' }}>Test data sent successfully!</p>}
    </div>
  );
};

export default ZapierIntegration;
