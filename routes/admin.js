const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAdmin } = require('../middleware/auth');

const router = express.Router();

// Sistema de pontuação
// - Placar exato: 10 pts
// - Empate (qualquer placar): 7 pts
// - Resultado certo + gols de 1 time: 7 pts (5 + 2)
// - Só resultado exceto empate (V/D): 3 pts
// - Errou resultado mas acertou gol de 1 time: 2 pts
// - Errou tudo: 0 pts
function calcularPontos(golsCasa, golsVisitante, palpiteCasa, palpiteVisitante) {
  if (golsCasa === null || golsVisitante === null ||
      golsCasa === undefined || golsVisitante === undefined) return 0;
  if (palpiteCasa === null || palpiteVisitante === null ||
      palpiteCasa === undefined || palpiteVisitante === undefined) return 0;

  // Placar exato
  if (golsCasa === palpiteCasa && golsVisitante === palpiteVisitante) {
    return 10;
  }

  // Determina resultado real e do palpite
  let resReal, resPalpite;
  if (golsCasa > golsVisitante) { resReal = 'C'; }
  else if (golsCasa < golsVisitante) { resReal = 'V'; }
  else { resReal = 'E'; }

  if (palpiteCasa > palpiteVisitante) { resPalpite = 'C'; }
  else if (palpiteCasa < palpiteVisitante) { resPalpite = 'V'; }
  else { resPalpite = 'E'; }

  // Empate (qualquer placar) vale 7 pts
  if (resReal === 'E' && resPalpite === 'E') return 7;

  const acertouGolCasa = golsCasa === palpiteCasa;
  const acertouGolVisitante = golsVisitante === palpiteVisitante;
  const acertouGolTime = acertouGolCasa || acertouGolVisitante;

  if (resReal === resPalpite) {
    if (acertouGolTime) return 7;
    return 3;
  }

  if (acertouGolTime) return 2;
  return 0;
}

// GET /admin - painel principal
router.get('/', verificarAdmin, async (req, res) => {
  try {
    const totais = await get(`
      SELECT
        (SELECT COUNT(*) FROM jogos) AS total_jogos,
        (SELECT COUNT(*) FROM jogos WHERE fase = 'grupo' AND finalizado = 1) AS jogos_finalizados,
        (SELECT COUNT(*) FROM jogos WHERE finalizado = 0 AND data < ${process.env.DATABASE_URL ? 'NOW()' : "datetime('now')"}) AS jogos_pendentes,
        (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
        (SELECT COUNT(*) FROM palpites) AS total_palpites
    `);

    const proximosJogos = await all(`
      SELECT j.id, j.data, j.finalizado, j.gols_casa, j.gols_visitante,
             sc.nome_pt AS casa_pt, sv.nome_pt AS visitante_pt
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      ORDER BY j.data DESC
      LIMIT 10
    `);

    res.render('admin', { title: 'Painel Admin', totais, proximosJogos });
  } catch (err) {
    console.error('Erro no admin:', err);
    req.flash('erro', 'Erro ao carregar painel.');
    res.redirect('/');
  }
});

// GET /admin/jogos - lista de jogos para editar resultados
router.get('/jogos', verificarAdmin, async (req, res) => {
  try {
    const jogos = await all(`
      SELECT j.id, j.fase, j.rodada, j.data, j.finalizado, j.gols_casa, j.gols_visitante,
             g.letra AS grupo_letra,
             sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla,
             sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      ORDER BY j.id
    `);

    res.render('admin-jogos', { title: 'Editar resultados', jogos });
  } catch (err) {
    console.error('Erro ao listar jogos admin:', err);
    req.flash('erro', 'Erro ao carregar jogos.');
    res.redirect('/admin');
  }
});

