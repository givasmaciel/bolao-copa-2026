/**
 * Verifica os horários dos jogos no banco, mostrando o horário BRT (armazenado)
 * e o horário local do estádio para conferência.
 *
 * Uso: node scripts/verificar-horarios.js
 *      node scripts/verificar-horarios.js --grupo A
 *      node scripts/verificar-horarios.js --dia 2026-06-14
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { all } = require('../database/db');

// Mapa cidade -> UTC offset durante a Copa (jun-jul 2026)
// México não adota horário de verão desde 2022.
// EUA/Canadá estão em horário de verão (EDT/CDT/PDT).
const TIMEZONE_MAP = {
  'Cidade do México': -6,  // CST (sem DST)
  'Guadalajara': -6,       // CST (sem DST)
  'Monterrey': -6,         // CST (sem DST)
  'Vancouver': -7,         // PDT
  'Toronto': -4,           // EDT
  'Nova York/Nova Jersey': -4, // EDT
  'Dallas': -5,            // CDT
  'Los Angeles': -7,       // PDT
  'Miami': -4,             // EDT
  'Atlanta': -4,           // EDT
  'Houston': -5,           // CDT
  'Kansas City': -5,       // CDT
  'Seattle': -7,           // PDT
  'San Francisco': -7,     // PDT
  'Filadélfia': -4,        // EDT
  'Boston': -4,            // EDT
};

function converterBRTParaLocal(dataBRT, cidade) {
  const offsetLocal = TIMEZONE_MAP[cidade];
  if (offsetLocal === undefined) return { local: '?', diff: '?' };

  // dataBRT é string como "2026-06-11 13:00-03:00"
  const dt = new Date(dataBRT);
  // dt está em UTC internamente. A hora BRT é dt + 3h (UTC->BRT)
  // A hora local é dt + (-offsetLocal) (UTC->local)
  // Diferença: BRT - local = (UTC+3) - (UTC+offset) = 3 - offsetLocal
  const diffHoras = -3 - offsetLocal; // BRT = UTC-3, local = UTC+offsetLocal
  const sinal = diffHoras >= 0 ? '+' : '';
  const partes = dt.toISOString().split('T')[1].split(':');
  const utcH = parseInt(partes[0], 10);
  const utcM = parseInt(partes[1], 10);
  let localH = utcH + offsetLocal;
  let localD = new Date(dt);
  if (localH < 0) { localH += 24; localD.setDate(localD.getDate() - 1); }
  if (localH >= 24) { localH -= 24; localD.setDate(localD.getDate() + 1); }
  const localStr = `${String(localH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}`;

  return {
    local: localStr,
    diff: `${sinal}${Math.abs(diffHoras)}h`
  };
}

async function main() {
  const args = process.argv.slice(2);
  const filtroGrupo = args.includes('--grupo') ? args[args.indexOf('--grupo') + 1] : null;
  const filtroDia = args.includes('--dia') ? args[args.indexOf('--dia') + 1] : null;

  let sql = `
    SELECT j.id, j.rodada, j.data, j.estadio, j.cidade, j.pais,
      g.letra AS grupo,
      sc.nome_pt AS casa, sv.nome_pt AS visitante
    FROM jogos j
    LEFT JOIN grupos g ON j.grupo_id = g.id
    LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
    LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
    WHERE j.fase = 'grupo'
    ORDER BY j.data
  `;

  const jogos = await all(sql);

  let filtrados = jogos;
  if (filtroGrupo) filtrados = jogos.filter(j => j.grupo?.toLowerCase() === filtroGrupo.toLowerCase());
  if (filtroDia) filtrados = jogos.filter(j => j.data?.startsWith(filtroDia));

  if (filtrados.length === 0) {
    console.log('Nenhum jogo encontrado com esse filtro.');
    return;
  }

  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    VERIFICAÇÃO DE HORÁRIOS DOS JOGOS                        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('║  Todos os horários estão em BRT (UTC-3) no banco.                           ║');
  console.log('║  A coluna "Local" mostra o horário no fuso do estádio p/ conferência.       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  for (const j of filtrados) {
    const conv = converterBRTParaLocal(j.data, j.cidade);
    const dataBRT = new Date(j.data);
    const dataStr = dataBRT.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false
    });

    const casa = (j.casa || '???').padEnd(18);
    const visitante = (j.visitante || '???').padEnd(18);
    const grupo = (j.grupo || '??').padStart(2);
    const estadio = (j.estadio || '').padEnd(30);
    const cidade = (j.cidade || '').padEnd(22);
    const localH = conv.local.padStart(5);
    const diff = conv.diff.padStart(4);

    console.log(
      `R${String(j.rodada).padStart(2)} Gr.${grupo}  ${casa}× ${visitante}  ` +
      `BRT: ${dataStr}  Local: ${localH} (${diff})  ${cidade}`
    );
  }

  console.log('');
  console.log('Legenda da coluna "Local": horário no fuso do estádio (deveria bater com o');
  console.log('horário local oficial da partida). "diff" = diferença BRT - Local.');
  console.log('Ex: diff = +1h significa BRT está 1h à frente do local.');
}

main().catch(err => { console.error(err); process.exit(1); });
