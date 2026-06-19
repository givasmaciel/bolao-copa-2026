/**
 * Importa data/render-dump.json no banco apontado por DATABASE_URL.
 * Ordem respeita FKs: usuarios -> palpites/palpites_extras -> resultados_extras
 *                     -> fase_pontuacao -> config -> pontos_bonus
 *
 * Uso: DATABASE_URL=postgresql://... node scripts/import-render-dump.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { run } = require('../database/db');

const DUMP_FILE = path.join(__dirname, '..', 'data', 'render-dump.json');

const COLUNAS = {
  // codigo_convite do dump é descartado (não existe no schema atual)
  usuarios:        ['id', 'nome', 'email', 'username', 'senha_hash', 'is_admin', 'foto_base64', 'criado_em'],
  palpites:        ['id', 'usuario_id', 'jogo_id', 'palpite_gols_casa', 'palpite_gols_visitante', 'pontos_obtidos', 'criado_em', 'atualizado_em'],
  palpites_extras: ['id', 'usuario_id', 'categoria', 'selecao_id', 'criado_em'],
  resultados_extras: ['id', 'categoria', 'selecao_id', 'pontos'],
  fase_pontuacao:  ['fase', 'pts_exato', 'pts_empate', 'pts_resultado_gol', 'pts_resultado', 'pts_gol'],
  config:          ['chave', 'valor'],
  pontos_bonus:    ['id', 'usuario_id', 'pontos', 'motivo', 'criado_em'],
};

async function importarTabela(nome, linhas) {
  if (linhas.length === 0) {
    console.log(`  ${nome}: 0 linhas, pulando`);
    return 0;
  }
  const cols = COLUNAS[nome];
  if (!cols) throw new Error(`Colunas não definidas para ${nome}`);

  // Limpa dados existentes (cuidado: rodar só quando seed estiver pronto)
  await run(`DELETE FROM ${nome}`);

  let count = 0;
  for (const row of linhas) {
    const values = cols.map(c => {
      const v = row[c];
      // Trata null/undefined
      return (v === undefined) ? null : v;
    });
    const placeholders = cols.map(() => '?').join(', ');
    const sql = `INSERT INTO ${nome} (${cols.join(', ')}) VALUES (${placeholders})`;
    try {
      await run(sql, values);
      count++;
    } catch (err) {
      console.error(`  Erro em ${nome} linha ${count + 1}:`, err.message);
      console.error('  Row:', JSON.stringify(row));
      throw err;
    }
  }
  console.log(`  ${nome}: ${count} linhas importadas`);
  return count;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não definida. Use: DATABASE_URL=postgresql://... node scripts/import-render-dump.js');
    process.exit(1);
  }
  if (!fs.existsSync(DUMP_FILE)) {
    console.error(`Arquivo ${DUMP_FILE} não existe. Rode primeiro o dump do Render.`);
    process.exit(1);
  }

  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, 'utf8'));
  console.log(`Importando dump em ${process.env.DATABASE_URL.split('@')[1] || '?'}\n`);

  // Ordem por dependência de FK
  const ordem = ['usuarios', 'fase_pontuacao', 'config', 'palpites', 'palpites_extras', 'resultados_extras', 'pontos_bonus'];
  let total = 0;
  for (const tabela of ordem) {
    if (!dump[tabela]) continue;
    total += await importarTabela(tabela, dump[tabela]);
  }
  console.log(`\n✅ Total: ${total} linhas importadas`);
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });
