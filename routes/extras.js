const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado, verificarAdmin } = require('../middleware/auth');

const router = express.Router();
const adminRouter = express.Router();

const CATEGORIAS = [
  { id: 'campeao', nome: 'Campeão', pts: 50, max: 1 },
  { id: 'vice', nome: 'Vice-campeão', pts: 50, max: 1 },
  { id: 'terceiro', nome: 'Terceiro lugar', pts: 50, max: 1 },
  { id: 'r32', nome: '1/16 avos de Final', pts: 10, max: 32 },
  { id: 'oitavas', nome: 'Oitavas de Final', pts: 10, max: 16 },
  { id: 'quartas', nome: 'Quartas de Final', pts: 15, max: 8 },
  { id: 'semi', nome: 'Semifinal', pts: 20, max: 4 },
  { id: 'finalista', nome: 'Finalista', pts: 30, max: 2 }
];

const MULTI_CATS = new Set(['r32', 'oitavas', 'quartas', 'semi', 'finalista']);
const DATA_LIMITE = new Date('2026-06-11T11:00:00');

router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const selecoes = await all('SELECT id, nome_pt, sigla FROM selecoes ORDER BY nome_pt');
    const palpites = await all(
      'SELECT categoria, selecao_id FROM palpites_extras WHERE usuario_id = ? ORDER BY categoria',
      [req.session.usuario.id]
    );

    const mapa = {};
    for (const p of palpites) {
      if (!mapa[p.categoria]) mapa[p.categoria] = [];
      mapa[p.categoria].push(p.selecao_id);
    }

    const prazoPassou = new Date() >= DATA_LIMITE;

    res.render('palpites-extras', {
      title: 'Palpites Extras',
      categorias: CATEGORIAS,
      selecoes,
      palpites: mapa,
      multiCats: MULTI_CATS,
      prazoPassou,
      dataLimite: DATA_LIMITE
    });
  } catch (err) {
    console.error('Erro ao carregar palpites extras:', err);
    req.flash('erro', 'Erro ao carregar página.');
    res.redirect('/');
  }
});

router.post('/', verificarAutenticado, async (req, res) => {
  if (new Date() >= DATA_LIMITE) {
    req.flash('erro', 'O prazo para palpites extras já encerrou.');
    return res.redirect('/palpites-extras');
  }

  const usuarioId = req.session.usuario.id;

  try {
    await run('DELETE FROM palpites_extras WHERE usuario_id = ?', [usuarioId]);

    for (const cat of CATEGORIAS) {
      if (MULTI_CATS.has(cat.id)) {
        const selecoes = req.body[cat.id];
        if (!selecoes) continue;
        const ids = Array.isArray(selecoes) ? selecoes : [selecoes];
        for (const sId of ids) {
          await run(
            'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
            [usuarioId, cat.id, parseInt(sId, 10)]
          );
        }
      } else {
        const sId = req.body[cat.id];
        if (!sId) continue;
        await run(
          'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
          [usuarioId, cat.id, parseInt(sId, 10)]
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

adminRouter.get('/extras', verificarAdmin, async (req, res) => {
  try {
    const selecoes = await all('SELECT id, nome_pt, sigla FROM selecoes ORDER BY nome_pt');
    const resultados = await all('SELECT * FROM resultados_extras ORDER BY categoria');
    const mapa = {};
    for (const r of resultados) {
      if (!mapa[r.categoria]) mapa[r.categoria] = new Set();
      mapa[r.categoria].add(r.selecao_id);
    }

    res.render('admin-extras', {
      title: 'Resultados Extras',
      categorias: CATEGORIAS,
      selecoes,
      resultados: mapa,
      multiCats: MULTI_CATS
    });
  } catch (err) {
    console.error('Erro:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/admin');
  }
});

adminRouter.post('/extras', verificarAdmin, async (req, res) => {
  try {
    await run('DELETE FROM resultados_extras');

    for (const cat of CATEGORIAS) {
      if (MULTI_CATS.has(cat.id)) {
        const selecoes = req.body[cat.id];
        if (!selecoes) continue;
        const ids = Array.isArray(selecoes) ? selecoes : [selecoes];
        for (const sId of ids) {
          await run(
            'INSERT INTO resultados_extras (categoria, selecao_id, pontos) VALUES (?, ?, ?)',
            [cat.id, parseInt(sId, 10), cat.pts]
          );
        }
      } else {
        const sId = req.body[cat.id];
        if (!sId) continue;
        await run(
          'INSERT INTO resultados_extras (categoria, selecao_id, pontos) VALUES (?, ?, ?)',
          [cat.id, parseInt(sId, 10), cat.pts]
        );
      }
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
