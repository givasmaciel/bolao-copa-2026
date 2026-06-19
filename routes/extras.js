const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado, verificarAdmin } = require('../middleware/auth');

const router = express.Router();
const adminRouter = express.Router();

const CATEGORIAS = [
  { id: 'campeao', nome: 'Campeão', pts: 200, max: 1 },
  { id: 'vice', nome: 'Vice-campeão', pts: 150, max: 1 },
  { id: 'terceiro', nome: 'Terceiro lugar', pts: 100, max: 1 },
  { id: 'r32', nome: '1/16 avos de Final', pts: 5, max: 32 },
  { id: 'oitavas', nome: 'Oitavas de Final', pts: 10, max: 16 },
  { id: 'quartas', nome: 'Quartas de Final', pts: 15, max: 8 },
  { id: 'semi', nome: 'Semifinal', pts: 30, max: 4 },
  { id: 'finalista', nome: 'Finalista', pts: 50, max: 2 }
];

const MULTI_CATS = new Set(['r32', 'oitavas', 'quartas', 'semi', 'finalista']);
const DATA_LIMITE_PADRAO = '2026-06-11T15:55-03:00';

async function getDataLimite() {
  const row = await get("SELECT valor FROM config WHERE chave = 'extras_data_limite'");
  if (row) {
    const d = new Date(row.valor);
    if (!isNaN(d.getTime())) return d;
    // Fallback: tenta interpretar como BRT sem offset
    return new Date(row.valor + ':00-03:00');
  }
  return new Date(DATA_LIMITE_PADRAO);
}

router.get('/', verificarAutenticado, async (req, res) => {
  try {
    if (req.session.usuario.is_admin) {
      req.flash('erro', 'Administradores não podem participar do bolão.');
      return res.redirect('/admin');
    }
    const selecoes = await all('SELECT id, nome_pt, sigla, bandeira_url FROM selecoes ORDER BY nome_pt');
    const rows = await all(
      'SELECT categoria, selecao_id FROM palpites_extras WHERE usuario_id = ? ORDER BY categoria',
      [req.session.usuario.id]
    );

    const mapa = {};
    for (const p of rows) {
      if (!mapa[p.categoria]) mapa[p.categoria] = [];
      mapa[p.categoria].push(p.selecao_id);
    }

    const prazoPassou = new Date() >= await getDataLimite();

    let palpitesAgrupado = {};
    if (prazoPassou) {
      const todos = await all(`
        SELECT pe.categoria, pe.selecao_id, u.nome, u.id AS usuario_id
        FROM palpites_extras pe
        JOIN usuarios u ON pe.usuario_id = u.id
        ORDER BY pe.categoria, pe.selecao_id
      `);
      for (const r of todos) {
        if (!palpitesAgrupado[r.categoria]) palpitesAgrupado[r.categoria] = {};
        if (!palpitesAgrupado[r.categoria][r.selecao_id]) palpitesAgrupado[r.categoria][r.selecao_id] = [];
        palpitesAgrupado[r.categoria][r.selecao_id].push(r);
      }
    }

    const maxTotal = CATEGORIAS.reduce(function(s, c) { return s + c.pts * c.max; }, 0);

    res.render('palpites-extras', {
      title: 'Palpites Extras',
      categorias: CATEGORIAS,
      todasSelecoes: selecoes,
      palpites: mapa,
      multiCats: MULTI_CATS,
      prazoPassou,
      dataLimite: await getDataLimite(),
      palpitesAgrupado
    });
  } catch (err) {
    console.error('Erro ao carregar palpites extras:', err);
    req.flash('erro', 'Erro ao carregar página.');
    res.redirect('/');
  }
});

