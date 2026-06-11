const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const userId = req.session.usuario.id;

    // Estatísticas gerais
    const stats = await get(`
      SELECT
        COUNT(p.id) AS total_palpites,
        COALESCE(SUM(p.pontos_obtidos), 0) AS total_pontos,
        COALESCE(SUM(CASE WHEN p.pontos_obtidos > 0 THEN 1 ELSE 0 END), 0) AS palpites_certos,
        COALESCE(SUM(CASE WHEN p.pontos_obtidos = 20 THEN 1 ELSE 0 END), 0) AS placares_exatos,
        COALESCE(SUM(CASE WHEN p.pontos_obtidos = 14 THEN 1 ELSE 0 END), 0) AS resultados_exatos,
        COALESCE(SUM(CASE WHEN p.pontos_obtidos = 6 THEN 1 ELSE 0 END), 0) AS so_resultados,
        COALESCE(SUM(CASE WHEN p.pontos_obtidos = 4 THEN 1 ELSE 0 END), 0) AS acertou_um_gol,
        COALESCE(SUM(CASE WHEN p.pontos_obtidos = 0 THEN 1 ELSE 0 END), 0) AS errou_tudo
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE p.usuario_id = ? AND j.finalizado = 1
    `, [userId]);

    const totalFinalizados = await get(`
      SELECT COUNT(*) AS total FROM jogos WHERE fase = 'grupo' AND finalizado = 1
    `);
    const tf = totalFinalizados?.total || 1;

    // Pontos por rodada
    const porRodada = await all(`
      SELECT j.rodada, COALESCE(SUM(p.pontos_obtidos), 0) AS pontos
      FROM jogos j
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.fase = 'grupo'
      GROUP BY j.rodada
      ORDER BY j.rodada
    `, [userId]);

    // Jogos finalizados com resultados reais e palpites do usuário
    const jogosFinalizados = await all(`
      SELECT j.id, j.rodada, j.data, j.gols_casa, j.gols_visitante,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.fase = 'grupo' AND j.finalizado = 1
      ORDER BY j.rodada, j.data
    `, [userId]);

    // Lista de participantes para racha
    const participantes = await all(`
      SELECT id, nome FROM usuarios WHERE is_admin = 0 AND id != ? ORDER BY nome
    `, [userId]);

    // Racha com um participante específico (query param ?com=id)
    let racha = null;
    const rachaId = parseInt(req.query.com, 10);
    if (rachaId && !isNaN(rachaId)) {
      const rachaUser = await get('SELECT id, nome FROM usuarios WHERE id = ?', [rachaId]);
      if (rachaUser) {
        const palpitesEu = await all(`
          SELECT p.jogo_id, p.pontos_obtidos, j.rodada
          FROM palpites p
          JOIN jogos j ON j.id = p.jogo_id
          WHERE p.usuario_id = ? AND j.finalizado = 1
          ORDER BY j.rodada, p.jogo_id
        `, [userId]);

        const palpitesEle = await all(`
          SELECT p.jogo_id, p.pontos_obtidos, j.rodada
          FROM palpites p
          JOIN jogos j ON j.id = p.jogo_id
          WHERE p.usuario_id = ? AND j.finalizado = 1
          ORDER BY j.rodada, p.jogo_id
        `, [rachaId]);

        // Total de pontos
        const pontosEu = palpitesEu.reduce((s, p) => s + (p.pontos_obtidos || 0), 0);
        const pontosEle = palpitesEle.reduce((s, p) => s + (p.pontos_obtidos || 0), 0);

        // Comparação jogo a jogo
        const mapaEle = {};
        for (const p of palpitesEle) mapaEle[p.jogo_id] = p.pontos_obtidos || 0;

        let vitorias = 0, empates = 0, derrotas = 0;
        for (const p of palpitesEu) {
          const pEle = mapaEle[p.jogo_id] ?? -1;
          const pEu = p.pontos_obtidos || 0;
          if (pEu > pEle) vitorias++;
          else if (pEu === pEle) empates++;
          else derrotas++;
        }

        racha = {
          usuario: rachaUser,
          pontosEu,
          pontosEle,
          vitorias,
          empates,
          derrotas
        };
      }
    }

    res.render('resumo', {
      title: 'Meu resumo',
      stats,
      totalFinalizados: tf,
      aproveitamento: Math.round(stats.palpites_certos / tf * 100),
      porRodada,
      jogosFinalizados,
      participantes,
      racha,
      rachaId: req.query.com || ''
    });
  } catch (err) {
    console.error('Erro no resumo:', err);
    req.flash('erro', 'Erro ao carregar resumo.');
    res.redirect('/');
  }
});

module.exports = router;
