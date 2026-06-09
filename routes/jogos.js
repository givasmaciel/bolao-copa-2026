const express = require('express');
const { all } = require('../database/db');

const router = express.Router();

// GET /jogos - lista todos os jogos com placares reais
router.get('/', async (req, res) => {
  try {
    const jogos = await all(`
      SELECT
        j.id, j.fase, j.rodada, j.data, j.estadio, j.cidade, j.pais,
        j.finalizado, j.gols_casa, j.gols_visitante,
        g.letra AS grupo_letra,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      ORDER BY j.id
    `);

    // Agrupa por fase
    const fases = {
      grupo: { nome: 'Fase de Grupos', jogos: [] },
      r32: { nome: '32-avos de Final', jogos: [] },
      r16: { nome: 'Oitavas de Final', jogos: [] },
      qf: { nome: 'Quartas de Final', jogos: [] },
      sf: { nome: 'Semifinais', jogos: [] },
      terceiro: { nome: 'Disputa de 3º lugar', jogos: [] },
      final: { nome: 'Final', jogos: [] }
    };
    for (const jogo of jogos) {
      if (fases[jogo.fase]) fases[jogo.fase].jogos.push(jogo);
    }

    res.render('jogos', { title: 'Jogos da Copa 2026', fases });
  } catch (err) {
    console.error('Erro ao listar jogos:', err);
    req.flash('erro', 'Erro ao carregar jogos.');
    res.redirect('/');
  }
});

module.exports = router;
