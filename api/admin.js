const { getSql, ensureSchema, json, readBody } = require('./_db');
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });

  try {
    const sql = getSql();
    await ensureSchema(sql);

    if (req.method === 'POST') {
      const body = await readBody(req);
      const action = body.action || 'login';

      const rows = await sql`SELECT value FROM settings WHERE key = 'admin'`;
      const cfg = rows.length ? JSON.parse(rows[0].value) : null;
      if (!cfg) return json(res, 500, { error: 'admin not configured' });

      if (action === 'login') {
        const hash = sha256(cfg.salt + String(body.password || ''));
        if (hash !== cfg.hash) return json(res, 401, { error: 'كلمة المرور غير صحيحة' });
        return json(res, 200, { ok: true, token: 'ok' });
      }

      if (action === 'changepw') {
        const oldHash = sha256(cfg.salt + String(body.oldPassword || ''));
        if (oldHash !== cfg.hash) return json(res, 401, { error: 'كلمة المرور الحالية غير صحيحة' });
        if (!body.newPassword || String(body.newPassword).length < 4) {
          return json(res, 400, { error: 'كلمة المرور الجديدة قصيرة' });
        }
        const newSalt = crypto.randomBytes(16).toString('hex');
        const newHash = sha256(newSalt + String(body.newPassword));
        await sql`
          UPDATE settings SET value = ${JSON.stringify({ salt: newSalt, hash: newHash })}
          WHERE key = 'admin'
        `;
        return json(res, 200, { ok: true });
      }

      return json(res, 400, { error: 'unknown action' });
    }

    return json(res, 405, { error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    return json(res, 500, { error: e.message || 'server error' });
  }
};
