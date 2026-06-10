const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

router.get('/', verificarAutenticado, async (req, res) => {
  try {
    if (req.session.usuario.is_admin) {
      req.flash('erro', 'Administradores não podem participar do bolão.');
      return res.redirect('/admin');
    }
    const jogos = await all(`
      SELECT
        j.id, j.data, j.estadio, j.cidade, j.pais,
        j.finalizado, j.gols_casa, j.gols_visitante,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.tipo = 'teste'
      ORDER BY j.id
    `, [req.session.usuario.id]);

    const stats = await get(`
      SELECT
        COUNT(p.id) AS total_palpites,
        COALESCE(SUM(p.pontos_obtidos), 0) AS total_pontos
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE p.usuario_id = ? AND j.tipo = 'teste'
    `, [req.session.usuario.id]);

    res.render('teste', {
      title: 'Jogos-teste',
      jogos,
      stats: stats || { total_palpites: 0, total_pontos: 0 }
    });
  } catch (err) {
    console.error('Erro ao carregar teste:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/');
  }
});

router.post('/', verificarAutenticado, async (req, res) => {
  const usuarioId = req.session.usuario.id;
  if (req.session.usuario.is_admin) {
    req.flash('erro', 'Administradores não podem participar do bolão.');
    return res.redirect('/admin');
  }
  let palpites = [];
  if (req.body.palpites_json) {
    try {
      palpites = JSON.parse(req.body.palpites_json);
      if (!Array.isArray(palpites)) palpites = [];
    } catch (e) {
      palpites = [];
    }
  }

  let salvos = 0;
  let ignorados = 0;

  try {
    for (const palpite of palpites) {
      if (!palpite || palpite.jogoId === undefined || palpite.casa === undefined || palpite.visitante === undefined) {
        ignorados++;
        continue;
      }

      const jogoId = parseInt(palpite.jogoId, 10);
      const casa = parseInt(palpite.casa, 10);
      const visitante = parseInt(palpite.visitante, 10);

      if (isNaN(jogoId) || isNaN(casa) || isNaN(visitante)) {
        ignorados++;
        continue;
      }
      if (casa < 0 || casa > 99 || visitante < 0 || visitante > 99) {
        ignorados++;
        continue;
      }

      const jogo = await get(
        "SELECT id, data, finalizado FROM jogos WHERE id = ? AND tipo = 'teste'",
        [jogoId]
      );
      if (!jogo) {
        ignorados++;
        continue;
      }

      const agora = new Date();
      const dataJogo = new Date(jogo.data);
      const margem = new Date(dataJogo.getTime() - 2 * 60 * 1000);
      if (agora >= margem || jogo.finalizado === 1) {
        ignorados++;
        continue;
      }

      const existe = await get(
        'SELECT id FROM palpites WHERE usuario_id = ? AND jogo_id = ?',
        [usuarioId, jogoId]
      );

      if (existe) {
        await run(
          `UPDATE palpites
           SET palpite_gols_casa = ?, palpite_gols_visitante = ?, atualizado_em = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [casa, visitante, existe.id]
        );
      } else {
        await run(
          'INSERT INTO palpites (usuario_id, jogo_id, palpite_gols_casa, palpite_gols_visitante) VALUES (?, ?, ?, ?)',
          [usuarioId, jogoId, casa, visitante]
        );
      }
      salvos++;
    }

    if (salvos > 0) req.flash('sucesso', `${salvos} palpite(s) salvos!`);
    if (ignorados > 0) req.flash('aviso', `${ignorados} ignorados (já fechados).`);
    if (salvos === 0 && ignorados === 0) req.flash('aviso', 'Nenhum palpite enviado.');
    res.redirect('/teste');
  } catch (err) {
    console.error('Erro ao salvar:', err);
    req.flash('erro', 'Erro ao salvar.');
    res.redirect('/teste');
  }
});

module.exports = router;
