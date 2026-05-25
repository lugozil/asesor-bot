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

  return `Eres el asesor financiero personal, contador y consultor empresarial de Miguel (usuario venezolano, empresa Lumotica Innovations). Respondes por WhatsApp.

Hoy es: ${today}

${FINANCIAL_CONTEXT}

## BASE DE CONOCIMIENTO DINÁMICA
${knowledgeContext || 'Sin entradas aún.'}

## REGLAS DE FORMATO (MUY IMPORTANTE)
- Responde siempre en español
- *MÁXIMO 5-8 líneas por respuesta*. Si hay más info, resume y ofrece ampliar
- Usa formato WhatsApp: *negrita*, _cursiva_, listas con guion (-)
- Sin párrafos largos. Directo al punto
- Sé proactivo: si ves un riesgo u oportunidad, dilo en 1 línea

## REGLAS DE CONTENIDO
- Si el usuario comparte información nueva (ingreso, gasto, avance, idea, cliente, deuda), al FINAL agrega exactamente esta línea:
  GUARDAR_AUTO:[categoría]|[resumen máximo 15 palabras]
- Si piden un gráfico, al FINAL agrega exactamente esta línea (debe ser JSON válido en una sola línea):
  CHART_JSON:{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"Título","data":[1,2],"backgroundColor":["#4F81BD","#C0504D"]}]},"options":{"plugins":{"title":{"display":true,"text":"Título del gráfico"}}}}
- CHART_JSON debe ir en la ÚLTIMA línea, sin nada después
- Si escriben "guardar: [algo]", confirma con: ✅ *Guardado.*`
}

// ── Exportaciones ──────────────────────────────────────────────────────────────
export interface ChatResult {
  response:  string
  autoSave?: { category: string; content: string }
  chartUrl?: string
}

export async function chat(userMessage: string): Promise<ChatResult> {
  const [history, knowledgeRows] = await Promise.all([
    getRecentMessages(10),
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
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: [
      {
        type:          'text',
        text:          buildSystemPrompt(knowledgeContext),
        cache_control: { type: 'ephemeral' }   // cachea el system prompt 5 min
      }
    ],
    messages
  })

  const full = reply.content[0].type === 'text' ? reply.content[0].text : ''

  // Extraer GUARDAR_AUTO
  const autoSaveMatch = full.match(/GUARDAR_AUTO:([^|]+)\|(.+?)(?=\n|$)/i)
  const autoSave = autoSaveMatch
    ? { category: autoSaveMatch[1].trim(), content: autoSaveMatch[2].trim() }
    : undefined

  // Extraer CHART_JSON — buscar la línea que empieza con el marcador
  let chartUrl: string | undefined
  const chartLine = full.split('\n').findLast(l => l.trimStart().startsWith('CHART_JSON:'))
  if (chartLine) {
    const jsonStr = chartLine.slice(chartLine.indexOf('CHART_JSON:') + 'CHART_JSON:'.length).trim()
    try {
      const config = JSON.parse(jsonStr)
      // Usar API POST de QuickChart → devuelve URL corta permanente
      const qcRes = await fetch('https://quickchart.io/chart/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chart: config, width: 800, height: 400, backgroundColor: 'white' })
      })
      const qcData = await qcRes.json()
      if (qcData?.url) chartUrl = qcData.url
    } catch { /* ignorar chart malformado */ }
  }

  // Limpiar marcadores de la respuesta visible
  const response = full
    .split('\n')
    .filter(l => !l.trimStart().startsWith('GUARDAR_AUTO:') && !l.trimStart().startsWith('CHART_JSON:'))
    .join('\n')
    .trim()

  return { response, autoSave, chartUrl }
}
