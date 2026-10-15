const { neon } = require('@neondatabase/serverless');

let ready = false;

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

async function ensureSchema(sql) {
  if (ready) return;
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      image TEXT DEFAULT '',
      price NUMERIC NOT NULL DEFAULT 0,
      price2 NUMERIC DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      colors TEXT DEFAULT '[]',
      sizes TEXT DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'new',
      phone TEXT DEFAULT '',
      customer JSONB DEFAULT '{}',
      items JSONB DEFAULT '[]',
      breakdown JSONB DEFAULT '{}',
      shipping JSONB DEFAULT '{}'
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;
  await sql`
    INSERT INTO settings (key, value)
    VALUES (
      'admin',
      '{"salt":"zs_salt_2024","hash":"b273fd5d04db11e2cd09de0ba0edad12f82fa181fe0c235dd7a5016e17eca7dd"}'
    )
    ON CONFLICT (key) DO NOTHING
  `;
  ready = true;
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

module.exports = { getSql, ensureSchema, json, readBody };
