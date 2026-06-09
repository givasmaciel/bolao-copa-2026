const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado, verificarAdmin } = require('../middleware/auth');

const router = express.Router();
const adminRouter = express.Router();

const CATEGORIAS = [
  { id: 'campeao', nome: 'Campeão', pts: 50 },
  { id: 'vice', nome: 'Vice-campeão', pts: 50 },
  { id: 'terceiro', nome: 'Terceiro lugar', pts: 50 },
  { id: 'r32', nome: '1/16 avos de Final', pts: 10 },
  { id: 'oitavas', nome: 'Oitavas de Final', pts: 10 },
  { id: 'quartas', nome: 'Quartas de Final', pts: 15 },
  { id: 'semi', nome: 'Semifinal', pts: 20 },
  { id: 'finalista', nome: 'Finalista', pts: 30 }
];

const DATA_LIMITE = new Date('2026-06-11T11:00:00');

// GET /palpites-extras
router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const selecoes = await all('SELECT id, nome_pt, sigla FROM selecoes ORDER BY nome_pt');
    const palpites = await all(
      'SELECT categoria, selecao_id FROM palpites_extras WHERE usuario_id = ?',
      [req.session.usuario.id]
    );

    const mapaPalpites = {};
    for (const p of palpites) {
      mapaPalpites[p.categoria] = p.selecao_id;
    }

    const prazoPassou = new Date() >= DATA_LIMITE;

    res.render('palpites-extras', {
      title: 'Palpites Extras',
      categorias: CATEGORIAS,
      selecoes,
      palpites: mapaPalpites,
      prazoPassou,
      dataLimite: DATA_LIMITE
    });
  } catch (err) {
    console.error('Erro ao carregar palpites extras:', err);
    req.flash('erro', 'Erro ao carregar página.');
    res.redirect('/');
  }
});

// POST /palpites-extras
router.post('/', verificarAutenticado, async (req, res) => {
  if (new Date() >= DATA_LIMITE) {
    req.flash('erro', 'O prazo para palpites extras já encerrou.');
    return res.redirect('/palpites-extras');
  }

  const usuarioId = req.session.usuario.id;

  try {
    for (const cat of CATEGORIAS) {
      const selecaoId = req.body[cat.id];
      if (!selecaoId) continue;

      const existe = await get(
        'SELECT id FROM palpites_extras WHERE usuario_id = ? AND categoria = ?',
        [usuarioId, cat.id]
      );

      if (existe) {
        await run(
          'UPDATE palpites_extras SET selecao_id = ?, criado_em = CURRENT_TIMESTAMP WHERE id = ?',
          [parseInt(selecaoId, 10), existe.id]
        );
      } else {
        await run(
          'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
          [usuarioId, cat.id, parseInt(selecaoId, 10)]
        );
      }
    }

    req.flash('sucesso', 'Palpites extras salvos com sucesso!');
    res.redirect('/palpites-extras');
  } catch (err) {
    console.error('Erro ao salvar palpites extras:', err);
    req.flash('erro', 'Erro ao salvar.');
    res.redirect('/palpites-extras');
  }
});

// GET /admin/extras - admin define os resultados
adminRouter.get('/extras', verificarAdmin, async (req, res) => {
  try {
    const selecoes = await all('SELECT id, nome_pt, sigla FROM selecoes ORDER BY nome_pt');
    const resultados = await all('SELECT * FROM resultados_extras');
    const mapa = {};
    for (const r of resultados) mapa[r.categoria] = r;

    res.render('admin-extras', {
      title: 'Resultados Extras',
      categorias: CATEGORIAS,
      selecoes,
      resultados: mapa
    });
  } catch (err) {
    console.error('Erro:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/admin');
  }
});

// POST /admin/extras - salva resultados extras e recalcula pontos
adminRouter.post('/extras', verificarAdmin, async (req, res) => {
  try {
    for (const cat of CATEGORIAS) {
      const selecaoId = req.body[cat.id];
      if (!selecaoId) continue;

      await run(
        `INSERT INTO resultados_extras (categoria, selecao_id, pontos)
         VALUES (?, ?, ?)
         ON CONFLICT (categoria) DO UPDATE SET selecao_id = ?, pontos = ?, atualizado_em = CURRENT_TIMESTAMP`,
        [cat.id, parseInt(selecaoId, 10), cat.pts, parseInt(selecaoId, 10), cat.pts]
      );
    }

    req.flash('sucesso', 'Resultados extras salvos! Pontos serão computados no ranking.');
    res.redirect('/admin/extras');
  } catch (err) {
    console.error('Erro ao salvar resultados:', err);
    req.flash('erro', 'Erro ao salvar.');
    res.redirect('/admin/extras');
  }
});

module.exports = { router, adminRouter, CATEGORIAS };
