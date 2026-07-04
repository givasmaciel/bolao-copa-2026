const { obterVencedor } = require('./classificacao');

const ROUNDS = ['r32', 'r16', 'qf', 'sf'];

function splitSides(confrontos) {
  const sides = { left: {}, right: {} };
  for (const fase of ROUNDS) {
    const jogos = confrontos.filter(j => j.fase === fase);
    const meio = Math.ceil(jogos.length / 2);
    sides.left[fase] = jogos.slice(0, meio);
    sides.right[fase] = jogos.slice(meio);
  }
  return sides;
}

function roundLabel(fase) {
  const labels = { r32: '16-avos', r16: 'Oitavas', qf: 'Quartas', sf: 'Semi', final: 'Final', terceiro: '3º lugar' };
  return labels[fase] || fase;
}

async function enriquecerJogos(jogos) {
  return Promise.all(jogos.map(async j => {
    const jogo = { ...j };
    jogo.displayCasa = jogo.casa_pt || 'A definir';
    jogo.displayVisitante = jogo.visitante_pt || 'A definir';

    if (jogo.finalizado && jogo.gols_casa !== null && jogo.gols_visitante !== null) {
      jogo.casaVenceu = jogo.gols_casa > jogo.gols_visitante;
      jogo.visitanteVenceu = jogo.gols_visitante > jogo.gols_casa;
    } else {
      jogo.casaVenceu = false;
      jogo.visitanteVenceu = false;
    }
    return jogo;
  }));
}

async function organizarBracket(confrontos) {
  const sorted = [...confrontos].sort((a, b) => a.id - b.id);
  const sides = splitSides(sorted);

  const enrichedSides = { left: {}, right: {} };
  for (const fase of ROUNDS) {
    const [left, right] = await Promise.all([
      enriquecerJogos(sides.left[fase] || []),
      enriquecerJogos(sides.right[fase] || []),
    ]);
    enrichedSides.left[fase] = left;
    enrichedSides.right[fase] = right;
  }

  const final = sorted.find(j => j.fase === 'final') || null;
  const terceiro = sorted.find(j => j.fase === 'terceiro') || null;

  return {
    sides: enrichedSides,
    final: final ? (await enriquecerJogos([final]))[0] : null,
    terceiro: terceiro ? (await enriquecerJogos([terceiro]))[0] : null,
  };
}

module.exports = { organizarBracket, roundLabel, ROUNDS };
