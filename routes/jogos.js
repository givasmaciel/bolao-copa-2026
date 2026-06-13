const express = require('express');
const { all, get } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');
const { PALPITE_MARGEM_MS } = require('../services/palpite-config');

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

    const totalJogos = jogos.length;
    res.render('jogos', { title: 'Jogos da Copa 2026', fases, totalJogos });
  } catch (err) {
    console.error('Erro ao listar jogos:', err);
    req.flash('erro', 'Erro ao carregar jogos.');
    res.redirect('/');
  }
});

// GET /jogos/:id/palpites - mostra palpites públicos de um jogo
router.get('/:id/palpites', verificarAutenticado, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  if (isNaN(jogoId)) {
    req.flash('erro', 'Jogo inválido.');
    return res.redirect('/jogos');
  }

  try {
    const row = await get(`
      SELECT
        j.id, j.fase, j.rodada, j.data, j.estadio, j.cidade, j.pais,
        j.finalizado, j.gols_casa, j.gols_visitante, j.palpite_limite,
        g.letra AS grupo_letra,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      WHERE j.id = ?
    `, [jogoId]);
    if (!row) {
      req.flash('erro', 'Jogo não encontrado.');
      return res.redirect('/jogos');
    }

    const agora = new Date();
    const dataJogo = new Date(row.data);
    const limite = row.palpite_limite ? new Date(row.palpite_limite) : null;
    const margem = limite || new Date(dataJogo.getTime() - PALPITE_MARGEM_MS);
    const bloqueado = agora >= margem || row.finalizado === 1;

    let palpites = [];
    let agrupado = {};

    if (bloqueado) {
      const rows = await all(`
        SELECT p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos,
               u.nome, u.id AS usuario_id
        FROM palpites p
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.jogo_id = ?
        ORDER BY u.nome
      `, [jogoId]);

      palpites = rows.map(r => ({
        ...r,
        temPalpite: r.palpite_gols_casa !== null && r.palpite_gols_visitante !== null
      }));

      for (const p of palpites) {
        if (!p.temPalpite) continue;
        const chave = p.palpite_gols_casa + '×' + p.palpite_gols_visitante;
        if (!agrupado[chave]) agrupado[chave] = [];
        agrupado[chave].push(p);
      }
    }

    res.render('jogos-palpites', {
      title: row.casa_pt + ' × ' + row.visitante_pt + ' — Palpites',
      jogo: row,
      bloqueado,
      palpites,
      agrupado,
      usuarioId: req.session.usuario.id
    });
  } catch (err) {
    console.error('Erro ao carregar palpites do jogo:', err);
    req.flash('erro', 'Erro ao carregar palpites.');
    res.redirect('/jogos');
  }
});

module.exports = router;
