const { run, get, all } = require('../database/db');
const { calcularPontos, calcularPontosMataMata } = require('./pontuacao');
const logger = require('../logger');

const API_URL = 'https://worldcup26.ir/get/games';

const API_NOME_PARA_SIGLA = {
  'Mexico': 'MEX', 'South Africa': 'AFS', 'South Korea': 'COR', 'Czech Republic': 'CZE',
  'Canada': 'CAN', 'Bosnia and Herzegovina': 'BIH', 'Qatar': 'CAT', 'Switzerland': 'SUI',
  'United States': 'EUA', 'Paraguay': 'PAR', 'Australia': 'AUS', 'Turkey': 'TUR',
  'Brazil': 'BRA', 'Morocco': 'MAR', 'Haiti': 'HAI', 'Scotland': 'ESC',
  'Germany': 'GER', 'Curaçao': 'CUR', 'Ivory Coast': 'CMF', 'Ecuador': 'EQU',
  'Netherlands': 'HOL', 'Japan': 'JPN', 'Sweden': 'SUE', 'Tunisia': 'TUN',
  'Spain': 'ESP', 'Cape Verde': 'CBV', 'Saudi Arabia': 'ARA', 'Uruguay': 'URU',
  'France': 'FRA', 'Senegal': 'SEN', 'Iraq': 'IRQ', 'Norway': 'NOR',
  'Argentina': 'ARG', 'Algeria': 'ALG', 'Austria': 'AUT', 'Jordan': 'JOR',
  'Portugal': 'POR', 'Democratic Republic of the Congo': 'COD', 'Uzbekistan': 'UZB', 'Colombia': 'COL',
  'England': 'ING', 'Croatia': 'CRO', 'Ghana': 'GHA', 'Panama': 'PAN',
  'Belgium': 'BEL', 'Egypt': 'EGI', 'Iran': 'IRA', 'New Zealand': 'NZL',
};

const FETCH_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5_000, 10_000, 20_000];

let ultimaExecucao = null;
let ultimoResultado = { ok: false, atualizados: 0, erros: 0, ignorados: 0, mensagem: '' };
let falhasConsecutivas = 0;

