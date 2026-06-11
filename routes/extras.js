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
const ORDEM_HIERARQUIA = ['r32', 'oitavas', 'quartas', 'semi', 'finalista', 'campeao', 'vice', 'terceiro'];

function calcularDisponiveis(palpites, selecoes) {
  const todas = selecoes.map(function(s) { return s.id; });
  const disp = { r32: todas };
  for (let i = 0; i < ORDEM_HIERARQUIA.length; i++) {
    const atual = ORDEM_HIERARQUIA[i];
    const prox = ORDEM_HIERARQUIA[i + 1];
    if (!prox || prox === 'terceiro') continue;
    disp[prox] = palpites[atual] && palpites[atual].length > 0 ? palpites[atual] : [];
  }
  disp.campeao = palpites.finalista && palpites.finalista.length > 0 ? palpites.finalista : [];
  disp.vice = palpites.finalista && palpites.finalista.length > 0 ? palpites.finalista : [];
  disp.terceiro = todas;
  return disp;
}

function validarHierarquia(palpites, catId, ids) {
  const dependencia = {
    oitavas: 'r32', quartas: 'oitavas', semi: 'quartas',
    finalista: 'semi', campeao: 'finalista', vice: 'finalista'
  };
  const dep = dependencia[catId];
  if (dep && palpites[dep] && palpites[dep].length > 0) {
    const permitidos = new Set(palpites[dep]);
    for (const id of ids) {
      if (!permitidos.has(id)) return 'Seleção inválida: você só pode escolher entre as seleções que selecionou em ' + CATEGORIAS.find(function(c){return c.id===dep;}).nome + '.';
    }
  }
  return null;
}

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
    const selecoes = await all('SELECT id, nome_pt, sigla FROM selecoes ORDER BY nome_pt');
    const rows = await all(
      'SELECT categoria, selecao_id FROM palpites_extras WHERE usuario_id = ? ORDER BY categoria',
      [req.session.usuario.id]
    );

    const mapa = {};
    for (const p of rows) {
      if (!mapa[p.categoria]) mapa[p.categoria] = [];
      mapa[p.categoria].push(p.selecao_id);
    }

    const disponiveis = calcularDisponiveis(mapa, selecoes);
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
      ordem: ORDEM_HIERARQUIA,
      selecoes,
      palpites: mapa,
      disponiveis,
      multiCats: MULTI_CATS,
      prazoPassou,
      dataLimite: await getDataLimite(),
      palpitesAgrupado,
      maxTotal
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
  const selecionado = {};
  for (const cat of CATEGORIAS) {
    if (MULTI_CATS.has(cat.id)) {
      const vals = req.body[cat.id];
      const ids = vals ? (Array.isArray(vals) ? vals : [vals]).map(Number) : [];
      if (ids.length > cat.max) {
        erros.push(`${cat.nome}: máximo ${cat.max} seleções.`);
      }
      selecionado[cat.id] = ids;
    } else {
      const id = parseInt(req.body[cat.id], 10);
      selecionado[cat.id] = isNaN(id) ? [] : [id];
    }
  }
  for (const cat of CATEGORIAS) {
    const err = validarHierarquia(selecionado, cat.id, selecionado[cat.id]);
    if (err) erros.push(err);
  }
  if (erros.length > 0) {
    req.flash('erro', erros.join(' '));
    return res.redirect('/palpites-extras');
  }

  try {
    await run('DELETE FROM palpites_extras WHERE usuario_id = ?', [usuarioId]);

    for (const cat of CATEGORIAS) {
      const ids = selecionado[cat.id] || [];
      for (const sId of ids) {
        await run(
          'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
          [usuarioId, cat.id, sId]
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

  // Valida campos obrigatórios e limites
  let erros = [];
  if (MULTI_CATS.has(cat.id)) {
    const vals = req.body.selecoes;
    const ids = vals ? (Array.isArray(vals) ? vals : [vals]).map(Number) : [];
    if (ids.length > cat.max) {
      erros.push(`${cat.nome}: máximo ${cat.max} seleções.`);
    }
  }

  // Carrega palpites atuais para validar hierarquia
  const atuais = await all(
    'SELECT categoria, selecao_id FROM palpites_extras WHERE usuario_id = ?',
    [usuarioId]
  );
  const mapaAtual = {};
  for (const p of atuais) {
    if (!mapaAtual[p.categoria]) mapaAtual[p.categoria] = [];
    mapaAtual[p.categoria].push(p.selecao_id);
  }

  if (MULTI_CATS.has(cat.id)) {
    const vals = req.body.selecoes;
    const ids = vals ? (Array.isArray(vals) ? vals : [vals]).map(Number) : [];
    const err = validarHierarquia(Object.assign({}, mapaAtual, { [cat.id]: ids }), cat.id, ids);
    if (err) erros.push(err);
  } else {
    const id = parseInt(req.body.selecao, 10);
    const ids = isNaN(id) ? [] : [id];
    const err = validarHierarquia(Object.assign({}, mapaAtual, { [cat.id]: ids }), cat.id, ids);
    if (err) erros.push(err);
  }

  if (erros.length > 0) {
    req.flash('erro', erros.join(' '));
    return res.redirect('/palpites-extras');
  }

  try {
    await run('DELETE FROM palpites_extras WHERE usuario_id = ? AND categoria = ?', [usuarioId, cat.id]);

    if (MULTI_CATS.has(cat.id)) {
      const vals = req.body.selecoes;
      const ids = vals ? (Array.isArray(vals) ? vals : [vals]).map(Number) : [];
      for (const sId of ids) {
        await run(
          'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
          [usuarioId, cat.id, sId]
        );
      }
    } else {
      const sId = parseInt(req.body.selecao, 10);
      if (!isNaN(sId)) {
        await run(
          'INSERT INTO palpites_extras (usuario_id, categoria, selecao_id) VALUES (?, ?, ?)',
          [usuarioId, cat.id, sId]
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
    const selecoes = await all('SELECT id, nome_pt, sigla FROM selecoes ORDER BY nome_pt');
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
