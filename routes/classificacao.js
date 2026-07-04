const express = require('express');
const router = express.Router();
const { classificarTodosGrupos } = require('../services/classificacao');
const { all } = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const grupos = await all('SELECT id, letra FROM grupos ORDER BY letra');
    const classificacao = await classificarTodosGrupos();
    res.render('classificacao', { title: 'Classificação', grupos, classificacao });
  } catch (err) {
    console.error('Erro ao carregar classificação:', err);
    res.status(500).render('500', { title: 'Erro interno' });
  }
});

module.exports = router;
