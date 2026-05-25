const BASE  = 'https://gate.whapi.cloud'
const TOKEN = () => process.env.WHAPI_TOKEN!

function headers() {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${TOKEN()}`
  }
}

export async function sendText(to: string, body: string) {
  const res = await fetch(`${BASE}/messages/text`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ to, body })
  })
  return res.json()
}

export async function sendImage(to: string, mediaUrl: string, caption = '') {
  const res = await fetch(`${BASE}/messages/image`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify({ to, media: mediaUrl, caption })
  })
  return res.json()
}

export async function downloadMediaAsBase64(mediaIdOrUrl: string): Promise<string> {
  // Si es una URL completa la descargamos directo, si es un ID usamos el endpoint de Whapi
  const url = mediaIdOrUrl.startsWith('http')
    ? mediaIdOrUrl
    : `${BASE}/media/${mediaIdOrUrl}`

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${TOKEN()}` }
  })

  if (!res.ok) throw new Error(`Media download failed: ${res.status} ${url}`)

  const buffer = await res.arrayBuffer()
  return Buffer.from(buffer).toString('base64')
}
