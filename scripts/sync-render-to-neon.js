/**
 * Sincroniza Render → Neon automaticamente.
 * 1. Faz dump do Render
 * 2. Compara contadores com Neon
 * 3. Se houver diferenças, pergunta antes de sincronizar (ou usa --force)
 *
 * Uso:
 *   node scripts/sync-render-to-neon.js        # pede confirmação
 *   node scripts/sync-render-to-neon.js --force  # sem confirmação
 *   node scripts/sync-render-to-neon.js --dry-run  # só compara
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { run } = require('../database/db');

const TABELAS = ['usuarios','fase_pontuacao','config','grupos','selecoes','jogos','palpites','palpites_extras','resultados_extras','pontos_bonus'];
const DUMP_FILE = path.join(__dirname, '..', 'data', 'render-dump-fresco.json');

async function dumpBanco(url, label) {
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  const dump = { _label: label, _exported_at: new Date().toISOString() };
  for (const t of TABELAS) {
    try {
      const orderBy = (t === 'fase_pontuacao' || t === 'config') ? '' : 'ORDER BY id';
      const r = await pool.query(`SELECT * FROM ${t} ${orderBy}`);
      dump[t] = r.rows;
    } catch (e) { console.error(`  ${t}: erro - ${e.message}`); }
  }
  await pool.end();
  return dump;
}

async function contagemNeon() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_NEON, ssl: { rejectUnauthorized: false } });
  const counts = {};
  for (const t of TABELAS) {
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      counts[t] = r.rows[0].c;
    } catch (e) { counts[t] = -1; }
  }
  await pool.end();
  return counts;
}

async function importarTabela(nome, linhas) {
  if (linhas.length === 0) return 0;

  // Mapeamento de colunas (igual import-render-dump.js)
  const COLUNAS = {
    usuarios:        ['id', 'nome', 'email', 'username', 'senha_hash', 'is_admin', 'foto_base64', 'criado_em'],
    palpites:        ['id', 'usuario_id', 'jogo_id', 'palpite_gols_casa', 'palpite_gols_visitante', 'pontos_obtidos', 'criado_em', 'atualizado_em'],
    palpites_extras: ['id', 'usuario_id', 'categoria', 'selecao_id', 'criado_em'],
    resultados_extras: ['id', 'categoria', 'selecao_id', 'pontos'],
    fase_pontuacao:  ['fase', 'pts_exato', 'pts_empate', 'pts_resultado_gol', 'pts_resultado', 'pts_gol'],
    config:          ['chave', 'valor'],
    pontos_bonus:    ['id', 'usuario_id', 'pontos', 'motivo', 'criado_em'],
  };

  const cols = COLUNAS[nome];
  if (!cols) {
    console.log(`  ${nome}: sem mapeamento de colunas, pulando`);
    return 0;
  }

  await run(`DELETE FROM ${nome}`);
  let count = 0;
  for (const row of linhas) {
    const values = cols.map(c => row[c] === undefined ? null : row[c]);
    const placeholders = cols.map(() => '?').join(', ');
    await run(`INSERT INTO ${nome} (${cols.join(', ')}) VALUES (${placeholders})`, values);
    count++;
  }
  return count;
}

async function perguntar(question) {
  const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => readline.question(question, ans => { readline.close(); resolve(ans); }));
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  if (!process.env.DATABASE_URL_RENDER || !process.env.DATABASE_URL_NEON) {
    console.error('❌ Configure DATABASE_URL_RENDER e DATABASE_URL_NEON no .env');
    process.exit(1);
  }

  console.log('=== 1. Dump do Render ===');
  const dump = await dumpBanco(process.env.DATABASE_URL_RENDER, 'Render');
  fs.writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 2));
  const totalsRender = Object.fromEntries(TABELAS.map(t => [t, dump[t]?.length || 0]));
  console.log(`  Salvo em: ${DUMP_FILE}`);
  console.log(`  Marcador: ${dump.config?.find(c => c.chave === 'db_marker')?.valor || '?'}`);

  console.log('\n=== 2. Comparação ===');
  const totalsNeon = await contagemNeon();
  const diffs = [];
  for (const t of TABELAS) {
    const r = totalsRender[t] || 0;
    const n = totalsNeon[t] || 0;
    if (r !== n) diffs.push({ tabela: t, render: r, neon: n });
    const flag = r === n ? '✅' : '⚠️ ';
    console.log(`  ${flag} ${t.padEnd(20)} Render=${r.toString().padStart(5)}  Neon=${n.toString().padStart(5)}`);
  }

  if (diffs.length === 0) {
    console.log('\n✅ Bancos já estão sincronizados! Nada a fazer.');
    return;
  }

  console.log(`\n⚠️  ${diffs.length} tabela(s) com diferença:`);
  diffs.forEach(d => console.log(`    ${d.tabela}: Render=${d.render}, Neon=${d.neon} (diff ${d.render - d.neon})`));

  if (dryRun) {
    console.log('\n🔍 Modo dry-run — nada foi modificado.');
    return;
  }

  if (!force) {
    const resposta = await perguntar('\nSincronizar Render → Neon agora? (sim/não): ');
    if (resposta.toLowerCase() !== 'sim' && resposta.toLowerCase() !== 's') {
      console.log('Cancelado.');
      return;
    }
  }

  console.log('\n=== 3. Sincronizando ===');
  // Aponta o db.js para Neon
  process.env.DATABASE_URL = process.env.DATABASE_URL_NEON;
  // Re-require db.js com a nova DATABASE_URL (ele já cacheou, então forçamos reload)
  delete require.cache[require.resolve('../database/db')];
  const { run: runNeon } = require('../database/db');

  const ordem = ['usuarios', 'fase_pontuacao', 'config', 'palpites', 'palpites_extras', 'resultados_extras', 'pontos_bonus'];
  for (const t of ordem) {
    if (!dump[t] || dump[t].length === 0) {
      console.log(`  ${t}: 0 linhas, pulando`);
      continue;
    }
    const n = await importarTabela(t, dump[t]);
    console.log(`  ${t}: ${n} linhas importadas`);
  }

  // Atualiza db_marker no Neon
  const data = new Date().toISOString().slice(0, 10);
  await runNeon("DELETE FROM config WHERE chave = 'db_marker'");
  await runNeon("INSERT INTO config (chave, valor) VALUES (?, ?)", ['db_marker', `neon-producao-${data}`]);
  console.log(`\n  db_marker atualizado para neon-producao-${data}`);

  console.log('\n✅ Sincronização concluída!');
})().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });