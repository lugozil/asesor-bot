import { NextRequest, NextResponse } from 'next/server'
import { initDB, saveMessage, saveKnowledge } from '@/lib/db'
import { sendText, sendImage, downloadMediaAsBase64 } from '@/lib/whapi'
import { transcribeAudio } from '@/lib/groq'
import { chat } from '@/lib/claude'

// Extender timeout al máximo permitido en Vercel Hobby (60s)
export const maxDuration = 60

// Único número autorizado — 04249292269 Venezuela (+58)
const ALLOWED = '584249292269'

let ready = false
async function ensureDB() {
  if (!ready) { await initDB(); ready = true }
}

// ── GET — health check ────────────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({ status: 'asesor-bot online' })
}

// ── POST — webhook de Whapi.cloud ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await ensureDB()
    const body = await req.json()

    // Whapi envía { messages: [...] }
    const messages = body?.messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const msg = messages[0]

    // Ignorar mensajes enviados por el propio bot
    if (msg?.from_me) return NextResponse.json({ ok: true })

    // Normalizar número remitente (Whapi envía sin @s.whatsapp.net)
    const sender: string = (msg?.from ?? '').replace(/[^0-9]/g, '')

    // ── FILTRO DE SEGURIDAD ───────────────────────────────────────────────────
    if (sender !== ALLOWED) {
      console.log(`[bot] ignorado: ${sender}`)
      return NextResponse.json({ ok: true })
    }

    let userMessage = ''

    // ── Texto ─────────────────────────────────────────────────────────────────
    if (msg.type === 'text') {
      userMessage = msg?.text?.body ?? ''
    }
    // ── Nota de voz (ptt = push-to-talk, audio, voice) ────────────────────────
    else if (msg.type === 'audio' || msg.type === 'voice' || msg.type === 'ptt') {
      const mediaObj = msg?.audio ?? msg?.voice ?? msg?.ptt ?? {}
      const mediaUrl: string = mediaObj?.link ?? mediaObj?.url ?? mediaObj?.id ?? ''

      if (!mediaUrl) {
        await sendText(sender, `⚠️ _Debug: tipo="${msg.type}" sin URL. Payload: ${JSON.stringify(mediaObj)}_`)
        return NextResponse.json({ ok: true })
      }

      try {
        await sendText(sender, '🎙️ _Transcribiendo nota de voz..._')
        const base64 = await downloadMediaAsBase64(mediaUrl)
        userMessage  = await transcribeAudio(base64)
        await sendText(sender, `_🗒 Transcripción: "${userMessage}"_`)
      } catch (err) {
        console.error('[voice]', err)
        await sendText(sender, '⚠️ _No pude procesar la nota de voz. Intenta de nuevo o escribe el mensaje._')
        return NextResponse.json({ ok: true })
      }
    } else {
      // Debug temporal: mostrar tipo desconocido
      await sendText(sender, `_[debug] tipo de mensaje no soportado: "${msg.type}"_`)
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
