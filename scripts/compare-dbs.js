// Comparação pontual Render vs Neon (uso único — pode apagar depois)
const { Pool } = require('pg');
require('dotenv').config();

const renderUrl = process.env.DATABASE_URL;
const neonUrl = 'postgresql://neondb_owner:npg_n6PxvEYkgda9@ep-red-brook-a64zto1n-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require';

const TABELAS = ['usuarios','fase_pontuacao','config','grupos','selecoes','jogos','palpites','palpites_extras','resultados_extras','pontos_bonus'];

async function probe(url, label) {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  const out = { _label: label };
  try {
    const m = await pool.query("SELECT valor FROM config WHERE chave='db_marker'");
    out['db_marker'] = m.rows[0] ? m.rows[0].valor : '(sem linha)';
    const v = await pool.query('SHOW server_version');
    out['pg_version'] = v.rows[0].server_version;
    for (const t of TABELAS) {
      const r = await pool.query('SELECT COUNT(*)::int AS c FROM ' + t);
      out[t] = r.rows[0].c;
    }
    // last id (proxy para "última escrita")
    for (const t of ['palpites','palpites_extras','jogos']) {
      try {
        const r = await pool.query('SELECT MAX(id) AS m FROM ' + t);
        out[t + '.max_id'] = r.rows[0].m;
      } catch (e) { out[t + '.max_id'] = '(erro)'; }
    }
  } catch (e) { out._err = e.message; }
  await pool.end();
  return out;
}

(async () => {
  const r = await probe(renderUrl, 'Render');
  const n = await probe(neonUrl, 'Neon');
  const keys = Object.keys(r).filter(k => !k.startsWith('_'));
  console.log('Chave'.padEnd(22), 'Render'.padEnd(38), 'Neon'.padEnd(38), '');
  console.log('-'.repeat(102));
  for (const k of keys) {
    const a = String(r[k] ?? '');
    const b = String(n[k] ?? '');
    const flag = a === b ? '✅' : '⚠️  DIFERENTE';
    console.log(k.padEnd(22), a.padEnd(38), b.padEnd(38), flag);
  }
  if (r._err) console.log('\nRender erro:', r._err);
  if (n._err) console.log('\nNeon erro:', n._err);
})();
