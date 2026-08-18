import mysql from 'mysql2/promise'
import type { PoolConnection } from 'mysql2/promise'

import { config } from './config.js'
import { observeQuery } from './observability.js'

const pool = mysql.createPool({
  uri: config.databaseUrl,
  connectionLimit: 8,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
})

const originalExecute = pool.execute.bind(pool) as (...args: unknown[]) => Promise<unknown>
pool.execute = ((...args: unknown[]) => observeQuery(args[0], () => originalExecute(...args))) as typeof pool.execute

const instrumentedConnections = new WeakSet<PoolConnection>()
const originalGetConnection = pool.getConnection.bind(pool)
pool.getConnection = async () => {
  const connection = await originalGetConnection()
  if (!instrumentedConnections.has(connection)) {
    const connectionExecute = connection.execute.bind(connection) as (...args: unknown[]) => Promise<unknown>
    connection.execute = ((...args: unknown[]) => (
      observeQuery(args[0], () => connectionExecute(...args))
    )) as typeof connection.execute
    instrumentedConnections.add(connection)
  }
  return connection
}

export const db = pool

export async function pingDatabase(): Promise<void> {
  const connection = await db.getConnection()
  try {
    await connection.ping()
  } finally {
    connection.release()
  }
}