router.post('/', verificarAutenticado, async (req, res) => {
  if (req.session.usuario.is_admin) {
    req.flash('erro', 'Administradores não podem participar do bolão.');
    return res.redirect('/admin');
  }
  if (new Date() >= await getDataLimite()) {
    req.flash('erro', 'O prazo para palpites extras já encerrou.');
    return res.redirect('/palpites-extras');
  }

  const usuarioId = req.session.usuario.id;

  const erros = [];
  for (const cat of CATEGORIAS) {
    if (MULTI_CATS.has(cat.id)) {
      const vals = req.body[cat.id];
      if (vals) {
        const ids = Array.isArray(vals) ? vals : [vals];
        if (ids.length > cat.max) {
          erros.push(`${cat.nome}: máximo ${cat.max} seleções.`);
        }
      }
    }
  }
  if (erros.length > 0) {
    req.flash('erro', erros.join(' '));
    return res.redirect('/palpites-extras');
  }

  try {
    await run('DELETE FROM palpites_extras WHERE usuario_id = ?', [usuarioId]);

    for (const cat of CATEGORIAS) {
      if (MULTI_CATS.has(cat.id)) {
        const vals = req.body[cat.id];
        if (!vals) continue;
        const ids = Array.isArray(vals) ? vals : [vals];
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

// POST /palpites-extras/:categoria - salva uma categoria individualmente
router.post('/:categoria', verificarAutenticado, async (req, res) => {
  const cat = CATEGORIAS.find(c => c.id === req.params.categoria);
  if (!cat) {
    req.flash('erro', 'Categoria inválida.');
    return res.redirect('/palpites-extras');
  }
  if (req.session.usuario.is_admin) {
    req.flash('erro', 'Administradores não podem participar do bolão.');
    return res.redirect('/admin');
  }
  if (new Date() >= await getDataLimite()) {
    req.flash('erro', 'O prazo para palpites extras já encerrou.');
    return res.redirect('/palpites-extras');
  }

  const usuarioId = req.session.usuario.id;

  const erros = [];
  if (MULTI_CATS.has(cat.id)) {
    const vals = req.body[cat.id];
    const ids = vals ? (Array.isArray(vals) ? vals : [vals]) : [];
    if (ids.length > cat.max) {
      erros.push(`${cat.nome}: máximo ${cat.max} seleções.`);
    }
  }
  if (erros.length > 0) {
    req.flash('erro', erros.join(' '));
    return res.redirect('/palpites-extras');
  }

  try {
    await run('DELETE FROM palpites_extras WHERE usuario_id = ? AND categoria = ?', [usuarioId, cat.id]);

    if (MULTI_CATS.has(cat.id)) {
      const vals = req.body[cat.id];
      const ids = vals ? (Array.isArray(vals) ? vals : [vals]) : [];
      for (const sId of ids) {
        await run(
          'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
          [usuarioId, cat.id, parseInt(sId, 10)]
        );
      }
    } else {
      const sId = req.body[cat.id];
      if (sId) {
        await run(
          'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
          [usuarioId, cat.id, parseInt(sId, 10)]
        );
      }
    }

    req.flash('sucesso', `${cat.nome} salvo com sucesso!`);
    res.redirect('/palpites-extras');
  } catch (err) {
    console.error('Erro ao salvar palpites extras:', err);
    req.flash('erro', 'Erro ao salvar.');
    res.redirect('/palpites-extras');
  }
});

adminRouter.get('/extras', verificarAdmin, async (req, res) => {
  try {
    const selecoes = await all('SELECT id, nome_pt, sigla, bandeira_url FROM selecoes ORDER BY nome_pt');
    const resultados = await all('SELECT * FROM resultados_extras ORDER BY categoria');
    const mapa = {};
    for (const r of resultados) {
      if (!mapa[r.categoria]) mapa[r.categoria] = new Set();
      mapa[r.categoria].add(r.selecao_id);
    }

    const dataLimite = await getDataLimite();

    res.render('admin-extras', {
      title: 'Resultados Extras',
      categorias: CATEGORIAS,
      selecoes,
      resultados: mapa,
      multiCats: MULTI_CATS,
      dataLimite
    });
  } catch (err) {
    console.error('Erro:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/admin');
  }
});

adminRouter.post('/extras', verificarAdmin, async (req, res) => {
  try {
    // A categoria vem do hidden input _categoria (ou fallback)
    const catId = req.body._categoria;
    const cat = CATEGORIAS.find(c => c.id === catId);
    if (!cat) {
      req.flash('erro', 'Categoria inválida.');
      return res.redirect('/admin/extras');
    }

    // Valida limite se for multi-select
    if (MULTI_CATS.has(cat.id)) {
      const selecoes = req.body[cat.id];
      if (selecoes && Array.isArray(selecoes) && selecoes.length > cat.max) {
        req.flash('erro', `${cat.nome}: máximo ${cat.max} seleções.`);
        return res.redirect('/admin/extras');
      }
    }

    // Substitui os resultados desta categoria
    await run('DELETE FROM resultados_extras WHERE categoria = ?', [cat.id]);

    if (MULTI_CATS.has(cat.id)) {
      const selecoes = req.body[cat.id];
      if (selecoes) {
        const ids = Array.isArray(selecoes) ? selecoes : [selecoes];
        for (const sId of ids) {
          await run('INSERT INTO resultados_extras (categoria, selecao_id, pontos) VALUES (?, ?, ?)',
            [cat.id, parseInt(sId, 10), cat.pts]);
        }
      }
    } else {
      const sId = req.body[cat.id];
      if (sId) {
        await run('INSERT INTO resultados_extras (categoria, selecao_id, pontos) VALUES (?, ?, ?)',
          [cat.id, parseInt(sId, 10), cat.pts]);
      }
    }

    req.flash('sucesso', `${cat.nome} salvo!`);
    res.redirect('/admin/extras');
  } catch (err) {
    console.error('Erro ao salvar resultados:', err);
    req.flash('erro', 'Erro ao salvar.');
    res.redirect('/admin/extras');
  }
});

adminRouter.post('/extras/config', verificarAdmin, async (req, res) => {
  try {
    const { data_limite } = req.body;
    if (data_limite) {
      // Converte de BRT (America/Sao_Paulo) para string ISO com offset
      // O input vem como YYYY-MM-DDTHH:MM (horário BRT)
      const dataBRT = new Date(data_limite + ':00-03:00');
      await run("DELETE FROM config WHERE chave = 'extras_data_limite'");
      await run('INSERT INTO config (chave, valor) VALUES (?, ?)', ['extras_data_limite', dataBRT.toISOString()]);
      req.flash('sucesso', 'Prazo dos palpites extras atualizado!');
    }
    res.redirect('/admin/extras');
  } catch (err) {
    console.error('Erro ao salvar config:', err);
    req.flash('erro', 'Erro ao salvar prazo.');
    res.redirect('/admin/extras');
  }
});

module.exports = { router, adminRouter, CATEGORIAS };
