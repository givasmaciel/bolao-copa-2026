const express = require('express');
const { all, get } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');
const { PALPITE_MARGEM_MS } = require('../services/palpite-config');
const logger = require('../logger');

const router = express.Router();

// GET /jogos/db-info - rota publica de debug que mostra qual banco esta conectado
// Le a 'db_marker' da tabela config (util para distinguir Render vs Neon)
router.get('/db-info', async (req, res) => {
  try {
    const url = process.env.DATABASE_URL || '';
    const host = url.split('@')[1]?.split('/')[0] || '?';
    const marker = await get("SELECT valor FROM config WHERE chave = 'db_marker'");
    const contagens = {
      usuarios: (await get('SELECT COUNT(*) AS c FROM usuarios'))?.c || 0,
      jogos: (await get('SELECT COUNT(*) AS c FROM jogos'))?.c || 0,
      palpites: (await get('SELECT COUNT(*) AS c FROM palpites'))?.c || 0,
      jogos_finalizados: (await get('SELECT COUNT(*) AS c FROM jogos WHERE finalizado = 1'))?.c || 0,
    };
    res.json({
      host,
      marcador: marker?.valor || 'NAO_ENCONTRADO',
      contagens,
      rodando_em: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /jogos - lista todos os jogos com placares reais
router.get('/', async (req, res) => {
  try {
    const jogos = await all(`
      SELECT
        j.id, j.fase, j.rodada, j.data, j.estadio, j.cidade, j.pais,
        j.finalizado, j.gols_casa, j.gols_visitante,
        j.gols_casa_pror, j.gols_visitante_pror,
        j.placar_penaltis_casa, j.placar_penaltis_visitante,
        g.letra AS grupo_letra,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        cc.nome_pt AS classificado_pt, cc.sigla AS classificado_sigla
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN selecoes cc ON j.classificado_id = cc.id
      ORDER BY j.data, j.id
    `);

    // Agrupa por fase
    const fases = {
      grupo: { nome: 'Fase de Grupos', jogos: [] },
      r32: { nome: '16-avos de Final', jogos: [] },
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
    logger.error('Erro ao listar jogos:', err);
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
        j.gols_casa_pror, j.gols_visitante_pror,
        j.placar_penaltis_casa, j.placar_penaltis_visitante,
        g.letra AS grupo_letra,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        cc.nome_pt AS classificado_pt, cc.sigla AS classificado_sigla
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN selecoes cc ON j.classificado_id = cc.id
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
    logger.error('Erro ao carregar palpites do jogo:', err);
    req.flash('erro', 'Erro ao carregar palpites.');
    res.redirect('/jogos');
  }
});

module.exports = router;
