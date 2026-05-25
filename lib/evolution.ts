const BASE = process.env.EVOLUTION_API_URL!
const KEY  = process.env.EVOLUTION_API_KEY!
const INST = process.env.EVOLUTION_INSTANCE!

function headers() {
  return { 'Content-Type': 'application/json', apikey: KEY }
}

export async function sendText(to: string, text: string) {
  const res = await fetch(`${BASE}/message/sendText/${INST}`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ number: to, text })
  })
  return res.json()
}

export async function sendImage(to: string, mediaUrl: string, caption = '') {
  const res = await fetch(`${BASE}/message/sendMedia/${INST}`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ number: to, mediatype: 'image', media: mediaUrl, caption })
  })
  return res.json()
}

export async function getMediaBase64(messageKey: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/chat/getBase64FromMediaMessage/${INST}`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ message: { key: messageKey } })
  })
  const data = await res.json()
  return data.base64 as string
}

export async function createInstance() {
  const res = await fetch(`${BASE}/instance/create`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({
      instanceName:     INST,
      qrcode:           true,
      integration:      'WHATSAPP-BAILEYS'
    })
  })
  return res.json()
}

export async function setWebhook(webhookUrl: string) {
  const res = await fetch(`${BASE}/webhook/set/${INST}`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({
      webhook: {
        enabled: true,
        url:     webhookUrl,
        events:  ['MESSAGES_UPSERT']
      }
    })
  })
  return res.json()
}

export async function getQRCode() {
  const res = await fetch(`${BASE}/instance/connect/${INST}`, {
    headers: { apikey: KEY }
  })
  return res.json()
}
