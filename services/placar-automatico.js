const { run, get, all } = require('../database/db');

const API_URL = 'https://wheniskickoff.com/data/v1/matches.json';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const API_SIGLA_PARA_DB = {
  MEX: 'MEX', RSA: 'AFS', KOR: 'COR', CZE: 'CZE',
  CAN: 'CAN', BIH: 'BIH', QAT: 'CAT', SUI: 'SUI',
  USA: 'EUA', PAR: 'PAR', BRA: 'BRA', MAR: 'MAR',
  HAI: 'HAI', SCO: 'ESC', AUS: 'AUS', TUR: 'TUR',
  GER: 'GER', CUW: 'CUR', NED: 'HOL', JPN: 'JPN',
  CIV: 'CMF', ECU: 'EQU', SWE: 'SUE', TUN: 'TUN',
  ESP: 'ESP', CPV: 'CBV', BEL: 'BEL', EGY: 'EGI',
  KSA: 'ARA', URU: 'URU', IRN: 'IRA', NZL: 'NZL',
  FRA: 'FRA', SEN: 'SEN', IRQ: 'IRQ', NOR: 'NOR',
  ARG: 'ARG', DZA: 'ALG', AUT: 'AUT', JOR: 'JOR',
  POR: 'POR', COD: 'COD', ENG: 'ING', CRO: 'CRO',
  GHA: 'GHA', PAN: 'PAN', UZB: 'UZB', COL: 'COL'
};

let ultimaExecucao = null;
let ultimoResultado = { ok: false, atualizados: 0, erros: 0, mensagem: '' };

async function buscarPlacares() {
  const resultado = { ok: false, atualizados: 0, erros: 0, ignorados: 0, mensagem: '' };

  try {
    const res = await fetch(API_URL, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const partidas = data.data || [];

    if (partidas.length === 0) {
      resultado.mensagem = 'Nenhuma partida encontrada na API.';
      resultado.ok = true;
      return resultado;
    }

    let encontrouFinalizado = false;

    for (const partida of partidas) {
      if (partida.status !== 'FINISHED') continue;
      encontrouFinalizado = true;
      if (partida.score_home === null || partida.score_away === null) continue;
      if (!partida.home || !partida.away) continue;

      const siglaCasaDB = API_SIGLA_PARA_DB[partida.home];
      const siglaVisitanteDB = API_SIGLA_PARA_DB[partida.away];

      if (!siglaCasaDB || !siglaVisitanteDB) {
        resultado.ignorados++;
        continue;
      }

      const jogo = await get(`
        SELECT j.id, j.finalizado, j.gols_casa, j.gols_visitante
        FROM jogos j
        JOIN selecoes sc ON j.selecao_casa_id = sc.id
        JOIN selecoes sv ON j.selecao_visitante_id = sv.id
        WHERE sc.sigla = ? AND sv.sigla = ? AND j.fase = 'grupo'
      `, [siglaCasaDB, siglaVisitanteDB]);

      if (!jogo) {
        resultado.ignorados++;
        continue;
      }

      if (jogo.finalizado === 1) {
        resultado.ignorados++;
        continue;
      }

      const golsCasa = partida.score_home;
      const golsVisitante = partida.score_away;

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

        const { calcularPontos } = require('../routes/admin');
        for (const p of palpites) {
          const pontos = calcularPontos(golsCasa, golsVisitante, p.palpite_gols_casa, p.palpite_gols_visitante, ptsConfig);
          await run('UPDATE palpites SET pontos_obtidos = ? WHERE id = ?', [pontos, p.id]);
        }
      }

      resultado.atualizados++;
    }

    resultado.ok = true;
    if (!encontrouFinalizado) {
      resultado.mensagem = 'Nenhum jogo finalizado encontrado na API.';
    } else {
      resultado.mensagem = `${resultado.atualizados} jogo(s) atualizado(s), ${resultado.ignorados} ignorado(s).`;
    }
  } catch (err) {
    resultado.mensagem = `Erro: ${err.message}`;
    resultado.erros = 1;
    console.error('[Placar Automático]', err.message);
  }

  ultimaExecucao = new Date();
  ultimoResultado = resultado;
  console.log(`[Placar Automático] ${resultado.mensagem} (${resultado.atualizados} atualizados, ${resultado.ignorados} ignorados)`);
  return resultado;
}

function getStatus() {
  return {
    ultimaExecucao,
    ...ultimoResultado
  };
}

module.exports = { buscarPlacares, getStatus };
