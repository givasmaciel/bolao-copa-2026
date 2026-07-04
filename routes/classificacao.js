const express = require('express');
const router = express.Router();
const { classificarTodosGrupos } = require('../services/classificacao');
const { listarConfrontos } = require('../services/mata-mata');
const { all } = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const [grupos, classificacao, confrontos] = await Promise.all([
      all('SELECT id, letra FROM grupos ORDER BY letra'),
      classificarTodosGrupos(),
      listarConfrontos()
    ]);
    res.render('classificacao', { title: 'Classificação', grupos, classificacao, confrontos });
  } catch (err) {
    console.error('Erro ao carregar classificação:', err);
    res.status(500).render('500', { title: 'Erro interno' });
  }
});

module.exports = router;