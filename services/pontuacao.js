// Cálculo de pontuação por palpite — função pura, compartilhada entre admin e placar automático
// pts = { pts_exato, pts_empate, pts_resultado_gol, pts_resultado, pts_gol } (de fase_pontuacao)
const PONTUACAO_PADRAO = { pts_exato: 20, pts_empate: 14, pts_resultado_gol: 14, pts_resultado: 8, pts_gol: 3 };

function calcularPontos(golsCasa, golsVisitante, palpiteCasa, palpiteVisitante, pts) {
  if (golsCasa == null || golsVisitante == null) return 0;
  if (palpiteCasa == null || palpiteVisitante == null) return 0;

  const p = pts || PONTUACAO_PADRAO;
  const exato = p.pts_exato ?? PONTUACAO_PADRAO.pts_exato;
  const empate = p.pts_empate ?? PONTUACAO_PADRAO.pts_empate;
  const resultadoGol = p.pts_resultado_gol ?? PONTUACAO_PADRAO.pts_resultado_gol;
  const resultado = p.pts_resultado ?? PONTUACAO_PADRAO.pts_resultado;
  const gol = p.pts_gol ?? PONTUACAO_PADRAO.pts_gol;

  // Placar exato
  if (golsCasa === palpiteCasa && golsVisitante === palpiteVisitante) return exato;

  // Determina resultado real e do palpite
  const resReal = golsCasa > golsVisitante ? 'C' : (golsCasa < golsVisitante ? 'V' : 'E');
  const resPalpite = palpiteCasa > palpiteVisitante ? 'C' : (palpiteCasa < palpiteVisitante ? 'V' : 'E');

  // Empate (qualquer placar)
  if (resReal === 'E' && resPalpite === 'E') return empate;

  const acertouGolTime = golsCasa === palpiteCasa || golsVisitante === palpiteVisitante;

  if (resReal === resPalpite) {
    return acertouGolTime ? resultadoGol : resultado;
  }
  return acertouGolTime ? gol : 0;
}

module.exports = { calcularPontos, PONTUACAO_PADRAO };
