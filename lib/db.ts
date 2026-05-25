import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  ssl: { rejectUnauthorized: false },
  max: 5
})

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id        SERIAL PRIMARY KEY,
      role      VARCHAR(10)  NOT NULL,
      content   TEXT         NOT NULL,
      msg_type  VARCHAR(20)  DEFAULT 'text',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge (
      id         SERIAL PRIMARY KEY,
      category   VARCHAR(100) DEFAULT 'General',
      content    TEXT         NOT NULL,
      source     VARCHAR(20)  DEFAULT 'auto',
      created_at TIMESTAMPTZ  DEFAULT NOW()
    )
  `
}

export async function getRecentMessages(limit = 20) {
  const rows = await sql<{ role: string; content: string }[]>`
    SELECT role, content
    FROM   messages
    ORDER  BY created_at DESC
    LIMIT  ${limit}
  `
  return rows.reverse()
}

export async function saveMessage(role: string, content: string, msgType = 'text') {
  await sql`
    INSERT INTO messages (role, content, msg_type)
    VALUES (${role}, ${content}, ${msgType})
  `
}

export async function getKnowledge() {
  return sql<{ category: string; content: string; source: string }[]>`
    SELECT category, content, source
    FROM   knowledge
    ORDER  BY created_at DESC
  `
}

export async function saveKnowledge(
  content: string,
  category: string,
  source: 'auto' | 'explicit'
) {
  await sql`
    INSERT INTO knowledge (content, category, source)
    VALUES (${content}, ${category}, ${source})
  `
}

export default sql
