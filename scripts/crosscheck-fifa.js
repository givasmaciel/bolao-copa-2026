/**
 * Cross-check: pega o BRT armazenado no banco e converte para a hora LOCAL
 * de cada estádio usando offsets reais (CST sem DST para México, EDT/CDT/PDT
 * com DST para EUA/Canadá). Compara com os horários locais oficiais FIFA.
 *
 *   FIFA  →  site oficial usa o fuso do usuário (BRT no nosso caso)
 *   Banco →  BRT armazenado
 *   Local →  hora no fuso do estádio (cross-check)
 *
 * Uso: node scripts/crosscheck-fifa.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { all } = require('../database/db');

// Horário local oficial (em horário do estádio) - vem do site da FIFA
// Formato: { id, localHHMM, cidade }
const FIFA_LOCAL = {
  1:  { local: '13:00', cidade: 'Cidade do México' }, // México × África do Sul
  2:  { local: '20:00', cidade: 'Guadalajara' },      // Coreia × Tchéquia
  3:  { local: '15:00', cidade: 'Toronto' },          // Canadá × Bósnia
  4:  { local: '18:00', cidade: 'Los Angeles' },      // EUA × Paraguai
  5:  { local: '21:00', cidade: 'Boston' },           // Haiti × Escócia
  6:  { local: '22:00', cidade: 'Vancouver' },        // Austrália × Turquia
  7:  { local: '18:00', cidade: 'Nova York/Nova Jersey' }, // Brasil × Marrocos
  8:  { local: '12:00', cidade: 'San Francisco' },    // Catar × Suíça
  9:  { local: '19:00', cidade: 'Filadélfia' },       // Costa do Marfim × Equador
  10: { local: '12:00', cidade: 'Houston' },           // Alemanha × Curaçau
  11: { local: '15:00', cidade: 'Dallas' },           // Holanda × Japão
  12: { local: '20:00', cidade: 'Monterrey' },        // Suécia × Tunísia
  13: { local: '18:00', cidade: 'Los Angeles' },      // Irã × Nova Zelândia
  14: { local: '12:00', cidade: 'Atlanta' },          // Espanha × Cabo Verde
  15: { local: '12:00', cidade: 'Seattle' },          // Bélgica × Egito
  16: { local: '18:00', cidade: 'Miami' },            // Arábia × Uruguai
  17: { local: '15:00', cidade: 'Nova York/Nova Jersey' }, // França × Senegal
  18: { local: '18:00', cidade: 'Boston' },           // Iraque × Noruega
  19: { local: '20:00', cidade: 'Kansas City' },      // Argentina × Argélia
  20: { local: '21:00', cidade: 'San Francisco' },    // Áustria × Jordânia
  21: { local: '12:00', cidade: 'Houston' },          // Portugal × RD Congo
  22: { local: '15:00', cidade: 'Dallas' },           // Inglaterra × Croácia
  23: { local: '20:00', cidade: 'Cidade do México' }, // Uzbequistão × Colômbia
  24: { local: '19:00', cidade: 'Toronto' },          // Gana × Panamá
  25: { local: '19:00', cidade: 'Guadalajara' },      // México × Coreia
  26: { local: '12:00', cidade: 'Los Angeles' },      // Suíça × Bósnia
  27: { local: '15:00', cidade: 'Vancouver' },        // Canadá × Catar
  28: { local: '11:00', cidade: 'Atlanta' },          // Tchéquia × África do Sul
  29: { local: '18:00', cidade: 'Boston' },           // Escócia × Marrocos
  30: { local: '20:30', cidade: 'Filadélfia' },       // Brasil × Haiti
  31: { local: '12:00', cidade: 'Seattle' },          // EUA × Austrália
  32: { local: '20:00', cidade: 'San Francisco' },    // Turquia × Paraguai
  33: { local: '16:00', cidade: 'Toronto' },          // Alemanha × Costa do Marfim
  34: { local: '19:00', cidade: 'Kansas City' },      // Equador × Curaçau
  35: { local: '12:00', cidade: 'Houston' },          // Holanda × Suécia
  36: { local: '22:00', cidade: 'Monterrey' },        // Tunísia × Japão
  37: { local: '12:00', cidade: 'Los Angeles' },      // Bélgica × Irã
  38: { local: '15:00', cidade: 'Vancouver' },        // Nova Zelândia × Egito
  39: { local: '11:00', cidade: 'Atlanta' },          // Espanha × Arábia
  40: { local: '17:00', cidade: 'Miami' },            // Uruguai × Cabo Verde
  41: { local: '16:00', cidade: 'Filadélfia' },       // França × Iraque
  42: { local: '19:00', cidade: 'Nova York/Nova Jersey' }, // Noruega × Senegal
  43: { local: '12:00', cidade: 'Dallas' },           // Argentina × Áustria
  44: { local: '20:00', cidade: 'San Francisco' },    // Jordânia × Argélia
  45: { local: '12:00', cidade: 'Houston' },          // Portugal × Uzbequistão
  46: { local: '19:00', cidade: 'Toronto' },          // Panamá × Croácia
  47: { local: '20:00', cidade: 'Guadalajara' },      // Colômbia × RD Congo
  48: { local: '15:00', cidade: 'Boston' },           // Inglaterra × Gana
  49: { local: '18:00', cidade: 'Miami' },            // Escócia × Brasil
  50: { local: '18:00', cidade: 'Atlanta' },          // Marrocos × Haiti
  51: { local: '19:00', cidade: 'Monterrey' },        // África do Sul × Coreia
  52: { local: '19:00', cidade: 'Cidade do México' }, // Tchéquia × México
  53: { local: '12:00', cidade: 'Seattle' },          // Bósnia × Catar
  54: { local: '09:00', cidade: 'Vancouver' },        // Suíça × Canadá
  55: { local: '16:00', cidade: 'Filadélfia' },       // Curaçau × Costa do Marfim
  56: { local: '16:00', cidade: 'Nova York/Nova Jersey' }, // Equador × Alemanha
  57: { local: '19:00', cidade: 'San Francisco' },    // Paraguai × Austrália
  58: { local: '19:00', cidade: 'Los Angeles' },      // Turquia × EUA
  59: { local: '17:00', cidade: 'Dallas' },           // Japão × Suécia
  60: { local: '17:00', cidade: 'Kansas City' },      // Tunísia × Holanda
  61: { local: '15:00', cidade: 'Toronto' },          // Senegal × Iraque
  62: { local: '15:00', cidade: 'Boston' },           // Noruega × França
  63: { local: '20:00', cidade: 'Seattle' },          // Egito × Irã
  64: { local: '17:00', cidade: 'Vancouver' },        // Nova Zelândia × Bélgica
  65: { local: '19:00', cidade: 'Houston' },          // Cabo Verde × Arábia
  66: { local: '18:00', cidade: 'Guadalajara' },      // Uruguai × Espanha
  67: { local: '16:00', cidade: 'Nova York/Nova Jersey' }, // Panamá × Inglaterra
  68: { local: '17:00', cidade: 'Filadélfia' },       // Croácia × Gana
  69: { local: '21:00', cidade: 'Kansas City' },      // Argélia × Áustria
  70: { local: '21:00', cidade: 'Dallas' },           // Jordânia × Argentina
  71: { local: '19:30', cidade: 'Miami' },            // Colômbia × Portugal
  72: { local: '19:30', cidade: 'Atlanta' },          // RD Congo × Uzbequistão
};

// Mapa cidade -> UTC offset durante a Copa (jun-jul 2026)
const OFFSET = {
  'Cidade do México': -6, 'Guadalajara': -6, 'Monterrey': -6,         // CST sem DST
  'Vancouver': -7, 'San Francisco': -7, 'Los Angeles': -7, 'Seattle': -7,  // PDT
  'Dallas': -5, 'Houston': -5, 'Kansas City': -5,                    // CDT
  'Toronto': -4, 'Nova York/Nova Jersey': -4, 'Miami': -4,
  'Atlanta': -4, 'Filadélfia': -4, 'Boston': -4,                     // EDT
};

function brtToLocal(brtStr, cidade) {
  // brtStr é "YYYY-MM-DD HH:MM-03:00" ou Date
  const d = new Date(brtStr);
  const off = OFFSET[cidade];
  if (off === undefined) return null;
  // d está em UTC; para obter hora no fuso off: utc + off
  const localH = (d.getUTCHours() + off + 24) % 24;
  const localM = d.getUTCMinutes();
  return `${String(localH).padStart(2, '0')}:${String(localM).padStart(2, '0')}`;
}

async function main() {
  const jogos = await all(`
    SELECT j.id, j.data, j.cidade
    FROM jogos j
    WHERE j.fase = 'grupo'
    ORDER BY j.id
  `);

  let ok = 0, err = 0;
  const problemas = [];

  for (const j of jogos) {
    const f = FIFA_LOCAL[j.id];
    if (!f) continue;
    const localBanco = brtToLocal(j.data, j.cidade);
    const match = localBanco === f.local;
    if (match) {
      ok++;
    } else {
      err++;
      problemas.push({
        id: j.id,
        cidade: j.cidade,
        brt: new Date(j.data).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' }),
        esperadoFIFA: f.local,
        calculado: localBanco,
      });
    }
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Cross-check: ${ok} jogos OK / ${err} divergências de 72`);
  console.log('═══════════════════════════════════════════════════════');
  if (problemas.length) {
    console.log('\n⚠️  Divergências (banco vs site oficial):');
    for (const p of problemas) {
      console.log(`  Jogo #${p.id} (${p.cidade}): BRT ${p.brt} → esperado ${p.esperadoFIFA}, calculado ${p.calculado}`);
    }
  } else {
    console.log('\n✅ Todos os 72 jogos da fase de grupos estão com BRT consistente com o site oficial da FIFA.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
