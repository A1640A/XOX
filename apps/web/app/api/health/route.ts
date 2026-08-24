import { connectDb, getDbName } from '@xox/db'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  try {
    const conn = await connectDb()
    await conn.connection.db?.admin().ping()
    return Response.json({ ok: true, db: getDbName(), at: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'bilinmeyen hata'
    return Response.json({ ok: false, error: message }, { status: 503 })
  }
}
