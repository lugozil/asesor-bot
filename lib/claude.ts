import Anthropic from '@anthropic-ai/sdk'
import { getRecentMessages, getKnowledge } from './db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Contexto financiero base (se actualiza manualmente cuando cambie) ──────────
const FINANCIAL_CONTEXT = `
## TU SITUACIÓN FINANCIERA (actualizada al 25-05-2026)

### INGRESOS
| Fuente | Monto | Fecha cobro |
|---|---|---|
| Focus (marketing Puerto Rico, dealerships) | $700/mes | $400 el 15, $300 el 30 |
| HiddenForce (España, reclutamiento latino) | $120/mes | el 30 |
| Signal (empresa emergente) | $150/mes | el 5 |
| **TOTAL ACTUAL** | **$970/mes** | |
| Junio 2026 (extra Signal one-time: web+CRM) | +$1,000 | 5 jun |
| Desde julio 2026 (Signal sube) | **$1,570/mes** | |

### EGRESOS MENSUALES
| Concepto | Monto |
|---|---|
| TodoPymes suscripción | $343 |
| Publicidad TodoPymes | $250 |
| Seguro de salud | $80 |
| Comida | $80 |
| Internet | $30 |
| Hobby | $30 |
| Claude suscripción | $20 |
| Lumotica (alcaldía) | $20 |
| **TOTAL** | **$853/mes** |

### FLUJO NETO
- Actual: $970 − $853 = **$117/mes**
- Junio: $1,970 − $853 = **$1,117**
- Desde julio: $1,570 − $853 = **$717/mes**

### AHORROS: $500
### DEUDA ACTIVA: $580 (máquina vending, sin intereses, pagar ~5 jun con el cobro de Signal)

### PROYECTOS
1. **TodoPymes** — servicio propio en números rojos. Gastos: $593/mes. Total invertido: $1,857. Requiere clientes para alcanzar punto de equilibrio (ver dashboard).
2. **Máquina Vending de Agua** — construcción propia desde cero para vender a inversores (ingresos pasivos). Invertido en prototipos: $1,750. Costo fabricación unidad: $900–$1,300. Precio venta: $2,500–$3,500. Margen bruto: ~$1,200–$2,600. Casi terminada.
3. **LatSecurity** — control de portones con MQTT + WhatsApp. Sin inversión monetaria. Solo tiempo/procesos.
4. **Vechio** — agente AI en desarrollo. Sin inversión monetaria. Solo tiempo.
5. **MLS** — lista múltiple para inmobiliarias. Bajo Lumotica Innovations. Desarrollado por tesista. Sin inversión.
6. **Lumotica Innovations** — empresa propia de domótica. Actualmente solo reventas. Paga $20/mes (alcaldía).

### ALERTAS
- 30 may: cobrar Focus $300 + HiddenForce $120
- 5 jun: cobrar Signal $150 + $1,000 one-time → saldar deuda vending $580
- Jul: Signal sube a $750/mes (neto mensual pasa a $717)
`.trim()

// ── Sistema prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(knowledgeContext: string): string {
  const today = new Date().toLocaleDateString('es-VE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Caracas'
  })

  return `Eres el asesor financiero personal, contador y consultor empresarial de Miguel (usuario venezolano, empresa Lumotica Innovations). Respondes por WhatsApp — usa formato WhatsApp: *negrita*, _cursiva_, listas con guion. Sé conciso, directo y útil.

Hoy es: ${today}

${FINANCIAL_CONTEXT}

## BASE DE CONOCIMIENTO DINÁMICA
${knowledgeContext || 'Sin entradas aún.'}

## REGLAS
- Responde siempre en español
- Usa los datos financieros de arriba como fuente de verdad
- Sé proactivo: si ves un riesgo o una oportunidad, dilo sin que te lo pidan
- Si el usuario comparte información nueva o relevante (ingreso, gasto, avance, idea, cliente, deuda), al FINAL de tu respuesta agrega en una línea separada:
  GUARDAR_AUTO:[categoría]|[resumen en 1-2 líneas]
  Ejemplo: GUARDAR_AUTO:TodoPymes|Se firmó cliente "Ferretería López" en plan básico el 25-may-2026
- Si el usuario pide un gráfico, al FINAL de tu respuesta agrega en una línea separada:
  CHART_JSON:{"type":"bar","data":{"labels":[...],"datasets":[{"label":"...","data":[...],"backgroundColor":"..."}]},"options":{"plugins":{"title":{"display":true,"text":"..."}}}}
  Usa colores amigables: #4F81BD, #C0504D, #9BBB59, #8064A2
- Si el usuario escribe "guardar: [algo]", confirma con: ✅ *Guardado.*
- Cuando el usuario pida su resumen financiero, usa siempre los datos de arriba actualizados`
}

// ── Exportaciones ──────────────────────────────────────────────────────────────
export interface ChatResult {
  response:  string
  autoSave?: { category: string; content: string }
  chartUrl?: string
}

export async function chat(userMessage: string): Promise<ChatResult> {
  const [history, knowledgeRows] = await Promise.all([
    getRecentMessages(20),
    getKnowledge()
  ])

  const knowledgeContext = knowledgeRows.length
    ? knowledgeRows.map(k => `[${k.category}] ${k.content}`).join('\n')
    : ''

  const messages: Anthropic.MessageParam[] = [
    ...history.map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user', content: userMessage }
  ]

  const reply = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1024,
    system:     buildSystemPrompt(knowledgeContext),
    messages
  })

  const full = reply.content[0].type === 'text' ? reply.content[0].text : ''

  // Extraer GUARDAR_AUTO
  const autoSaveMatch = full.match(/GUARDAR_AUTO:([^|]+)\|(.+?)(?=\n|$)/i)
  const autoSave = autoSaveMatch
    ? { category: autoSaveMatch[1].trim(), content: autoSaveMatch[2].trim() }
    : undefined

  // Extraer CHART_JSON
  const chartMatch = full.match(/CHART_JSON:(\{[\s\S]*?\})(?=\n|$)/m)
  let chartUrl: string | undefined
  if (chartMatch) {
    try {
      const encoded = encodeURIComponent(chartMatch[1].trim())
      chartUrl = `https://quickchart.io/chart?c=${encoded}&w=800&h=400&bkg=white`
    } catch { /* ignorar chart malformado */ }
  }

  // Limpiar marcadores de la respuesta visible
  const response = full
    .replace(/GUARDAR_AUTO:[^\n]+/gi, '')
    .replace(/CHART_JSON:\{[\s\S]*?\}(?=\n|$)/m, '')
    .trim()

  return { response, autoSave, chartUrl }
}
