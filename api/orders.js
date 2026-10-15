const { getSql, ensureSchema, json, readBody } = require('./_db');

function mapOrder(r) {
  return {
    id: r.id,
    orderNo: r.order_no,
    createdAt: r.created_at,
    status: r.status,
    phone: r.phone || '',
    customer: r.customer || {},
    items: r.items || [],
    breakdown: r.breakdown || {},
    shipping: r.shipping || {}
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });

  try {
    const sql = getSql();
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const q = (url.searchParams.get('q') || '').trim();
      const id = url.searchParams.get('id');
      const phone = (url.searchParams.get('phone') || '').replace(/\s/g, '');
      const orderNo = (url.searchParams.get('orderNo') || '').toUpperCase();

      if (id) {
        const rows = await sql`SELECT * FROM orders WHERE id = ${id}`;
        if (!rows.length) return json(res, 404, { error: 'not found' });
        return json(res, 200, mapOrder(rows[0]));
      }

      if (orderNo) {
        const rows = await sql`SELECT * FROM orders WHERE UPPER(order_no) = ${orderNo} ORDER BY created_at DESC`;
        return json(res, 200, rows.map(mapOrder));
      }

      if (phone) {
        const rows = await sql`SELECT * FROM orders WHERE phone = ${phone} ORDER BY created_at DESC`;
        return json(res, 200, rows.map(mapOrder));
      }

      let rows = await sql`SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`;
      if (q) {
        const qq = q.toLowerCase();
        rows = rows.filter((r) => {
          const c = r.customer || {};
          return (
            String(r.order_no || '').toLowerCase().includes(qq) ||
            String(c.name || '').toLowerCase().includes(qq) ||
            String(c.phone || r.phone || '').includes(q)
          );
        });
      }
      return json(res, 200, rows.map(mapOrder));
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.customer || !body.items || !body.items.length) {
        return json(res, 400, { error: 'customer and items required' });
      }

      for (const item of body.items) {
        const rows = await sql`SELECT stock, name FROM products WHERE id = ${item.pid}`;
        if (!rows.length) return json(res, 400, { error: `product missing: ${item.pid}` });
        if (Number(rows[0].stock) < Number(item.qty)) {
          return json(res, 400, { error: `المتاح من ${rows[0].name} ${rows[0].stock} فقط` });
        }
      }
      for (const item of body.items) {
        await sql`UPDATE products SET stock = stock - ${Number(item.qty)} WHERE id = ${item.pid}`;
      }

      const id = body.id || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2));
      const orderNo = body.orderNo || ('ZS-' + String(Date.now()).slice(-6));
      const phone = String(body.phone || body.customer.phone || '').replace(/\s/g, '');

      await sql`
        INSERT INTO orders (id, order_no, status, phone, customer, items, breakdown, shipping)
        VALUES (
          ${id},
          ${orderNo},
          ${body.status || 'new'},
          ${phone},
          ${JSON.stringify(body.customer)},
          ${JSON.stringify(body.items)},
          ${JSON.stringify(body.breakdown || {})},
          ${JSON.stringify(body.shipping || { stage: -1 })}
        )
      `;
      const rows = await sql`SELECT * FROM orders WHERE id = ${id}`;
      return json(res, 201, mapOrder(rows[0]));
    }

    if (req.method === 'PATCH') {
      const body = await readBody(req);
      if (!body.id) return json(res, 400, { error: 'id required' });

      if (body.status != null) {
        await sql`UPDATE orders SET status = ${body.status} WHERE id = ${body.id}`;
      }
      if (body.shipping != null) {
        await sql`UPDATE orders SET shipping = ${JSON.stringify(body.shipping)} WHERE id = ${body.id}`;
      }
      if (body.breakdown != null) {
        await sql`UPDATE orders SET breakdown = ${JSON.stringify(body.breakdown)} WHERE id = ${body.id}`;
      }

      const rows = await sql`SELECT * FROM orders WHERE id = ${body.id}`;
      if (!rows.length) return json(res, 404, { error: 'not found' });
      return json(res, 200, mapOrder(rows[0]));
    }

    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'server error' });
  }
};
