/**
 * Importa um snapshot JSON (gerado por scripts/daily-snapshot.js) no banco
 * apontado por DATABASE_URL.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... node scripts/import-snapshot.js [path-snapshot] [--dry-run]
 *
 * - Sem path-snapshot: usa o mais recente em data/snapshots/.
 * - --dry-run: lê o snapshot e mostra o que SERIA importado, sem tocar no banco.
 *
 * ⚠️ Apaga os dados atuais das 10 tabelas antes de inserir.
 *    Roda dentro de uma transação: se algo falhar, ROLLBACK e banco fica intacto.
 *    Ordem do DELETE é reversa para respeitar foreign keys.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const TABELAS = [
  'usuarios',
  'fase_pontuacao',
  'config',
  'grupos',
  'selecoes',
  'jogos',
  'palpites',
  'palpites_extras',
  'resultados_extras',
  'pontos_bonus',
];

const DRY_RUN = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida.');
  process.exit(1);
}

function snapshotPath(arg) {
  if (arg && !arg.startsWith('--')) return path.resolve(arg);
  const dir = path.join(__dirname, '..', 'data', 'snapshots');
  if (!fs.existsSync(dir)) {
    console.error(`Diretório de snapshots não existe: ${dir}`);
    console.error('Passe o path do snapshot como argumento.');
    process.exit(1);
  }
  const files = fs
    .readdirSync(dir)
    .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.error(`Nenhum snapshot em ${dir}. Rode scripts/daily-snapshot.js primeiro.`);
    process.exit(1);
  }
  return path.join(dir, files[0]);
}

async function getTableCols(client, table) {
  const r = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return r.rows.map(x => x.column_name);
}

async function main() {
  const snapPath = snapshotPath(process.argv[2]);
  console.log(`[import] lendo snapshot: ${snapPath}`);
  if (DRY_RUN) console.log(`[import] modo: DRY-RUN (nada será escrito)\n`);

  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  if (!snap.dados) {
    console.error('Snapshot inválido: chave "dados" ausente.');
    process.exit(1);
  }
  if (snap._meta) {
    console.log(`[import] snapshot criado em: ${snap._meta.criado_em}`);
    console.log(`[import] host de origem:    ${snap._meta.database_host || '?'}`);
  }

  const totalSnap = TABELAS.reduce((s, t) => s + (snap.dados[t]?.length || 0), 0);
  console.log(`\n[import] ${totalSnap} linhas em ${TABELAS.length} tabelas no snapshot\n`);

  if (DRY_RUN) {
    console.log('Tabela'.padEnd(22), 'Linhas snapshot', 'Status');
    console.log('-'.repeat(60));
    for (const tabela of TABELAS) {
      const n = snap.dados[tabela]?.length || 0;
      console.log(tabela.padEnd(22), String(n).padStart(8), n > 0 ? 'seria importada' : 'pulada (vazio)');
    }
    console.log(`\n🔍 DRY-RUN: nenhuma escrita feita. Remova --dry-run para executar.`);
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Pass 1: limpar destino (ordem reversa para respeitar FK)
    console.log('--- Limpando tabelas de destino ---');
    for (const tabela of [...TABELAS].reverse()) {
      const cols = await getTableCols(client, tabela).catch(() => null);
      if (!cols) {
        console.log(`  ${tabela.padEnd(20)} não existe no destino, pulando`);
        continue;
      }
      await client.query(`DELETE FROM ${tabela}`);
      console.log(`  ${tabela.padEnd(20)} ok`);
    }

    // Pass 2: inserir (ordem natural)
    console.log('\n--- Inserindo dados ---');
    let total = 0;
    for (const tabela of TABELAS) {
      const linhas = snap.dados[tabela] || [];
      if (linhas.length === 0) {
        console.log(`  ${tabela.padEnd(20)} 0 linhas no snapshot`);
        continue;
      }
      const tgtCols = await getTableCols(client, tabela);
      if (tgtCols.length === 0) {
        console.log(`  ${tabela.padEnd(20)} tabela não existe no destino, pulando`);
        continue;
      }
      const srcCols = Object.keys(linhas[0]);
      const cols = srcCols.filter(c => tgtCols.includes(c));
      if (cols.length === 0) {
        console.log(`  ${tabela.padEnd(20)} sem colunas em comum com destino, pulando`);
        continue;
      }
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      const colList = cols.map(c => `"${c}"`).join(',');
      const insertSql = `INSERT INTO ${tabela} (${colList}) VALUES (${placeholders})`;
      let count = 0;
      for (const row of linhas) {
        const values = cols.map(c => (row[c] === undefined ? null : row[c]));
        await client.query(insertSql, values);
        count++;
      }
      console.log(`  ${tabela.padEnd(20)} ${count} linhas (${cols.length} colunas)`);
      total += count;
    }

    await client.query('COMMIT');
    console.log(`\n✅ Importação concluída: ${total} linhas no total.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\n❌ Erro, ROLLBACK executado. Banco intacto.`);
    console.error(`   ${e.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
