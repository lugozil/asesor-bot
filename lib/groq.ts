import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! })

export async function transcribeAudio(base64Audio: string): Promise<string> {
  const buffer = Buffer.from(base64Audio, 'base64')
  const blob   = new Blob([buffer], { type: 'audio/ogg' })
  const file   = new File([blob], 'voice.ogg', { type: 'audio/ogg' })

  const result = await groq.audio.transcriptions.create({
    file,
    model:    'whisper-large-v3',
    language: 'es'
  })

  return result.text
}
