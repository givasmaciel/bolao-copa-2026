const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');
const { PALPITE_MARGEM_MS } = require('../services/palpite-config');
const logger = require('../logger');

const router = express.Router();

router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const userId = req.session.usuario.id;

    // Próximos 5 jogos ainda não iniciados
    const proximosJogos = await all(`
      SELECT j.id, j.data, j.palpite_limite, j.estadio, j.cidade,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.finalizado = 0 AND j.selecao_casa_id IS NOT NULL
      ORDER BY j.data ASC
    `, [userId]);

    // Remove jogos já iniciados que ainda não foram marcados como finalizados.
    const agoraDashboard = new Date();
    const proximosAbertos = proximosJogos
      .filter(j => new Date(j.data) > agoraDashboard)
      .slice(0, 5);

    // Jogos sem palpite do usuário (pendentes)
    const pendentesArr = await all(`
      SELECT COUNT(*) AS total
      FROM jogos j
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.finalizado = 0 AND j.selecao_casa_id IS NOT NULL AND p.id IS NULL
    `, [userId]);

    // Top 5 do ranking
    const top5 = await all(`
      SELECT
        u.id, u.nome, u.foto,
        COALESCE(SUM(p.pontos_obtidos), 0) + COALESCE((
          SELECT SUM(r.pontos)
          FROM palpites_extras pe
          JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
          WHERE pe.usuario_id = u.id
        ), 0) + COALESCE((SELECT SUM(pontos) FROM pontos_bonus WHERE usuario_id = u.id), 0) AS total_pontos
      FROM usuarios u
      LEFT JOIN palpites p ON p.usuario_id = u.id
      GROUP BY u.id
      ORDER BY total_pontos DESC
      LIMIT 5
    `);

    // Estatísticas do usuário (apenas jogos finalizados)
    const stats = await get(`
      SELECT
        COUNT(p.id) AS total_palpites,
        COALESCE(SUM(p.pontos_obtidos), 0) AS total_pontos,
        SUM(CASE WHEN p.pontos_obtidos > 0 THEN 1 ELSE 0 END) AS palpites_certos,
        SUM(CASE WHEN p.palpite_gols_casa = j.gols_casa
                  AND p.palpite_gols_visitante = j.gols_visitante
                 THEN 1 ELSE 0 END) AS placares_exatos
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE p.usuario_id = ? AND j.finalizado = 1
    `, [userId]);

    // Pontos bônus do usuário
    const bonusRow = await get('SELECT COALESCE(SUM(pontos), 0) AS total FROM pontos_bonus WHERE usuario_id = ?', [userId]);

    // Pontos extras do usuário
    const extrasRowPts = await get(`
      SELECT COALESCE(SUM(r.pontos), 0) AS total
      FROM palpites_extras pe
      JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
      WHERE pe.usuario_id = ?
    `, [userId]);

    const totalFinalizados = await get(`
      SELECT COUNT(*) AS total FROM jogos WHERE finalizado = 1 AND selecao_casa_id IS NOT NULL
    `);

    const totalDisputado = await get(`
      SELECT COALESCE(SUM(
        fp.pts_exato +
        CASE
          WHEN j.fase <> 'grupo'
           AND j.gols_casa = j.gols_visitante
           AND j.classificado_id IS NOT NULL
          THEN fp.pts_classificado
          ELSE 0
        END
      ), 0) AS total
      FROM jogos j
      JOIN fase_pontuacao fp ON fp.fase = j.fase
      WHERE j.finalizado = 1
    `);
    const maximoJogos = Number(totalDisputado?.total) || 0;
    const aproveitamento = maximoJogos > 0
      ? Math.max(0, Math.min(100, Math.round(((Number(stats?.total_pontos) || 0) / maximoJogos) * 100)))
      : 0;

    // Últimos 5 jogos finalizados com o palpite do usuário
    const recentes = await all(`
      SELECT j.id, j.data, j.gols_casa, j.gols_visitante,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.finalizado = 1 AND j.selecao_casa_id IS NOT NULL
      ORDER BY j.data DESC LIMIT 5
    `, [userId]);

    // Verifica se usuário já salvou palpites extras
    const extrasRow = await get("SELECT COUNT(*) AS total FROM palpites_extras WHERE usuario_id = ?", [userId]);
    const temExtrasSalvos = (extrasRow?.total || 0) > 0;
    const dataLimiteRow = await get("SELECT valor FROM config WHERE chave = 'extras_data_limite'");
    let extrasDataLimite = null;
    if (dataLimiteRow) {
      const d = new Date(dataLimiteRow.valor);
      if (!isNaN(d.getTime())) extrasDataLimite = d;
    }
    const extrasPrazoPassou = extrasDataLimite ? new Date() >= extrasDataLimite : true;
    const alertaExtras = !temExtrasSalvos && !extrasPrazoPassou;

    // Processa próximo jogo para alerta
    let nextGame = null;
    if (proximosAbertos.length > 0) {
      const j = proximosAbertos[0];
      const agora = new Date();
      const dataJogo = new Date(j.data);
      const palpiteLimite = j.palpite_limite ? new Date(j.palpite_limite) : null;
      const margem = palpiteLimite || new Date(dataJogo.getTime() - PALPITE_MARGEM_MS);
      const diffMs = dataJogo.getTime() - agora.getTime();
      const diffMin = Math.round(diffMs / 60000);
      const jahFechou = agora >= margem;
      const temPalpite = j.palpite_gols_casa !== null;

      // Formata hora BRT
      const horaBRT = dataJogo.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });

      nextGame = {
        ...j,
        diffMin,
        jahFechou,
        temPalpite,
        horaBRT
      };
    }

    const pontuacaoFases = await all('SELECT * FROM fase_pontuacao ORDER BY CASE fase WHEN \'grupo\' THEN 1 WHEN \'r32\' THEN 2 WHEN \'r16\' THEN 3 WHEN \'qf\' THEN 4 WHEN \'sf\' THEN 5 WHEN \'terceiro\' THEN 6 WHEN \'final\' THEN 7 END');
    const faseLabel = { grupo: 'Fase de Grupos', r32: '16 avos de Final', r16: 'Oitavas de Final', qf: 'Quartas de Final', sf: 'Semifinal', terceiro: 'Disputa de 3º lugar', final: 'Final' };

    // Premiação (R$ 1º/2º/3º lugar) — lida da tabela config (editável em /admin/premios)
    const premiosRows = await all("SELECT chave, valor FROM config WHERE chave LIKE 'premio_%'");
    const premios = { premio_1: '300.00', premio_2: '125.00', premio_3: '75.00' };
    for (const r of premiosRows) premios[r.chave] = r.valor;

    res.render('dashboard', {
      title: 'Painel',
      proximosJogos: proximosAbertos,
      nextGame,
      pendentes: pendentesArr[0]?.total || 0,
      top5,
      stats: stats || { total_palpites: 0, total_pontos: 0, palpites_certos: 0, placares_exatos: 0 },
      bonusPontos: bonusRow?.total || 0,
      extrasPontos: extrasRowPts?.total || 0,
      totalFinalizados: totalFinalizados?.total || 0,
      aproveitamento,
      recentes,
      alertaExtras,
      extrasDataLimite,
      pontuacaoFases,
      faseLabel,
      premios
    });
  } catch (err) {
    logger.error('Erro no dashboard:', err);
    req.flash('erro', 'Erro ao carregar painel.');
    res.redirect('/palpites');
  }
});

module.exports = router;
