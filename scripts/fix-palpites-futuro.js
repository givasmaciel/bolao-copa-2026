/**
 * Replica os palpites do Render para o Neon, MAS SOMENTE para jogos NÃO
 * finalizados no Neon (o "futuro"). Palpites de jogos já finalizados no Neon
 * são preservados com seus pontos_obtidos já calculados.
 *
 * - Lê data/render-dump-fresco.json (dump fresco do Render)
 * - Descobre via Neon quais jogos estão finalizados
 * - DELETE no Neon: palpites cujo jogo NÃO está finalizado
 * - INSERT no Neon: palpites do Render cujo jogo NÃO está finalizado no Neon
 *
 * Uso:
 *   DATABASE_URL=postgresql://...neon... node scripts/fix-palpites-futuro.js --dry-run
 *   DATABASE_URL=postgresql://...neon... node scripts/fix-palpites-futuro.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { run, all } = require('../database/db');

const DUMP_FILE = path.join(__dirname, '..', 'data', 'render-dump-fresco.json');
const dryRun = process.argv.includes('--dry-run');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida.');
  process.exit(1);
}
if (!fs.existsSync(DUMP_FILE)) {
  console.error(`Arquivo ${DUMP_FILE} não existe. Rode o dump do Render primeiro.`);
  process.exit(1);
}

async function main() {
  const dump = JSON.parse(fs.readFileSync(DUMP_FILE, 'utf8'));
  console.log(`Modo: ${dryRun ? 'DRY-RUN' : 'EXECUTAR'}`);
  console.log(`Render dump: ${dump.palpites.length} palpites, ${dump.palpites_extras.length} extras\n`);

  // 1) Descobrir jogos finalizados no Neon
  const neonFin = await all('SELECT id FROM jogos WHERE finalizado = 1 ORDER BY id');
  const finIds = new Set(neonFin.map(j => j.id));
  console.log(`Neon finalizados: ${finIds.size} jogos: ${[...finIds].join(', ')}`);

  // 2) Filtrar palpites do Render: pegar SÓ os de jogos não finalizados no Neon
  const renderFuturo = dump.palpites.filter(p => !finIds.has(p.jogo_id));
  const renderPassado = dump.palpites.filter(p => finIds.has(p.jogo_id));
  console.log(`Render palpites para JOGOS NÃO finalizados no Neon: ${renderFuturo.length}`);
  console.log(`Render palpites para JOGOS JÁ finalizados no Neon (NÃO TOCAR): ${renderPassado.length}`);

  // 3) Ver o que tem no Neon pra jogos não finalizados (que será removido)
  const finList = [...finIds];
  const neonFuturo = await all(
    `SELECT id, usuario_id, jogo_id, palpite_gols_casa, palpite_gols_visitante, pontos_obtidos
     FROM palpites WHERE jogo_id NOT IN (${finList.join(',') || '0'}) ORDER BY usuario_id, jogo_id`
  );
  console.log(`Neon palpites atuais para jogos NÃO finalizados (serão apagados): ${neonFuturo.length}`);

  // Diff entre o que vai sair (neonFuturo) e o que vai entrar (renderFuturo)
  const neonSet = new Map(neonFuturo.map(p => [p.usuario_id + '|' + p.jogo_id, p]));
  const rendSet = new Map(renderFuturo.map(p => [p.usuario_id + '|' + p.jogo_id, p]));

  let iguais = 0, diferentes = 0, somenteNeon = 0, somenteRender = 0;
  for (const [k, n] of neonSet) {
    const r = rendSet.get(k);
    if (!r) { somenteNeon++; continue; }
    if (Number(n.palpite_gols_casa) === Number(r.palpite_gols_casa) &&
        Number(n.palpite_gols_visitante) === Number(r.palpite_gols_visitante)) {
      iguais++;
    } else {
      diferentes++;
    }
  }
  for (const [k] of rendSet) {
    if (!neonSet.has(k)) somenteRender++;
  }
  console.log(`\n  iguais: ${iguais}`);
  console.log(`  diferentes (vão ser corrigidos): ${diferentes}`);
  console.log(`  só no Neon (vão sumir): ${somenteNeon}`);
  console.log(`  só no Render (vão aparecer): ${somenteRender}`);

  if (dryRun) {
    console.log('\n🔍 Dry-run. Sem mudanças. Rode sem --dry-run para aplicar.');
    if (diferentes > 0) {
      console.log('\nAmostra dos diferentes:');
      let n = 0;
      for (const [k, neo] of neonSet) {
        const ren = rendSet.get(k);
        if (!ren) continue;
        if (Number(neo.palpite_gols_casa) !== Number(ren.palpite_gols_casa) ||
            Number(neo.palpite_gols_visitante) !== Number(ren.palpite_gols_visitante)) {
          console.log(`  jogo=${neo.jogo_id} u=${neo.usuario_id}: Neon ${neo.palpite_gols_casa}x${neo.palpite_gols_visitante} → Render ${ren.palpite_gols_casa}x${ren.palpite_gols_visitante}`);
          if (++n >= 10) break;
        }
      }
    }
    if (somenteNeon > 0) {
      console.log('\nAmostra dos que vão SUMIR (existem só no Neon):');
      for (const [k, neo] of neonSet) {
        if (!rendSet.has(k)) {
          console.log(`  jogo=${neo.jogo_id} u=${neo.usuario_id}: ${neo.palpite_gols_casa}x${neo.palpite_gols_visitante}`);
          if (--somenteNeon < 0) break;
        }
      }
    }
    if (somenteRender > 0) {
      console.log('\nAmostra dos que vão APARECER (existem só no Render):');
      for (const [k, ren] of rendSet) {
        if (!neonSet.has(k)) {
          console.log(`  jogo=${ren.jogo_id} u=${ren.usuario_id}: ${ren.palpite_gols_casa}x${ren.palpite_gols_visitante}`);
          if (--somenteRender < 0) break;
        }
      }
    }
    return;
  }

  // 4) Backup rápido (SELECT INTO temp ou arquivo) - já temos contagens, segue
  // 5) DELETE + INSERT
  console.log('\nAplicando...');
  const finClause = finList.length ? `jogo_id NOT IN (${finList.join(',')})` : '1=1';
  const del = await run(`DELETE FROM palpites WHERE ${finClause}`);
  console.log(`✓ Removidos ${del.changes} palpites de jogos não finalizados`);

  // INSERT em batch
  const cols = ['id', 'usuario_id', 'jogo_id', 'palpite_gols_casa', 'palpite_gols_visitante', 'pontos_obtidos', 'criado_em', 'atualizado_em'];
  let inserted = 0;
  for (const p of renderFuturo) {
    const vals = cols.map(c => p[c] === undefined ? null : p[c]);
    const placeholders = cols.map(() => '?').join(', ');
    await run(`INSERT INTO palpites (${cols.join(', ')}) VALUES (${placeholders})`, vals);
    inserted++;
  }
  console.log(`✓ Inseridos ${inserted} palpites do Render`);

  // Verificação final
  const finalCount = await all(`SELECT COUNT(*)::int AS c FROM palpites`);
  console.log(`\n✅ Total de palpites no Neon agora: ${finalCount[0].c}`);
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });