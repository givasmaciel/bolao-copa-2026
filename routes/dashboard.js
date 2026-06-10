const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const userId = req.session.usuario.id;

    // Próximos 5 jogos ainda não iniciados
    const agora = new Date().toISOString();
    const proximosJogos = await all(`
      SELECT j.id, j.data, j.estadio, j.cidade,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.fase = 'grupo' AND j.finalizado = 0
      ORDER BY j.data ASC
      LIMIT 5
    `, [userId]);

    // Jogos sem palpite do usuário (pendentes)
    const pendentes = await all(`
      SELECT COUNT(*) AS total
      FROM jogos j
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.fase = 'grupo' AND j.finalizado = 0 AND p.id IS NULL
    `, [userId]);

    // Top 5 do ranking
    const top5 = await all(`
      SELECT
        u.id, u.nome,
        COALESCE(SUM(p.pontos_obtidos), 0) + COALESCE((
          SELECT SUM(r.pontos)
          FROM palpites_extras pe
          JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
          WHERE pe.usuario_id = u.id
        ), 0) AS total_pontos
      FROM usuarios u
      LEFT JOIN palpites p ON p.usuario_id = u.id
      WHERE u.is_admin = 0
      GROUP BY u.id
      ORDER BY total_pontos DESC
      LIMIT 5
    `);

    // Estatísticas do usuário
    const stats = await get(`
      SELECT
        COUNT(p.id) AS total_palpites,
        COALESCE(SUM(p.pontos_obtidos), 0) AS total_pontos,
        SUM(CASE WHEN p.pontos_obtidos > 0 THEN 1 ELSE 0 END) AS palpites_certos,
        SUM(CASE WHEN p.pontos_obtidos = 10 THEN 1 ELSE 0 END) AS placares_exatos
      FROM palpites p
      WHERE p.usuario_id = ?
    `, [userId]);

    const totalFinalizados = await get(`
      SELECT COUNT(*) AS total FROM jogos WHERE fase = 'grupo' AND finalizado = 1
    `);

    res.render('dashboard', {
      title: 'Painel',
      proximosJogos,
      pendentes: pendentes?.total || 0,
      top5,
      stats: stats || { total_palpites: 0, total_pontos: 0, palpites_certos: 0, placares_exatos: 0 },
      totalFinalizados: totalFinalizados?.total || 0,
      agora
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    req.flash('erro', 'Erro ao carregar painel.');
    res.redirect('/');
  }
});

module.exports = router;
