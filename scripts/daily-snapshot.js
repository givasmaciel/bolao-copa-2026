/**
 * Faz snapshot do banco apontado por DATABASE_URL (Render ou Neon)
 * e salva em data/snapshots/snapshot-YYYY-MM-DD-HHMMSS.json
 *
 * Roda manualmente:
 *   DATABASE_URL=postgresql://... node scripts/daily-snapshot.js
 *
 * Para agendar no Windows (Task Scheduler), ver README no fim do arquivo.
 * Para Linux/Mac, ver bloco do crontab no fim.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { all } = require('../database/db');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida.');
  process.exit(1);
}

// Tabelas a incluir no snapshot. Adicione aqui se criar tabelas novas.
const TABELAS = [
  'usuarios',
  'grupos',
  'selecoes',
  'jogos',
  'palpites',
  'palpites_extras',
  'resultados_extras',
  'fase_pontuacao',
  'config',
  'pontos_bonus',
];

// Quantos snapshots manter em disco (mais antigos são apagados)
const KEEP_LAST = 30;

function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function main() {
  const stamp = nowStamp();
  const outDir = path.join(__dirname, '..', 'data', 'snapshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `snapshot-${stamp}.json`);

  // Identifica host do banco (sem senha) só pra log
  const dbLabel = (() => {
    try {
      const u = new URL(process.env.DATABASE_URL);
      return u.host.split('.')[0] + ' (' + u.hostname + ')';
    } catch { return '?'; }
  })();

  console.log(`[snapshot] banco: ${dbLabel}`);
  console.log(`[snapshot] destino: ${outFile}`);

  const snapshot = {
    _meta: {
      criado_em: new Date().toISOString(),
      database_host: (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return null; } })(),
      node_version: process.version,
    },
    dados: {},
  };

  for (const tabela of TABELAS) {
    try {
      const rows = await all(`SELECT * FROM ${tabela}`);
      snapshot.dados[tabela] = rows;
      console.log(`  ${tabela.padEnd(20)} ${rows.length} linhas`);
    } catch (e) {
      // tabela pode não existir ainda (ex: pontos_bonus em banco novo)
      console.log(`  ${tabela.padEnd(20)} pulou (${e.message.split('\n')[0]})`);
      snapshot.dados[tabela] = [];
    }
  }

  fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
  const sizeKB = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`\n✅ Snapshot salvo: ${outFile} (${sizeKB} KB)`);

  // Rotação: mantém apenas os KEEP_LAST mais recentes
  const arquivos = fs.readdirSync(outDir)
    .filter(f => f.startsWith('snapshot-') && f.endsWith('.json'))
    .sort();
  if (arquivos.length > KEEP_LAST) {
    const toRemove = arquivos.slice(0, arquivos.length - KEEP_LAST);
    for (const f of toRemove) fs.unlinkSync(path.join(outDir, f));
    console.log(`🧹 Removidos ${toRemove.length} snapshots antigos (mantendo últimos ${KEEP_LAST})`);
  }
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });

/* -----------------------------------------------------------------------------
 * COMO AGENDAR (escolha seu sistema):
 *
 * === Windows (Task Scheduler) ===
 * 1. Abre "Agendador de Tarefas" (Task Scheduler)
 * 2. "Criar Tarefa Básica..."
 * 3. Nome: bolao-snapshot-diario
 * 4. Disparador: Diariamente, às 03:00 da manhã (fora do horário de jogos)
 * 5. Ação: Iniciar um programa
 *    - Programa: C:\Program Files\nodejs\node.exe (ajuste se diferente)
 *    - Argumentos: scripts\daily-snapshot.js
 *    - Iniciar em: C:\Users\NoteFnde\Downloads\projetos\bolao
 * 6. Marque "Executar estando o usuário conectado ou não" se quiser
 *
 * === Linux / Mac (cron) ===
 * Adiciona no crontab (crontab -e):
 *   0 3 * * * cd /caminho/do/bolao && DATABASE_URL='postgresql://...' /usr/bin/node scripts/daily-snapshot.js >> /var/log/bolao-snapshot.log 2>&1
 *
 * === Render Cron Job (se quiser rodar lá) ===
 * Cria um serviço "Cron Job" no Render que roda `node scripts/daily-snapshot.js`
 * com a DATABASE_URL configurada. Render free tier tem limite, então melhor
 * rodar local.
 *
 * === Manual ===
 * DATABASE_URL=postgresql://user:pass@host/db node scripts/daily-snapshot.js
 * ----------------------------------------------------------------------------- */