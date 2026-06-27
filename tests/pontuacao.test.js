/**
 * Testes básicos de pontuação — rodam com: node tests/pontuacao.test.js
 * Sem dependências externas (mocha/jest), apenas require do módulo real.
 */
const { calcularPontos, calcularPontosMataMata, PONTUACAO_PADRAO } = require('../services/pontuacao');

let passed = 0;
let failed = 0;

function is(got, expected, msg) {
  if (got === expected) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg} — esperado ${expected}, got ${got}`);
    failed++;
  }
}

function close(got, expected, msg, epsilon = 0.001) {
  if (Math.abs(got - expected) < epsilon) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ ${msg} — esperado ${expected}, got ${got}`);
    failed++;
  }
}

console.log('\n📋 Testes: calcularPontos (fase grupo)');
console.log('='.repeat(50));

// pts_grupo = { pts_exato:20, pts_empate:14, pts_resultado_gol:14, pts_resultado:8, pts_gol:3, pts_classificado:0 }
const ptsGrupo = { pts_exato: 20, pts_empate: 14, pts_resultado_gol: 14, pts_resultado: 8, pts_gol: 3, pts_classificado: 0 };

is(calcularPontos(2, 1, 2, 1, ptsGrupo), 20, 'Placar exato — 20 pts');
is(calcularPontos(2, 1, 1, 2, ptsGrupo), 0,  'Placar invertido — 0 pts');
is(calcularPontos(2, 1, 2, 0, ptsGrupo), 14, 'Resultado certo + gol de um time — 14 pts');
is(calcularPontos(2, 1, 1, 0, ptsGrupo), 8,  'Resultado certo, sem gol — 8 pts');
is(calcularPontos(2, 1, 3, 1, ptsGrupo), 14, 'Resultado certo (C), 1 gol certo (visitante) — 14 pts (resultado+gol)');
is(calcularPontos(2, 1, 3, 2, ptsGrupo), 8,  'Resultado certo (C), nenhum gol certo — 8 pts (resultado)');

// Empate
is(calcularPontos(1, 1, 1, 1, ptsGrupo), 20, 'Empate exato 1x1 — 20 pts (placar exato, checked first)');
is(calcularPontos(1, 1, 2, 2, ptsGrupo), 14, 'Empate placar errado — 14 pts (empate)');
is(calcularPontos(1, 1, 2, 1, ptsGrupo), 3,  'Errou resultado (C), 1 gol certo — 3 pts');
is(calcularPontos(1, 1, 0, 0, ptsGrupo), 14, 'Errou tudo mas foi empate — 14 pts (acertou empate)');

// Nulos
is(calcularPontos(null, 1, 2, 1, ptsGrupo), 0, 'golsCasa null → 0');
is(calcularPontos(2, null, 2, 1, ptsGrupo), 0, 'golsVisitante null → 0');
is(calcularPontos(2, 1, null, 1, ptsGrupo), 0, 'palpiteCasa null → 0');
is(calcularPontos(2, 1, 2, null, ptsGrupo), 0, 'palpiteVisitante null → 0');

console.log('\n📋 Testes: calcularPontosMataMata');
console.log('='.repeat(50));

const ptsMataMata = { pts_exato: 30, pts_empate: 20, pts_resultado_gol: 20, pts_resultado: 12, pts_gol: 5, pts_classificado: 6 };

// Jogo decidido nos 90 min (sem empate) — bônus classificado não aplica
const jogo90min = { gols_casa: 2, gols_visitante: 1, classificado_id: 99 };
is(calcularPontosMataMata(jogo90min, 2, 1, 99, ptsMataMata), 30, 'Mata-mata 90min: exato = 30 (bônus não entra)');
is(calcularPontosMataMata(jogo90min, 2, 1, 5, ptsMataMata), 30, 'Mata-mata 90min: exato, classificado errado = 30 (ignora)');
is(calcularPontosMataMata(jogo90min, 2, 0, 99, ptsMataMata), 20, 'Mata-mata 90min: resultado+gol = 20');

// Jogo empatado nos 90 min, decidiu na prorrogação
const jogoPror = { gols_casa: 1, gols_visitante: 1, classificado_id: 10 };
is(calcularPontosMataMata(jogoPror, 1, 1, 10, ptsMataMata), 36, 'Empate 90min, acertou classificado: exato 30 + bonus 6 = 36');
is(calcularPontosMataMata(jogoPror, 1, 1, 5, ptsMataMata), 30,  'Empate 90min, errou classificado: exato 30 (ignora bonus)');
// calcularPontos(1,1, 2,1): resReal=E, resPalpite=C, 1 gol certo → 5 pts (gol)
// + bonus 6 (acertou classificado) = 11
is(calcularPontosMataMata(jogoPror, 2, 1, 10, ptsMataMata), 11, 'Palpite 2x1, acertou classificado: gol 5 + bonus 6 = 11');
// Sem acertar classificado: 5 pts
is(calcularPontosMataMata(jogoPror, 2, 1, 5, ptsMataMata), 5, 'Palpite 2x1, classificado errado: só gol 5');

// Null safety
is(calcularPontosMataMata({ gols_casa: null, gols_visitante: null }, 1, 1, 10, ptsMataMata), 0, 'gols null → 0');

console.log('\n📋 Testes: PONTUACAO_PADRAO');
console.log('='.repeat(50));
is(PONTUACAO_PADRAO.pts_exato, 20, 'PONTUACAO_PADRAO.pts_exato = 20');
is(PONTUACAO_PADRAO.pts_gol, 3, 'PONTUACAO_PADRAO.pts_gol = 3');

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('🎉 Todos os testes passaram!\n');
