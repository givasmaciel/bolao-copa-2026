const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');
const { PALPITE_MARGEM_MS } = require('../services/palpite-config');

const router = express.Router();

const FASE_GROUPS = {
  grupo: { label: 'Fase de Grupos', order: 1 },
  r32: { label: '16 avos de Final', order: 2 },
  r16: { label: 'Oitavas de Final', order: 3 },
  qf: { label: 'Quartas de Final', order: 4 },
  sf: { label: 'Semifinais', order: 5 },
  terceiro: { label: 'Disputa de 3º lugar', order: 6 },
  final: { label: 'Final', order: 7 }
};

function groupKey(jogo) {
  if (jogo.fase === 'grupo') {
    return {
      key: 'grupo-r' + jogo.rodada,
      label: 'Fase de Grupos - Rodada ' + jogo.rodada,
      order: jogo.rodada
    };
  }
  const fg = FASE_GROUPS[jogo.fase] || { label: jogo.fase, order: 99 };
  return { key: jogo.fase, label: fg.label, order: fg.order };
}

// POST /palpites/salvar-rodada - salva todos os palpites de uma rodada/fase
router.post('/salvar-rodada', verificarAutenticado, async (req, res) => {
  const usuarioId = req.session.usuario.id;

  const { fase, rodada, jogos } = req.body;
  if (!jogos) {
    return res.status(400).json({ ok: false, erro: 'Dados inválidos.' });
  }

  const jogoIds = Object.keys(jogos).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  if (jogoIds.length === 0) {
    return res.status(400).json({ ok: false, erro: 'Nenhum jogo válido.' });
  }

  const places = jogoIds.map(() => '?').join(',');
  let sql = 'SELECT id, data, finalizado, palpite_limite, fase, selecao_casa_id, selecao_visitante_id FROM jogos WHERE id IN (' + places + ')';
  const params = [...jogoIds];
  if (fase) { sql += ' AND fase = ?'; params.push(fase); }
  if (rodada) { sql += ' AND rodada = ?'; params.push(rodada); }
  const jogosDB = await all(sql, params);

  const jogosValidos = jogosDB.filter(j => {
    const agora = new Date();
    const dataJogo = new Date(j.data);
    const limite = j.palpite_limite ? new Date(j.palpite_limite) : null;
    const margem = limite || new Date(dataJogo.getTime() - PALPITE_MARGEM_MS);
    return !(agora >= margem || j.finalizado === 1);
  });

  if (jogosValidos.length === 0) {
    req.flash('aviso', 'Nenhum jogo aberto para salvar.');
    return res.json({ ok: true });
  }

  const idsValidos = jogosValidos.map(j => j.id);
  const existentes = await all(
    `SELECT jogo_id, id FROM palpites WHERE usuario_id = ? AND jogo_id IN (${idsValidos.map(() => '?').join(',')})`,
    [usuarioId, ...idsValidos]
  );
  const existeMap = {};
  for (const e of existentes) existeMap[e.jogo_id] = e.id;

  let salvos = 0;
  for (const jogo of jogosValidos) {
    const placar = jogos[String(jogo.id)];
    const casa = parseInt(placar.casa, 10);
    const visitante = parseInt(placar.visitante, 10);
    if (isNaN(casa) || isNaN(visitante) || casa < 0 || casa > 99 || visitante < 0 || visitante > 99) continue;

    // Mata-mata: valida palpite_classificado_id (deve ser um dos dois times)
    let palpiteClassificadoId = null;
    if (jogo.fase !== 'grupo' && placar.classificado_id !== undefined && placar.classificado_id !== '' && placar.classificado_id !== null) {
      const cid = parseInt(placar.classificado_id, 10);
      if (cid === jogo.selecao_casa_id || cid === jogo.selecao_visitante_id) {
        palpiteClassificadoId = cid;
      }
    }

    if (existeMap[jogo.id]) {
      await run(
        'UPDATE palpites SET palpite_gols_casa = ?, palpite_gols_visitante = ?, palpite_classificado_id = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?',
        [casa, visitante, palpiteClassificadoId, existeMap[jogo.id]]
      );
    } else {
      await run(
        'INSERT INTO palpites (usuario_id, jogo_id, palpite_gols_casa, palpite_gols_visitante, palpite_classificado_id) VALUES (?, ?, ?, ?, ?)',
        [usuarioId, jogo.id, casa, visitante, palpiteClassificadoId]
      );
    }
    salvos++;
  }

  req.flash('sucesso', salvos + ' palpites salvos!');
  res.json({ ok: true });
});

