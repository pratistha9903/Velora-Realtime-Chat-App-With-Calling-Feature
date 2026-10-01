/** Optional n8n automation — set N8N_WEBHOOK_URL in backend/.env */

export function getN8nWebhookUrl() {
  return (process.env.N8N_WEBHOOK_URL || '').trim();
}

function messageTextForWebhook(message) {
  if (!message || typeof message === 'string') {
    return String(message || '').trim() || '(empty message)';
  }
  const text = (message.content || '').trim();
  if (message.type === 'image') return text || 'Photo';
  if (message.type === 'file') return text || `File: ${message.fileName || 'attachment'}`;
  if (message.type === 'audio') return text || 'Voice note';
  if (message.type === 'system') return text || 'System message';
  return text || '(empty message)';
}

/**
 * POST to n8n when someone sends a chat message (n8n → Gmail to recipient).
 */
export async function notifyN8nNewMessage({
  senderName,
  senderEmail,
  recipientName,
  recipientEmail,
  message,
}) {
  const url = getN8nWebhookUrl();
  if (!url) return;

  const to = (recipientEmail || '').trim();
  if (!to) {
    console.warn('[n8n] skipped — recipient has no email');
    return;
  }

  const body = {
    senderName: senderName || 'Unknown',
    senderEmail: senderEmail || '',
    recipientName: recipientName || 'Unknown',
    recipientEmail: to,
    message: messageTextForWebhook(message),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[n8n] webhook returned ${res.status}`);
    } else {
      console.log(`[n8n] notified for message to ${to}`);
    }
  } catch (err) {
    console.warn('[n8n] webhook error:', err.message);
  }
}
