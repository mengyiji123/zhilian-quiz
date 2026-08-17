import mysql from 'mysql2/promise'

import { config } from './config.js'

export const db = mysql.createPool({
  uri: config.databaseUrl,
  connectionLimit: 8,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  decimalNumbers: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
})

export async function pingDatabase(): Promise<void> {
  const connection = await db.getConnection()
  try {
    await connection.ping()
  } finally {
    connection.release()
  }
}
