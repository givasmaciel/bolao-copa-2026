const { run, get, all } = require('../database/db');
const { calcularPontos } = require('./pontuacao');

const API_URL = 'https://26worldcup.cn/api/v1/cup/2026/schedule';
const API_KEY = process.env.PLANO_AUTO_API_KEY || 'ft_bolao_co_8d3ff2c4132244de97a58898dd260728694d25a3';

const API_NOME_PARA_SIGLA = {
  'Mexico': 'MEX', 'South Africa': 'AFS', 'South Korea': 'COR', 'Czechia': 'CZE',
  'Canada': 'CAN', 'Bosnia & Herzegovina': 'BIH', 'Qatar': 'CAT', 'Switzerland': 'SUI',
  'USA': 'EUA', 'Paraguay': 'PAR', 'Australia': 'AUS', 'Türkiye': 'TUR',
  'Brazil': 'BRA', 'Morocco': 'MAR', 'Haiti': 'HAI', 'Scotland': 'ESC',
  'Germany': 'GER', 'Curaçao': 'CUR', 'Ivory Coast': 'CMF', 'Ecuador': 'EQU',
  'Netherlands': 'HOL', 'Japan': 'JPN', 'Sweden': 'SUE', 'Tunisia': 'TUN',
  'Spain': 'ESP', 'Cape Verde Islands': 'CBV', 'Saudi Arabia': 'ARA', 'Uruguay': 'URU',
  'France': 'FRA', 'Senegal': 'SEN', 'Iraq': 'IRQ', 'Norway': 'NOR',
  'Argentina': 'ARG', 'Algeria': 'ALG', 'Austria': 'AUT', 'Jordan': 'JOR',
  'Portugal': 'POR', 'Congo DR': 'COD', 'Uzbekistan': 'UZB', 'Colombia': 'COL',
  'England': 'ING', 'Croatia': 'CRO', 'Ghana': 'GHA', 'Panama': 'PAN',
  'Belgium': 'BEL', 'Egypt': 'EGI', 'Iran': 'IRA', 'New Zealand': 'NZL',
};

let ultimaExecucao = null;
let ultimoResultado = { ok: false, atualizados: 0, erros: 0, mensagem: '' };

async function buscarPlacares() {
  const resultado = { ok: false, atualizados: 0, erros: 0, ignorados: 0, mensagem: '' };

  try {
    const res = await fetch(API_URL, {
      headers: { 'Api-Key': API_KEY }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const body = await res.json();
    const partidas = body?.data?.matches || [];

    if (partidas.length === 0) {
      resultado.mensagem = 'Nenhuma partida encontrada na API.';
      resultado.ok = true;
      return resultado;
    }

    let encontrouFinalizado = false;

    for (const partida of partidas) {
      if (partida.status !== 'FT') continue;
      encontrouFinalizado = true;
      if (partida.home_score === null || partida.away_score === null) continue;
      if (!partida.home_team || !partida.away_team) continue;

      const siglaCasaDB = API_NOME_PARA_SIGLA[partida.home_team];
      const siglaVisitanteDB = API_NOME_PARA_SIGLA[partida.away_team];

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

      const golsCasa = Number(partida.home_score);
      const golsVisitante = Number(partida.away_score);

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