async function fetchComTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function buscarPlacares() {
  const resultado = { ok: false, atualizados: 0, erros: 0, ignorados: 0, mensagem: '' };

  for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
    try {
      const res = await fetchComTimeout(API_URL, {}, FETCH_TIMEOUT);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      falhasConsecutivas = 0;

      const body = await res.json();
      const partidas = body?.games || [];

      if (partidas.length === 0) {
        resultado.mensagem = 'Nenhuma partida encontrada na API.';
        resultado.ok = true;
        break;
      }

      let encontrouFinalizado = false;

      for (const partida of partidas) {
        if (partida.finished !== 'TRUE') continue;
        encontrouFinalizado = true;
        if (partida.home_score === null || partida.away_score === null) continue;
        if (!partida.home_team_name_en || !partida.away_team_name_en) continue;

        const siglaCasaDB = API_NOME_PARA_SIGLA[partida.home_team_name_en];
        const siglaVisitanteDB = API_NOME_PARA_SIGLA[partida.away_team_name_en];

        if (!siglaCasaDB || !siglaVisitanteDB) {
          resultado.ignorados++;
          continue;
        }

        const jogo = await get(`
          SELECT j.id, j.finalizado, j.gols_casa, j.gols_visitante, j.fase,
                 j.selecao_casa_id, j.selecao_visitante_id
          FROM jogos j
          JOIN selecoes sc ON j.selecao_casa_id = sc.id
          JOIN selecoes sv ON j.selecao_visitante_id = sv.id
          WHERE sc.sigla = ? AND sv.sigla = ?
        `, [siglaCasaDB, siglaVisitanteDB]);

        if (!jogo) {
          resultado.ignorados++;
          continue;
        }

        if (jogo.finalizado === 1) {
          resultado.ignorados++;
          continue;
        }

        const golsCasa = Number(partida.home_score);
        const golsVisitante = Number(partida.away_score);
        const ehGrupo = jogo.fase === 'grupo';
        const ehMataMata = !ehGrupo;
        const decididoNos90Min = golsCasa !== golsVisitante; // mata-mata: empate vai pra prorrogação/pênaltis

        if (ehGrupo) {
          // Jogos de grupo: sempre finalizar — não tem prorrogação
          await run(
            'UPDATE jogos SET gols_casa = ?, gols_visitante = ?, finalizado = 1 WHERE id = ?',
            [golsCasa, golsVisitante, jogo.id]
          );

          const ptsConfig = await get('SELECT * FROM fase_pontuacao WHERE fase = ?', ['grupo']);

          if (ptsConfig) {
            const palpites = await all(
              'SELECT id, palpite_gols_casa, palpite_gols_visitante FROM palpites WHERE jogo_id = ?',
              [jogo.id]
            );

            for (const p of palpites) {
              const pontos = calcularPontos(golsCasa, golsVisitante, p.palpite_gols_casa, p.palpite_gols_visitante, ptsConfig);
              await run('UPDATE palpites SET pontos_obtidos = ? WHERE id = ?', [pontos, p.id]);
            }
          }
        } else if (ehMataMata && decididoNos90Min) {
          // Mata-mata decidido em 90 min (sem prorrogação): finalizar automático + calcular pontos
          const classificadoId = golsCasa > golsVisitante ? jogo.selecao_casa_id : jogo.selecao_visitante_id;
          await run(
            'UPDATE jogos SET gols_casa = ?, gols_visitante = ?, finalizado = 1, classificado_id = ? WHERE id = ?',
            [golsCasa, golsVisitante, classificadoId, jogo.id]
          );

          const ptsConfig = await get('SELECT * FROM fase_pontuacao WHERE fase = ?', [jogo.fase]);

          if (ptsConfig) {
            const palpites = await all(
              'SELECT id, palpite_gols_casa, palpite_gols_visitante, palpite_classificado_id FROM palpites WHERE jogo_id = ?',
              [jogo.id]
            );

            for (const p of palpites) {
              const pontos = calcularPontosMataMata(
                { gols_casa: golsCasa, gols_visitante: golsVisitante, classificado_id: classificadoId },
                p.palpite_gols_casa,
                p.palpite_gols_visitante,
                p.palpite_classificado_id,
                ptsConfig
              );
              await run('UPDATE palpites SET pontos_obtidos = ? WHERE id = ?', [pontos, p.id]);
            }
          }
        } else {
          // Mata-mata empatado nos 90 min: só grava os gols, admin finaliza com prorrogação/pênaltis
          await run(
            'UPDATE jogos SET gols_casa = ?, gols_visitante = ? WHERE id = ?',
            [golsCasa, golsVisitante, jogo.id]
          );
        }

        resultado.atualizados++;
      }

      resultado.ok = true;
      if (!encontrouFinalizado) {
        resultado.mensagem = 'Nenhum jogo finalizado encontrado na API.';
      } else {
        resultado.mensagem = `${resultado.atualizados} jogo(s) atualizado(s), ${resultado.ignorados} ignorado(s).`;
      }

      break;

    } catch (err) {
      if (tentativa < MAX_RETRIES) {
        const delay = RETRY_DELAYS[tentativa - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        logger.warn('placar-automatico retry', { tentativa, max: MAX_RETRIES, error: err.message, delay_ms: delay });
        await new Promise(r => setTimeout(r, delay));
      } else {
        falhasConsecutivas++;
        resultado.mensagem = `Erro após ${MAX_RETRIES} tentativas: ${err.message}`;
        resultado.erros = 1;
        logger.error('placar-automatico falhou', { error: err.message, falhasConsecutivas });
      }
    }
  }

  ultimaExecucao = new Date();
  ultimoResultado = resultado;
  logger.info('placar-automatico executado', { atualizados: resultado.atualizados, ignorados: resultado.ignorados, erros: resultado.erros, mensagem: resultado.mensagem });
  return resultado;
}

function getStatus() {
  return {
    ultimaExecucao,
    ...ultimoResultado
  };
}

module.exports = { buscarPlacares, getStatus };
