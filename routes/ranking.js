const express = require('express');
const { all, get } = require('../database/db');
const { CATEGORIAS } = require('./extras');

const router = express.Router();

// GET /ranking - mostra o ranking geral
router.get('/', async (req, res) => {
  try {
    const ranking = await all(`
      SELECT
        u.id,
        u.nome,
        u.criado_em,
        COUNT(p.id) AS total_palpites,
        COALESCE(SUM(p.pontos_obtidos), 0) + COALESCE((
          SELECT SUM(r.pontos)
          FROM palpites_extras pe
          JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
          WHERE pe.usuario_id = u.id
        ), 0) AS total_pontos,
        COALESCE(SUM(p.pontos_obtidos), 0) AS palpites_pontos,
        COALESCE((
          SELECT SUM(r.pontos)
          FROM palpites_extras pe
          JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
          WHERE pe.usuario_id = u.id
        ), 0) AS extras_pontos,
        SUM(CASE WHEN p.pontos_obtidos > 0 THEN 1 ELSE 0 END) AS palpites_com_pontos,
        COALESCE(MAX(p.pontos_obtidos), 0) AS maior_palpite
      FROM usuarios u
      LEFT JOIN palpites p ON p.usuario_id = u.id
      WHERE u.is_admin = 0
      GROUP BY u.id
      ORDER BY total_pontos DESC, palpites_com_pontos DESC, u.nome ASC
    `);

    // Adiciona posição
    let posicao = 0;
    let pontosAnterior = null;
    let qtd = 0;
    ranking.forEach((u, idx) => {
      qtd++;
      if (u.total_pontos !== pontosAnterior) {
        posicao = qtd;
        pontosAnterior = u.total_pontos;
      }
      u.posicao = posicao;
    });

    // Calcula totais
    const totais = await get(`
      SELECT
        (SELECT COUNT(*) FROM usuarios WHERE is_admin = 0) AS total_usuarios,
        (SELECT COUNT(*) FROM jogos WHERE fase = 'grupo') AS total_jogos,
        (SELECT COUNT(*) FROM jogos WHERE fase = 'grupo' AND finalizado = 1) AS jogos_finalizados,
        (SELECT COUNT(*) FROM palpites) AS total_palpites
    `);

    // Busca pontos por rodada para cada usuário
    const pontosPorRodada = await all(`
      SELECT p.usuario_id, j.rodada, SUM(p.pontos_obtidos) AS pontos
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      JOIN usuarios u ON u.id = p.usuario_id
      WHERE u.is_admin = 0
      GROUP BY p.usuario_id, j.rodada
      ORDER BY p.usuario_id, j.rodada
    `);

    // Converte em mapa: usuario_id -> { rodada: pontos }
    const rodadaMap = {};
    pontosPorRodada.forEach(r => {
      if (!rodadaMap[r.usuario_id]) rodadaMap[r.usuario_id] = {};
      rodadaMap[r.usuario_id][r.rodada] = r.pontos;
    });

    // Busca rodadas dinâmicas do banco (em vez de array fixo)
    const fasesRodada = await all(
      'SELECT DISTINCT rodada, fase FROM jogos WHERE fase IS NOT NULL ORDER BY rodada'
    );
    const rodadas = fasesRodada.map(f => f.rodada);
    const faseLabel = { grupo: r => 'R' + r, r32: '32av', r16: '16av', qf: 'QF', sf: 'SF', terceiro: '3º', final: 'Final' };
    const labels = {};
    fasesRodada.forEach(f => {
      const gen = faseLabel[f.fase];
      labels[f.rodada] = typeof gen === 'function' ? gen(f.rodada) : gen;
    });

    res.render('ranking', { title: 'Ranking do Bolão', ranking, totais, rodadaMap, rodadas, labels });
  } catch (err) {
    console.error('Erro ao listar ranking:', err);
    req.flash('erro', 'Erro ao carregar ranking.');
    res.redirect('/');
  }
});

// GET /ranking/usuario/:id - mostra os palpites de um usuário específico
router.get('/usuario/:id', async (req, res) => {
  const usuarioId = parseInt(req.params.id, 10);
  if (isNaN(usuarioId)) return res.redirect('/ranking');

  try {
    const usuario = await get('SELECT id, nome, criado_em FROM usuarios WHERE id = ?', [usuarioId]);
    if (!usuario) {
      req.flash('erro', 'Usuário não encontrado.');
      return res.redirect('/ranking');
    }

    const palpites = await all(`
      SELECT
        j.id, j.rodada, j.data, j.finalizado, j.gols_casa, j.gols_visitante,
        j.palpite_limite,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      WHERE p.usuario_id = ?
      ORDER BY j.rodada, j.id
    `, [usuarioId]);

    const stats = await get(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(pontos_obtidos), 0) AS pontos,
        SUM(CASE WHEN pontos_obtidos > 0 THEN 1 ELSE 0 END) AS acertos
      FROM palpites WHERE usuario_id = ?
    `, [usuarioId]);

    // Busca palpites extras (só passa pro view se tiver)
    const extras = await all(
      'SELECT pe.categoria, pe.selecao_id, s.nome_pt FROM palpites_extras pe LEFT JOIN selecoes s ON s.id = pe.selecao_id WHERE pe.usuario_id = ? ORDER BY pe.categoria',
      [usuarioId]
    );

    const extrasDeadline = await get("SELECT valor FROM config WHERE chave = 'extras_data_limite'");
    const extrasPrazo = extrasDeadline ? new Date(extrasDeadline.valor) : new Date('2026-06-11T15:55-03:00');
    const extrasLiberado = new Date() >= extrasPrazo;

    res.render('palpites-usuario', {
      title: `Palpites de ${usuario.nome}`,
      usuario, palpites, stats,
      agora: new Date(),
      extras, extrasLiberado, extrasPrazo,
      CATEGORIAS
    });
  } catch (err) {
    console.error('Erro ao listar palpites do usuário:', err);
    req.flash('erro', 'Erro ao carregar palpites.');
    res.redirect('/ranking');
  }
});

module.exports = router;
