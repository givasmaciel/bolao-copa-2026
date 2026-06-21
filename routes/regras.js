// Página de regras removida — todas as regras agora estão no Painel (/dashboard)
// e no Ranking (/ranking). Mantemos só um redirect para não quebrar links antigos.
const express = require('express');

const router = express.Router();

router.get('/', (req, res) => {
  req.flash('aviso', 'As regras agora estão no Painel (clique em "Pontuação e regras" para expandir).');
  res.redirect('/dashboard');
});

module.exports = router;
