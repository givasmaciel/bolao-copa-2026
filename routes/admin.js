const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAdmin } = require('../middleware/auth');

const router = express.Router();

// Sistema de pontuação
// - Placar exato: 10 pontos
// - Vencedor/empate + gols de um time: 5 pontos
// - Só resultado (V/E/D): 3 pontos
// - Erro: 0 pontos
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
  if (golsCasa > golsVisitante) resReal = 'C';
  else if (golsCasa < golsVisitante) resReal = 'V';
  else resReal = 'E';

  if (palpiteCasa > palpiteVisitante) resPalpite = 'C';
  else if (palpiteCasa < palpiteVisitante) resPalpite = 'V';
  else resPalpite = 'E';

  // Errou o resultado
  if (resReal !== resPalpite) return 0;

  // Acertou o resultado: verifica gols
  if (golsCasa === palpiteCasa || golsVisitante === palpiteVisitante) {
    return 5;
  }

  return 3;
}

// GET /admin - painel principal
router.get('/', verificarAdmin, async (req, res) => {
  try {
    const totais = await get(`
      SELECT
        (SELECT COUNT(*) FROM jogos) AS total_jogos,
        (SELECT COUNT(*) FROM jogos WHERE fase = 'grupo' AND finalizado = 1) AS jogos_finalizados,
        (SELECT COUNT(*) FROM jogos WHERE finalizado = 0 AND data < datetime('now')) AS jogos_pendentes,
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

module.exports = { router, calcularPontos };