// GET /palpites - mostra todos os jogos para o usuário dar palpites
router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const jogos = await all(`
      SELECT
        j.id, j.fase, j.rodada, j.data, j.estadio, j.cidade, j.pais,
        j.finalizado, j.gols_casa, j.gols_visitante, j.palpite_limite, j.descricao,
        j.gols_casa_pror, j.gols_visitante_pror,
        j.placar_penaltis_casa, j.placar_penaltis_visitante,
        j.selecao_casa_id, j.selecao_visitante_id, j.classificado_id,
        g.letra AS grupo_letra,
        sc.nome AS casa_nome, sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome AS visitante_nome, sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.palpite_classificado_id, p.pontos_obtidos,
        cc.nome_pt AS classificado_pt,
        (SELECT COUNT(*) FROM palpites WHERE jogo_id = j.id) AS total_bets
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      LEFT JOIN selecoes cc ON j.classificado_id = cc.id
      ORDER BY j.data, j.id
    `, [req.session.usuario.id]);

    // Separa em abertos, fechados e finalizados
    const agora = new Date();
    const abertos = {};
    const fechados = {};
    const finalizados = {};
    let totalTodos = 0;

    for (const jogo of jogos) {
      // Pula jogos sem time definido (mata-mata ainda não gerado)
      if (!jogo.casa_pt || !jogo.visitante_pt) continue;
      totalTodos++;

      const gk = groupKey(jogo);
      if (jogo.finalizado === 1) {
        if (!finalizados[gk.key]) finalizados[gk.key] = { label: gk.label, order: gk.order, jogos: [] };
        finalizados[gk.key].jogos.push(jogo);
        continue;
      }
      const dataJogo = new Date(jogo.data);
      const limite = jogo.palpite_limite ? new Date(jogo.palpite_limite) : null;
      const margem = limite || new Date(dataJogo.getTime() - PALPITE_MARGEM_MS);
      if (agora >= margem) {
        if (!fechados[gk.key]) fechados[gk.key] = { label: gk.label, order: gk.order, jogos: [] };
        fechados[gk.key].jogos.push(jogo);
      } else {
        if (!abertos[gk.key]) abertos[gk.key] = { label: gk.label, order: gk.order, jogos: [] };
        abertos[gk.key].jogos.push(jogo);
      }
    }

    // Ordena grupos
    function sortEntries(dict) {
      return Object.keys(dict).sort(function(a, b) {
        return dict[a].order - dict[b].order;
      }).map(function(k) { return dict[k]; });
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
      abertos: sortEntries(abertos),
      fechados: sortEntries(fechados),
      finalizados: sortEntries(finalizados),
      stats: stats || { total_palpites: 0, total_pontos: 0 },
      totalJogos: totalTodos,
      faseGroups: FASE_GROUPS
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
    // Verifica se o jogo existe e ainda não começou
    const jogo = await get(
      "SELECT id, data, finalizado, palpite_limite, fase, selecao_casa_id, selecao_visitante_id FROM jogos WHERE id = ?",
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
    const margem = limite || new Date(dataJogo.getTime() - PALPITE_MARGEM_MS);
    if (agora >= margem || jogo.finalizado === 1) {
      req.flash('erro', 'Este jogo já fechou para palpites.');
      return res.redirect('/palpites');
    }

    // Mata-mata: valida palpite_classificado_id (deve ser um dos dois times)
    let palpiteClassificadoId = null;
    if (jogo.fase !== 'grupo') {
      const raw = req.body.palpite_classificado_id;
      if (raw !== undefined && raw !== '' && raw !== null) {
        const cid = parseInt(raw, 10);
        if (cid !== jogo.selecao_casa_id && cid !== jogo.selecao_visitante_id) {
          req.flash('erro', 'Quem classifica deve ser um dos dois times.');
          return res.redirect('/palpites');
        }
        palpiteClassificadoId = cid;
      }
    }

    // Faz upsert
    const existe = await get(
      'SELECT id FROM palpites WHERE usuario_id = ? AND jogo_id = ?',
      [usuarioId, jogoId]
    );

    if (existe) {
      await run(
        `UPDATE palpites
         SET palpite_gols_casa = ?, palpite_gols_visitante = ?, palpite_classificado_id = ?, atualizado_em = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [casa, visitante, palpiteClassificadoId, existe.id]
      );
    } else {
      await run(
        `INSERT INTO palpites (usuario_id, jogo_id, palpite_gols_casa, palpite_gols_visitante, palpite_classificado_id)
         VALUES (?, ?, ?, ?, ?)`,
        [usuarioId, jogoId, casa, visitante, palpiteClassificadoId]
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
        j.gols_casa_pror, j.gols_visitante_pror,
        j.placar_penaltis_casa, j.placar_penaltis_visitante,
        j.estadio, j.cidade, j.fase, j.rodada,
        j.selecao_casa_id, j.selecao_visitante_id, j.classificado_id,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        cc.nome_pt AS classificado_pt
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN selecoes cc ON j.classificado_id = cc.id
      WHERE j.id = ?
    `, [jogoId]);
    if (!jogo) { req.flash('erro', 'Jogo não encontrado.'); return res.redirect('/palpites'); }

    // Verifica se o jogo está travado ou finalizado
    const agora = new Date();
    const dataJogo = new Date(jogo.data);
    const limite = jogo.palpite_limite ? new Date(jogo.palpite_limite) : null;
    const margem = limite || new Date(dataJogo.getTime() - PALPITE_MARGEM_MS);
    if (agora < margem && !jogo.finalizado) {
      req.flash('erro', 'Este jogo ainda está aberto para palpites.');
      return res.redirect('/palpites');
    }

    const palpites = await all(`
      SELECT u.nome, p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos
      FROM palpites p
      JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.jogo_id = ?
      ORDER BY p.pontos_obtidos DESC, u.nome ASC
    `, [jogoId]);

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

// GET /palpites/knockout - redireciona para página principal (unificada)
router.get('/knockout', verificarAutenticado, async (req, res) => {
  res.redirect('/palpites');
});

module.exports = router;
