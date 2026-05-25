/**
 * Ejecutar UNA SOLA VEZ después del primer deploy en Vercel:
 *   npm run setup
 *
 * Hace 3 cosas:
 *  1. Crea la instancia "asesor" en Evolution API
 *  2. Configura el webhook apuntando a tu Vercel
 *  3. Imprime el QR para escanear con WhatsApp Business
 */

const BASE  = process.env.EVOLUTION_API_URL!
const KEY   = process.env.EVOLUTION_API_KEY!
const INST  = process.env.EVOLUTION_INSTANCE ?? 'asesor'
const VERCEL_URL = process.env.VERCEL_URL! // ej: asesor-bot.vercel.app

if (!BASE || !KEY || !VERCEL_URL) {
  console.error('Faltan variables: EVOLUTION_API_URL, EVOLUTION_API_KEY, VERCEL_URL')
  process.exit(1)
}

const headers = { 'Content-Type': 'application/json', apikey: KEY }

async function run() {
  // 1. Crear instancia
  console.log('⚙️  Creando instancia:', INST)
  const createRes = await fetch(`${BASE}/instance/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ instanceName: INST, qrcode: true, integration: 'WHATSAPP-BAILEYS' })
  })
  const createData = await createRes.json()
  console.log('Instancia:', JSON.stringify(createData, null, 2))

  // 2. Conectar y obtener QR
  console.log('\n📱 Obteniendo QR...')
  await new Promise(r => setTimeout(r, 2000))
  const qrRes  = await fetch(`${BASE}/instance/connect/${INST}`, { headers: { apikey: KEY } })
  const qrData = await qrRes.json()
  if (qrData.base64) {
    console.log('\n✅ Escanea este QR con WhatsApp Business (abre como imagen en el browser):')
    console.log(`data:image/png;base64,${qrData.base64}`)
  } else {
    console.log('QR response:', JSON.stringify(qrData, null, 2))
  }

  // 3. Configurar webhook
  const webhookUrl = `https://${VERCEL_URL}/api/webhook`
  console.log('\n🔗 Configurando webhook:', webhookUrl)
  const whRes  = await fetch(`${BASE}/webhook/set/${INST}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      webhook: { enabled: true, url: webhookUrl, events: ['MESSAGES_UPSERT'] }
    })
  })
  const whData = await whRes.json()
  console.log('Webhook:', JSON.stringify(whData, null, 2))

  console.log('\n🎉 Setup completo. Escanea el QR, luego envía un mensaje desde tu número personal.')
}

run().catch(console.error)
