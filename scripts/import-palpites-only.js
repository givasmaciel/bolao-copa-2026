/**
 * Importa SOMENTE palpites e palpites_extras do data/render-dump.json
 * no banco apontado por DATABASE_URL. Limpa (DELETE) e reinsere.
 *
 * NÃO toca em: usuarios, jogos, selecoes, grupos, fase_pontuacao,
 *              config, resultados_extras, pontos_bonus.
 *
 * Uso:
 *   # Dry-run (compara sem gravar) — recomendado rodar antes
 *   DATABASE_URL=postgresql://... node scripts/import-palpites-only.js --dry-run
 *
 *   # Aplicar de fato
 *   DATABASE_URL=postgresql://... node scripts/import-palpites-only.js
 *
 *   # Apenas um usuário específico
 *   DATABASE_URL=postgresql://... node scripts/import-palpites-only.js --user=2
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { run, all } = require('../database/db');

const DUMP_FILE = path.join(__dirname, '..', 'data', 'render-dump.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const userArg = args.find(a => a.startsWith('--user='));
const filterUser = userArg ? Number(userArg.split('=')[1]) : null;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida. Use: DATABASE_URL=postgresql://... node scripts/import-palpites-only.js [--dry-run] [--user=ID]');
  process.exit(1);
}
if (!fs.existsSync(DUMP_FILE)) {
  console.error(`Arquivo ${DUMP_FILE} não existe.`);
  process.exit(1);
}

function normalizarLinha(obj, campos) {
  const out = {};
  for (const c of campos) out[c] = obj[c] === undefined ? null : obj[c];
  return out;
}

function diffLinhas(a, b, camposChave, camposComparar) {
  // devolve lista de divergências { tipo: 'falta'|'sobra'|'diferente', chave, a, b }
  const mapA = new Map(), mapB = new Map();
  for (const r of a) {
    const k = camposChave.map(c => r[c]).join('|');
    mapA.set(k, r);
  }
  for (const r of b) {
    const k = camposChave.map(c => r[c]).join('|');
    mapB.set(k, r);
  }
  const out = [];
  for (const [k, ra] of mapA) {
    const rb = mapB.get(k);
    if (!rb) out.push({ tipo: 'sobra_no_alvo', chave: k, a: ra });
    else {
      for (const c of camposComparar) {
        if (ra[c] !== rb[c]) {
          out.push({ tipo: 'diferente', chave: k, campo: c, origem: ra[c], alvo: rb[c] });
        }
      }
    }
  }
  for (const [k, rb] of mapB) {
    if (!mapA.has(k)) out.push({ tipo: 'falta_no_alvo', chave: k, b: rb });
  }
  return out;
}

async function carregarAlvo(tabela, where = '') {
  const rows = await all(`SELECT * FROM ${tabela} ${where}`);
  return rows;
}

async function importarTabela(nome, linhas, campos, camposChave, camposComparar) {
  if (linhas.length === 0) {
    console.log(`  ${nome}: 0 linhas no dump, pulando`);
    return;
  }

  const alvo = await carregarAlvo(nome);
  const diffs = diffLinhas(linhas, alvo, camposChave, camposComparar);

  const contAlvo = {};
  for (const d of diffs) contAlvo[d.tipo] = (contAlvo[d.tipo] || 0) + 1;
  console.log(`  ${nome}: dump=${linhas.length} alvo=${alvo.length}`);
  console.log(`     divergências:`, contAlvo);

  if (dryRun) {
    if (diffs.length === 0) {
      console.log(`     ✅ nada a corrigir`);
    } else {
      console.log(`     amostras (até 10):`);
      for (const d of diffs.slice(0, 10)) {
        if (d.tipo === 'diferente') {
          console.log(`       - ${d.tipo} chave=${d.chave} campo=${d.campo} origem=${d.origem} alvo=${d.alvo}`);
        } else {
          console.log(`       - ${d.tipo} chave=${d.chave}`);
        }
      }
    }
    return;
  }

  // Aplica: DELETE das linhas que faltam/sobram/diferem, depois INSERT/UPDATE
  // Estratégia segura: remove apenas as chaves afetadas e reinsere a partir do dump
  const chavesAfetadas = [...new Set(diffs.map(d => d.chave))];

  // 1. Remove do alvo tudo que está no dump OU que está sobrando e deveria sair
  //    Para garantir: removemos todas as chaves do dump + as que sobram só no alvo.
  const chavesParaRemover = new Set([...chavesAfetadas]);
  // Adiciona chaves que estão só no alvo (sobra_no_alvo) para remover também
  for (const d of diffs) if (d.tipo === 'sobra_no_alvo') chavesParaRemover.add(d.chave);

  if (chavesParaRemover.size > 0) {
    const condicoes = [];
    const params = [];
    for (const k of chavesParaRemover) {
      const valores = k.split('|').map(v => v === 'null' ? null : v);
      const clause = camposChave.map((c, i) => `${c} = ?`).join(' AND ');
      condicoes.push(`(${clause})`);
      params.push(...valores);
    }
    // OR entre todas as chaves — funciona pra PG e SQLite
    const sqlDel = `DELETE FROM ${nome} WHERE ${condicoes.join(' OR ')}`;
    await run(sqlDel, params);
    console.log(`     removidas ${chavesParaRemover.size} chaves divergentes`);
  }

  // 2. Insere/atualiza cada linha do dump (UPSERT manual: INSERT e em caso de conflito, UPDATE)
  let countInsert = 0, countUpdate = 0;
  for (const row of linhas) {
    const norm = normalizarLinha(row, campos);
    const valores = campos.map(c => norm[c]);
    const placeholders = campos.map(() => '?').join(', ');
    const updates = campos.filter(c => !camposChave.includes(c))
      .map(c => `${c} = ?`).join(', ');
    const updateParams = campos.filter(c => !camposChave.includes(c)).map(c => norm[c]);

    const whereClause = camposChave.map(c => `${c} = ?`).join(' AND ');
    const whereParams = camposChave.map(c => norm[c]);

    const exists = await all(`SELECT 1 FROM ${nome} WHERE ${whereClause}`, whereParams);
    if (exists && exists.length > 0) {
      // já existe (provavelmente foi mantido) — atualiza
      await run(
        `UPDATE ${nome} SET ${updates} WHERE ${whereClause}`,
        [...updateParams, ...whereParams]
      );
      countUpdate++;
    } else {
      await run(
        `INSERT INTO ${nome} (${campos.join(', ')}) VALUES (${placeholders})`,
        valores
      );
      countInsert++;
    }
  }
  console.log(`     inseridas ${countInsert}, atualizadas ${countUpdate}`);
}

async function main() {
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, 'utf8'));
  const alvoInfo = process.env.DATABASE_URL.split('@')[1] || '?';
  console.log(`Banco alvo: ${alvoInfo}`);
  console.log(`Modo: ${dryRun ? 'DRY-RUN (não grava)' : 'EXECUTAR (vai gravar)'}`);
  if (filterUser) console.log(`Filtro: somente usuario_id=${filterUser}`);
  console.log('');

  let palpites = dump.palpites || [];
  let extras = dump.palpites_extras || [];
  if (filterUser) {
    palpites = palpites.filter(p => p.usuario_id === filterUser);
    extras = extras.filter(p => p.usuario_id === filterUser);
  }

  await importarTabela(
    'palpites',
    palpites,
    ['id', 'usuario_id', 'jogo_id', 'palpite_gols_casa', 'palpite_gols_visitante', 'pontos_obtidos', 'criado_em', 'atualizado_em'],
    ['usuario_id', 'jogo_id'],
    ['palpite_gols_casa', 'palpite_gols_visitante', 'pontos_obtidos', 'criado_em', 'atualizado_em']
  );

  await importarTabela(
    'palpites_extras',
    extras,
    ['id', 'usuario_id', 'categoria', 'selecao_id', 'criado_em'],
    ['usuario_id', 'categoria', 'selecao_id'],
    ['criado_em']
  );

  console.log(dryRun ? '\n🔍 Dry-run concluído. Rode sem --dry-run para aplicar.' : '\n✅ Concluído.');
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });