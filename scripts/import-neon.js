const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dump = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'render-dump.json'), 'utf8'));
const ORDEM = ['usuarios','fase_pontuacao','config','grupos','selecoes','jogos','palpites','palpites_extras','resultados_extras','pontos_bonus'];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  // Limpa
  for (const t of [...ORDEM].reverse()) {
    if (dump[t] && dump[t].length > 0) await pool.query(`DELETE FROM ${t}`);
  }

  // Importa
  for (const nome of ORDEM) {
    const rows = dump[nome];
    if (!rows || rows.length === 0) { console.log(`${nome}: 0, pulando`); continue; }

    const cols = Object.keys(rows[0]);
    const batchSize = 100;
    let idx = 0;
    while (idx < rows.length) {
      const batch = rows.slice(idx, idx + batchSize);
      const values = [];
      const placeholders = batch.map((row, bi) => {
        const offset = bi * cols.length;
        return '(' + cols.map((c, ci) => {
          const v = row[c] === undefined ? null : row[c];
          values.push(v);
          return `$${offset + ci + 1}`;
        }).join(', ') + ')';
      }).join(', ');

      await pool.query(`INSERT INTO ${nome} (${cols.join(', ')}) VALUES ${placeholders}`, values);
      idx += batchSize;
    }
    console.log(`${nome}: ${rows.length} importadas`);
  }

  // Atualiza db_marker
  const hoje = new Date().toISOString().slice(0, 10);
  await pool.query("UPDATE config SET valor = $1 WHERE chave = 'db_marker'", [`neon-producao-${hoje}`]);
  console.log(`\ndb_marker = neon-producao-${hoje}`);
  console.log('✅ Espelho concluído!');
  await pool.end();
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
