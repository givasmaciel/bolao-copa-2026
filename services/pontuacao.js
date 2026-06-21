// Cálculo de pontuação por palpite — função pura, compartilhada entre admin e placar automático
// pts = { pts_exato, pts_empate, pts_resultado_gol, pts_resultado, pts_gol, pts_classificado } (de fase_pontuacao)
const PONTUACAO_PADRAO = { pts_exato: 20, pts_empate: 14, pts_resultado_gol: 14, pts_resultado: 8, pts_gol: 3, pts_classificado: 0 };

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

/**
 * Pontuação do mata-mata — adiciona bônus pelo classificado (prorrogação/pênaltis).
 *
 * Regra: placarBase (calcularPontos normal dos 90 min) + bônus pelo classificado.
 * O bônus SÓ se aplica quando:
 *   - Os 90 minutos terminaram empatados e o admin definiu quem avançou
 *   - E o usuário acertou quem classificou (palpiteClassificadoId === jogo.classificado_id)
 *
 * Se o jogo foi decidido em 90 min, qualquer classificado_id inconsistente é ignorado e
 * a função retorna apenas o placarBase — comportamento idêntico a calcularPontos.
 *
 * @param {object} jogo - { gols_casa, gols_visitante, classificado_id, ... }
 * @param {number} palpiteCasa
 * @param {number} palpiteVisitante
 * @param {number|null} palpiteClassificadoId - ID da seleção que o usuário acha que classifica
 * @param {object} pts - { pts_exato, pts_empate, ..., pts_classificado } de fase_pontuacao
 * @returns {number} pontos totais
 */
function calcularPontosMataMata(jogo, palpiteCasa, palpiteVisitante, palpiteClassificadoId, pts) {
  const p = pts || PONTUACAO_PADRAO;
  // Placar dos 90 min: delega para calcularPontos (que já trata pts_empate corretamente)
  const placarBase = calcularPontos(jogo.gols_casa, jogo.gols_visitante, palpiteCasa, palpiteVisitante, pts);
  // Bônus pelo classificado: somente quando os 90 min terminaram empatados.
  // A checagem do placar protege contra dados administrativos inconsistentes.
  // O valor padrão é metade do pts_resultado (nunca fixo).
  const houveEmpateNos90 = jogo.gols_casa != null
    && jogo.gols_visitante != null
    && jogo.gols_casa === jogo.gols_visitante;
  const ptsResultado = p.pts_resultado ?? PONTUACAO_PADRAO.pts_resultado;
  const ptsClassificadoPadrao = Math.floor(ptsResultado / 2);
  const bonus = (houveEmpateNos90 && jogo.classificado_id && palpiteClassificadoId === jogo.classificado_id)
    ? (p.pts_classificado ?? ptsClassificadoPadrao) : 0;
  return placarBase + bonus;
}

module.exports = { calcularPontos, calcularPontosMataMata, PONTUACAO_PADRAO };