// POST /admin/jogos/:id - atualiza resultado de um jogo e recalcula pontos
router.post('/jogos/:id', verificarAdmin, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  const { gols_casa, gols_visitante, finalizado } = req.body;

  if (isNaN(jogoId)) return res.redirect('/admin/jogos');

  try {
    const jogo = await get('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    if (!jogo) {
      req.flash('erro', 'Jogo não encontrado.');
      return res.redirect('/admin/jogos');
    }

    const gc = gols_casa === '' || gols_casa === null ? null : parseInt(gols_casa, 10);
    const gv = gols_visitante === '' || gols_visitante === null ? null : parseInt(gols_visitante, 10);
    const fin = finalizado === '1' ? 1 : 0;

    if (fin === 1 && (gc === null || gv === null || isNaN(gc) || isNaN(gv))) {
      req.flash('erro', 'Para finalizar, informe o placar.');
      return res.redirect('/admin/jogos');
    }

    await run(
      'UPDATE jogos SET gols_casa = ?, gols_visitante = ?, finalizado = ? WHERE id = ?',
      [gc, gv, fin, jogoId]
    );

    // Recalcula pontos dos palpites desse jogo
    if (fin === 1 && gc !== null && gv !== null) {
      const palpites = await all(
        'SELECT id, palpite_gols_casa, palpite_gols_visitante FROM palpites WHERE jogo_id = ?',
        [jogoId]
      );
      for (const p of palpites) {
        const pontos = calcularPontos(gc, gv, p.palpite_gols_casa, p.palpite_gols_visitante);
        await run('UPDATE palpites SET pontos_obtidos = ? WHERE id = ?', [pontos, p.id]);
      }
    } else {
      // Se "desfinalizou" ou limpou placar, zera pontos desse jogo
      await run('UPDATE palpites SET pontos_obtidos = 0 WHERE jogo_id = ?', [jogoId]);
    }

    req.flash('sucesso', 'Resultado atualizado e pontos recalculados!');
    res.redirect('/admin/jogos');
  } catch (err) {
    console.error('Erro ao atualizar jogo:', err);
    req.flash('erro', 'Erro ao atualizar.');
    res.redirect('/admin/jogos');
  }
});

// POST /admin/recalcular - recalcula todos os pontos
router.post('/recalcular', verificarAdmin, async (req, res) => {
  try {
    const jogos = await all('SELECT id, gols_casa, gols_visitante FROM jogos WHERE finalizado = 1');
    let total = 0;
    for (const j of jogos) {
      const palpites = await all(
        'SELECT id, palpite_gols_casa, palpite_gols_visitante FROM palpites WHERE jogo_id = ?',
        [j.id]
      );
      for (const p of palpites) {
        const pontos = calcularPontos(j.gols_casa, j.gols_visitante, p.palpite_gols_casa, p.palpite_gols_visitante);
        await run('UPDATE palpites SET pontos_obtidos = ? WHERE id = ?', [pontos, p.id]);
        total++;
      }
    }
    req.flash('sucesso', `${total} palpites recalculados!`);
    res.redirect('/admin');
  } catch (err) {
    console.error('Erro ao recalcular:', err);
    req.flash('erro', 'Erro ao recalcular.');
    res.redirect('/admin');
  }
});

// GET /admin/usuarios - gerenciar participantes
router.get('/usuarios', verificarAdmin, async (req, res) => {
  try {
    const usuarios = await all(
      'SELECT id, nome, email, is_admin, criado_em FROM usuarios ORDER BY nome'
    );
    res.render('admin-usuarios', { title: 'Gerenciar participantes', usuarios });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/admin');
  }
});

// POST /admin/usuarios/:id/tornar-admin
router.post('/usuarios/:id/tornar-admin', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  try {
    await run('UPDATE usuarios SET is_admin = 1 WHERE id = ?', [id]);
    req.flash('sucesso', 'Usuário promovido a admin.');
  } catch (err) {
    req.flash('erro', 'Erro ao promover.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/rebaixar
router.post('/usuarios/:id/rebaixar', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  try {
    await run('UPDATE usuarios SET is_admin = 0 WHERE id = ?', [id]);
    req.flash('sucesso', 'Admin rebaixado a participante.');
  } catch (err) {
    req.flash('erro', 'Erro ao rebaixar.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/excluir
router.post('/usuarios/:id/excluir', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  try {
    await run('DELETE FROM palpites WHERE usuario_id = ?', [id]);
    await run('DELETE FROM palpites_extras WHERE usuario_id = ?', [id]);
    await run('DELETE FROM usuarios WHERE id = ?', [id]);
    req.flash('sucesso', 'Participante excluído.');
  } catch (err) {
    console.error('Erro ao excluir:', err);
    req.flash('erro', 'Erro ao excluir.');
  }
  res.redirect('/admin/usuarios');
});

module.exports = { router, calcularPontos };
