import { NextRequest, NextResponse } from 'next/server'
import { initDB, saveMessage, saveKnowledge } from '@/lib/db'
import { sendText, sendImage, getMediaBase64 } from '@/lib/evolution'
import { transcribeAudio } from '@/lib/groq'
import { chat } from '@/lib/claude'

// Único número autorizado: 04249292269 Venezuela (+58)
const ALLOWED = '584249292269'

let ready = false
async function ensureDB() {
  if (!ready) { await initDB(); ready = true }
}

// ── GET — health check ────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({ status: 'asesor-bot online' })
}

// ── POST — webhook de Evolution API ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()

    // Solo procesar mensajes entrantes
    if (body.event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    const data        = body.data
    const key         = data?.key
    const messageType = data?.messageType as string | undefined

    // Ignorar mensajes enviados por el propio bot
    if (key?.fromMe) return NextResponse.json({ ok: true })

    // Normalizar número remitente
    const jid    = (key?.remoteJid as string) ?? ''
    const sender = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '')

    // ── FILTRO DE SEGURIDAD ───────────────────────────────────────────────────
    if (sender !== ALLOWED) {
      console.log(`[bot] ignorado: ${sender}`)
      return NextResponse.json({ ok: true })
    }

    let userMessage = ''

    // ── Texto plano ───────────────────────────────────────────────────────────
    if (messageType === 'conversation') {
      userMessage = data.message?.conversation ?? ''
    } else if (messageType === 'extendedTextMessage') {
      userMessage = data.message?.extendedTextMessage?.text ?? ''
    }
    // ── Nota de voz ───────────────────────────────────────────────────────────
    else if (messageType === 'audioMessage') {
      await sendText(sender, '🎙️ _Transcribiendo nota de voz..._')
      const base64 = await getMediaBase64(key)
      userMessage  = await transcribeAudio(base64)
      await sendText(sender, `_🗒 Transcripción: "${userMessage}"_`)
    } else {
      return NextResponse.json({ ok: true })
    }

    if (!userMessage.trim()) return NextResponse.json({ ok: true })

    // ── Comando explícito: guardar: ───────────────────────────────────────────
    const explicitMatch = userMessage.match(/^guardar:\s*(.+)/i)
    if (explicitMatch) {
      const content = explicitMatch[1].trim()
      await Promise.all([
        saveKnowledge(content, 'General', 'explicit'),
        saveMessage('user', userMessage),
        sendText(sender, '✅ *Guardado en tu base de conocimiento.*')
      ])
      await saveMessage('assistant', '✅ Guardado en tu base de conocimiento.')
      return NextResponse.json({ ok: true })
    }

    // ── Guardar mensaje del usuario ───────────────────────────────────────────
    await saveMessage('user', userMessage)

    // ── Llamar a Claude ───────────────────────────────────────────────────────
    const { response, autoSave, chartUrl } = await chat(userMessage)

    // ── Auto-guardar conocimiento detectado ───────────────────────────────────
    if (autoSave) {
      await saveKnowledge(autoSave.content, autoSave.category, 'auto')
    }

    // ── Guardar respuesta del bot ─────────────────────────────────────────────
    await saveMessage('assistant', response)

    // ── Enviar respuesta ──────────────────────────────────────────────────────
    if (response) await sendText(sender, response)
    if (chartUrl) await sendImage(sender, chartUrl)

    return NextResponse.json({ ok: true })

  } catch (err) {
    console.error('[webhook]', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
