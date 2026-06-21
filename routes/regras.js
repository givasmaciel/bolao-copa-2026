const express = require('express');
const { all } = require('../database/db');

const router = express.Router();

// GET /regras - página pública com regras do bolão e premiações
router.get('/', async (req, res) => {
  try {
    const [fases, premiosRows] = await Promise.all([
      all('SELECT fase, pts_exato, pts_empate, pts_resultado_gol, pts_resultado, pts_gol, pts_classificado FROM fase_pontuacao ORDER BY CASE fase WHEN \'grupo\' THEN 1 WHEN \'r32\' THEN 2 WHEN \'r16\' THEN 3 WHEN \'qf\' THEN 4 WHEN \'sf\' THEN 5 WHEN \'terceiro\' THEN 6 WHEN \'final\' THEN 7 END'),
      all("SELECT chave, valor FROM config WHERE chave LIKE 'premio_%'")
    ]);
    const faseLabel = { grupo: 'Fase de Grupos', r32: '16-avos de Final', r16: 'Oitavas de Final', qf: 'Quartas de Final', sf: 'Semifinal', terceiro: 'Disputa de 3º lugar', final: 'Final' };
    const premios = { premio_1: '300.00', premio_2: '125.00', premio_3: '75.00' };
    for (const r of premiosRows) premios[r.chave] = r.valor;
    const fasesComLabel = fases.map(f => ({ ...f, label: faseLabel[f.fase] || f.fase }));
    res.render('regras', { title: 'Regras do Bolão', fases: fasesComLabel, premios });
  } catch (err) {
    console.error('Erro ao carregar regras:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/');
  }
});

module.exports = router;
