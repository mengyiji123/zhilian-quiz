import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import mysql from 'mysql2/promise'

import { config } from '../config.js'

const schemaPath = fileURLToPath(new URL('../../../../database/schema.sql', import.meta.url))
const sql = await readFile(schemaPath, 'utf8')
const connection = await mysql.createConnection({ uri: config.databaseUrl, multipleStatements: true })

try {
  await connection.query(sql)
  console.log('MySQL 表结构已应用。')
} finally {
  await connection.end()
}
