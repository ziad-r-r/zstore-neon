const { getSql, ensureSchema, json, readBody } = require('./_db');

function mapProduct(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    image: r.image || '',
    price: Number(r.price) || 0,
    price2: Number(r.price2) || 0,
    stock: Number(r.stock) || 0,
    colors: typeof r.colors === 'string' ? JSON.parse(r.colors || '[]') : (r.colors || []),
    sizes: typeof r.sizes === 'string' ? JSON.parse(r.sizes || '[]') : (r.sizes || [])
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });

  try {
    const sql = getSql();
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const rows = await sql`SELECT * FROM products ORDER BY created_at DESC`;
      return json(res, 200, rows.map(mapProduct));
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.name || !body.price) return json(res, 400, { error: 'name and price required' });
      const id = body.id || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2));
      await sql`
        INSERT INTO products (id, name, description, image, price, price2, stock, colors, sizes)
        VALUES (
          ${id},
          ${body.name},
          ${body.description || ''},
          ${body.image || ''},
          ${Number(body.price) || 0},
          ${Number(body.price2) || 0},
          ${Math.floor(Number(body.stock) || 0)},
          ${JSON.stringify(body.colors || [])},
          ${JSON.stringify(body.sizes || [])}
        )
      `;
      const rows = await sql`SELECT * FROM products WHERE id = ${id}`;
      return json(res, 201, mapProduct(rows[0]));
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: 'id required' });
      await sql`
        UPDATE products SET
          name = ${body.name},
          description = ${body.description || ''},
          image = ${body.image || ''},
          price = ${Number(body.price) || 0},
          price2 = ${Number(body.price2) || 0},
          stock = ${Math.floor(Number(body.stock) || 0)},
          colors = ${JSON.stringify(body.colors || [])},
          sizes = ${JSON.stringify(body.sizes || [])}
        WHERE id = ${body.id}
      `;
      const rows = await sql`SELECT * FROM products WHERE id = ${body.id}`;
      if (!rows.length) return json(res, 404, { error: 'not found' });
      return json(res, 200, mapProduct(rows[0]));
    }

    if (req.method === 'DELETE') {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: 'id required' });
      await sql`DELETE FROM products WHERE id = ${body.id}`;
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'server error' });
  }
};
