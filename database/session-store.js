const { Store } = require('express-session');
const { run, get } = require('./db');

const usandoPG = !!process.env.DATABASE_URL;

class DbSessionStore extends Store {
  constructor() {
    super();
  }

  get(sid, callback) {
    get(
      'SELECT data FROM sessions WHERE sid = ? AND (expires IS NULL OR expires > ?)',
      [sid, new Date().toISOString()]
    ).then(row => {
      if (!row) return callback(null, null);
      try {
        callback(null, JSON.parse(row.data));
      } catch {
        callback(null, null);
      }
    }).catch(err => callback(err));
  }

  set(sid, session, callback) {
    const data = JSON.stringify(session);
    const expires = session.cookie?.expires
      ? new Date(session.cookie.expires).toISOString()
      : null;

    if (usandoPG) {
      run(
        `INSERT INTO sessions (sid, data, expires)
         VALUES (?, ?, ?)
         ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, expires = EXCLUDED.expires`,
        [sid, data, expires]
      ).then(() => callback(null)).catch(err => callback(err));
    } else {
      run(
        'INSERT OR REPLACE INTO sessions (sid, data, expires) VALUES (?, ?, ?)',
        [sid, data, expires]
      ).then(() => callback(null)).catch(err => callback(err));
    }
  }

  destroy(sid, callback) {
    run('DELETE FROM sessions WHERE sid = ?', [sid])
      .then(() => callback(null))
      .catch(err => callback(err));
  }

  touch(sid, session, callback) {
    const expires = session.cookie?.expires
      ? new Date(session.cookie.expires).toISOString()
      : null;
    run('UPDATE sessions SET expires = ? WHERE sid = ?', [expires, sid])
      .then(() => callback(null))
      .catch(err => callback(err));
  }

  clearExpired() {
    const agora = new Date().toISOString();
    run('DELETE FROM sessions WHERE expires IS NOT NULL AND expires <= ?', [agora])
      .then(result => {
        if (result.changes > 0) {
          console.log(`🧹 ${result.changes} sessão(ões) expirada(s) removida(s)`);
        }
      })
      .catch(err => console.error('Erro ao limpar sessões expiradas:', err));
  }
}

module.exports = DbSessionStore;
