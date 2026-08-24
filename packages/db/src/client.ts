import mongoose from 'mongoose'
import type { MongoClient } from 'mongodb'

/**
 * Fluid Compute instance'ları modül kapsamını yeniden kullanır. Global önbellek
 * olmadan her istek yeni bir bağlantı havuzu açar ve Atlas bağlantı limiti dolar.
 */
interface MongooseCache {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

const globalForMongoose = globalThis as unknown as { __xoxMongoose?: MongooseCache }

const cache: MongooseCache = (globalForMongoose.__xoxMongoose ??= { conn: null, promise: null })

export function getMongoUri(): string {
  const uri = process.env['MONGODB_URI']
  if (uri === undefined || uri === '') {
    throw new Error(
      'MONGODB_URI tanımlı değil. .env.local veya Vercel ortam değişkenlerini kontrol et.',
    )
  }
  return uri
}

export function getDbName(): string {
  return process.env['MONGODB_DB'] ?? 'xox_dev'
}

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn !== null) return cache.conn

  cache.promise ??= mongoose.connect(getMongoUri(), {
    dbName: getDbName(),
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10_000,
  })

  cache.conn = await cache.promise
  return cache.conn
}

/**
 * Auth.js MongoDB adapter'ı `mongodb` sürücüsünü doğrudan ister. Mongoose'un
 * mevcut istemcisini paylaşarak ikinci bir bağlantı havuzu açılmasını önleriz.
 */
export async function getMongoClient(): Promise<MongoClient> {
  const conn = await connectDb()
  return conn.connection.getClient()
}

export async function disconnectDb(): Promise<void> {
  if (cache.conn === null) return
  await cache.conn.disconnect()
  cache.conn = null
  cache.promise = null
}
