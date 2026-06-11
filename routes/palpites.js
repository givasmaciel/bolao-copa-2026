const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

// POST /palpites/salvar-rodada - salva todos os palpites de uma rodada (deve vir antes de /:jogoId)
router.post('/salvar-rodada', verificarAutenticado, async (req, res) => {
  const usuarioId = req.session.usuario.id;
  if (req.session.usuario.is_admin) {
    req.flash('erro', 'Administradores não podem participar do bolão.');
    return res.redirect('/admin');
  }

  const { rodada, jogos } = req.body;
  if (!rodada || !jogos) {
    req.flash('erro', 'Dados inválidos.');
    return res.redirect('/palpites');
  }

  let salvos = 0;
  for (const [jogoIdStr, placar] of Object.entries(jogos)) {
    const jogoId = parseInt(jogoIdStr, 10);
    const casa = parseInt(placar.casa, 10);
    const visitante = parseInt(placar.visitante, 10);
    if (isNaN(jogoId) || isNaN(casa) || isNaN(visitante)) continue;
    if (casa < 0 || casa > 99 || visitante < 0 || visitante > 99) continue;

    const jogo = await get(
      "SELECT id, data, finalizado, palpite_limite FROM jogos WHERE id = ? AND fase = 'grupo' AND rodada = ?",
      [jogoId, rodada]
    );
    if (!jogo) continue;

    const agora = new Date();
    const dataJogo = new Date(jogo.data);
    const limite = jogo.palpite_limite ? new Date(jogo.palpite_limite) : null;
    const margem = limite || new Date(dataJogo.getTime() - 2 * 60 * 1000);
    if (agora >= margem || jogo.finalizado === 1) continue;

    const existe = await get('SELECT id FROM palpites WHERE usuario_id = ? AND jogo_id = ?', [usuarioId, jogoId]);
    if (existe) {
      await run(
        'UPDATE palpites SET palpite_gols_casa = ?, palpite_gols_visitante = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
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

  req.flash('sucesso', salvos + ' palpites salvos na rodada ' + rodada + '!');
  res.redirect('/palpites');
});

// GET /palpites - mostra todos os jogos (fase de grupos) para o usuário dar palpites
router.get('/', verificarAutenticado, async (req, res) => {
  try {
    if (req.session.usuario.is_admin) {
      req.flash('erro', 'Administradores não podem participar do bolão.');
      return res.redirect('/admin');
    }
    const jogos = await all(`
      SELECT
        j.id, j.fase, j.rodada, j.data, j.estadio, j.cidade, j.pais,
        j.finalizado, j.gols_casa, j.gols_visitante, j.palpite_limite,
        g.letra AS grupo_letra,
        sc.nome AS casa_nome, sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome AS visitante_nome, sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos,
        (SELECT COUNT(*) FROM palpites WHERE jogo_id = j.id) AS total_bets
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.fase = 'grupo'
      ORDER BY j.rodada, j.id
    `, [req.session.usuario.id]);

    // Agrupa por rodada
    const porRodada = {};
    for (const jogo of jogos) {
      const r = jogo.rodada;
      if (!porRodada[r]) porRodada[r] = [];
      porRodada[r].push(jogo);
    }

    // Estatísticas do usuário
    const stats = await get(`
      SELECT
        COUNT(p.id) AS total_palpites,
        COALESCE(SUM(p.pontos_obtidos), 0) AS total_pontos
      FROM palpites p
      WHERE p.usuario_id = ?
    `, [req.session.usuario.id]);

    res.render('palpites', {
      title: 'Meus palpites',
      rodadas: porRodada,
      stats: stats || { total_palpites: 0, total_pontos: 0 }
    });
  } catch (err) {
    console.error('Erro ao listar palpites:', err);
    req.flash('erro', 'Erro ao carregar jogos.');
    res.redirect('/');
  }
});

// POST /palpites/:jogoId - salva o palpite de um jogo específico
router.post('/:jogoId', verificarAutenticado, async (req, res) => {
  const usuarioId = req.session.usuario.id;
  if (req.session.usuario.is_admin) {
    req.flash('erro', 'Administradores não podem participar do bolão.');
    return res.redirect('/admin');
  }

  const jogoId = parseInt(req.params.jogoId, 10);
  const casa = parseInt(req.body.casa, 10);
  const visitante = parseInt(req.body.visitante, 10);

  if (isNaN(jogoId) || isNaN(casa) || isNaN(visitante)) {
    req.flash('erro', 'Palpite inválido.');
    return res.redirect('/palpites');
  }

  if (casa < 0 || casa > 99 || visitante < 0 || visitante > 99) {
    req.flash('erro', 'Placar inválido. Use valores entre 0 e 99.');
    return res.redirect('/palpites');
  }

  try {
    // Verifica se o jogo existe, está na fase de grupos e ainda não começou
    const jogo = await get(
      "SELECT id, data, finalizado, palpite_limite FROM jogos WHERE id = ? AND fase = 'grupo'",
      [jogoId]
    );
    if (!jogo) {
      req.flash('erro', 'Jogo não encontrado.');
      return res.redirect('/palpites');
    }

    // Verifica se o jogo já começou (fecha 2 min antes) ou já foi finalizado
    // Se palpite_limite foi definido pelo admin, usa esse prazo
    const agora = new Date();
    const dataJogo = new Date(jogo.data);
    const limite = jogo.palpite_limite ? new Date(jogo.palpite_limite) : null;
    const margem = limite || new Date(dataJogo.getTime() - 2 * 60 * 1000);
    if (agora >= margem || jogo.finalizado === 1) {
      req.flash('erro', 'Este jogo já fechou para palpites.');
      return res.redirect('/palpites');
    }

    // Faz upsert
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
        `INSERT INTO palpites (usuario_id, jogo_id, palpite_gols_casa, palpite_gols_visitante)
         VALUES (?, ?, ?, ?)`,
        [usuarioId, jogoId, casa, visitante]
      );
    }

    req.flash('sucesso', 'Palpite salvo com sucesso!');
    res.redirect('/palpites');
  } catch (err) {
    console.error('Erro ao salvar palpite:', err);
    req.flash('erro', 'Erro ao salvar palpite.');
    res.redirect('/palpites');
  }
});

// GET /palpites/jogo/:id - mostra todos os palpites de um jogo (só após travar)
router.get('/jogo/:id', verificarAutenticado, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  if (isNaN(jogoId)) return res.redirect('/palpites');

  try {
    const jogo = await get(`
      SELECT j.id, j.data, j.palpite_limite, j.finalizado, j.gols_casa, j.gols_visitante,
        j.estadio, j.cidade, j.fase, j.rodada,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      WHERE j.id = ?
    `, [jogoId]);
    if (!jogo) { req.flash('erro', 'Jogo não encontrado.'); return res.redirect('/palpites'); }

    // Verifica se o jogo está travado ou finalizado
    const agora = new Date();
    const dataJogo = new Date(jogo.data);
    const limite = jogo.palpite_limite ? new Date(jogo.palpite_limite) : null;
    const margem = limite || new Date(dataJogo.getTime() - 2 * 60 * 1000);
    if (agora < margem && !jogo.finalizado) {
      req.flash('erro', 'Este jogo ainda está aberto para palpites.');
      return res.redirect('/palpites');
    }

    const palpites = await all(`
      SELECT u.nome, p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos
      FROM palpites p
      JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.jogo_id = ? AND u.is_admin = 0
      ORDER BY p.pontos_obtidos DESC, u.nome ASC
    `, [jogoId]);

    // Palpites extras do usuário logado para este jogo
    const diffCasa = Math.abs(jogo.gols_casa - jogo.gols_visitante);
    const diffPalpite = palpites.map(p => Math.abs(p.palpite_gols_casa - p.palpite_gols_visitante));

    res.render('jogo-palpites', {
      title: `${jogo.casa_pt} × ${jogo.visitante_pt}`,
      jogo, palpites
    });
  } catch (err) {
    console.error('Erro ao carregar palpites do jogo:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/palpites');
  }
});

// GET /palpites/knockout - placeholder
router.get('/knockout', verificarAutenticado, async (req, res) => {
  if (req.session.usuario.is_admin) {
    req.flash('erro', 'Administradores não podem participar do bolão.');
    return res.redirect('/admin');
  }
  req.flash('aviso', 'Os palpites do mata-mata serão liberados após o fim da fase de grupos.');
  res.redirect('/palpites');
});

module.exports = router;
