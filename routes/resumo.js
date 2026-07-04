const express = require('express');
const { run, get, all } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');
const { CATEGORIAS } = require('./extras');
const logger = require('../logger');

const router = express.Router();

router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const userId = req.session.usuario.id;

    // Estatísticas gerais
    const stats = await get(`
      SELECT
        COUNT(p.id) AS total_palpites,
        COALESCE(SUM(p.pontos_obtidos), 0) AS total_pontos,
        COALESCE(SUM(CASE WHEN p.pontos_obtidos > 0 THEN 1 ELSE 0 END), 0) AS palpites_certos,
        COALESCE(SUM(CASE WHEN p.palpite_gols_casa = j.gols_casa
                           AND p.palpite_gols_visitante = j.gols_visitante
                          THEN 1 ELSE 0 END), 0) AS placares_exatos,
        COALESCE(SUM(CASE WHEN ((j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                                OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante))
                               AND (p.palpite_gols_casa = j.gols_casa OR p.palpite_gols_visitante = j.gols_visitante)
                               AND NOT (p.palpite_gols_casa = j.gols_casa AND p.palpite_gols_visitante = j.gols_visitante)
                          THEN 1 ELSE 0 END), 0) AS resultados_exatos,
        -- só_resultado: acertou resultado (vencedor/empate) mas errou os placares parciais.
        -- Versão única de SUM(CASE WHEN ... THEN 1 ... WHEN ... THEN 1 ... ELSE 0 END)
        -- para evitar BIGINT+INTEGER+COALESCE que falha em PostgreSQL.
        COALESCE(SUM(CASE
          WHEN ((j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
             OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante))
           AND p.palpite_gols_casa <> j.gols_casa
           AND p.palpite_gols_visitante <> j.gols_visitante
             THEN 1
          WHEN j.gols_casa = j.gols_visitante
           AND p.palpite_gols_casa = p.palpite_gols_visitante
           AND NOT (p.palpite_gols_casa = j.gols_casa AND p.palpite_gols_visitante = j.gols_visitante)
             THEN 1
          ELSE 0
        END), 0) AS so_resultados,
        COALESCE(SUM(CASE WHEN NOT (
                                  (j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                               OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante)
                               OR (j.gols_casa = j.gols_visitante AND p.palpite_gols_casa = p.palpite_gols_visitante)
                             )
                               AND (p.palpite_gols_casa = j.gols_casa OR p.palpite_gols_visitante = j.gols_visitante)
                          THEN 1 ELSE 0 END), 0) AS acertou_um_gol,
        COALESCE(SUM(CASE WHEN NOT (
                                   p.palpite_gols_casa = j.gols_casa
                               AND p.palpite_gols_visitante = j.gols_visitante
                              )
                                AND NOT (j.gols_casa = j.gols_visitante
                                     AND p.palpite_gols_casa = p.palpite_gols_visitante)
                                AND NOT (
                                   (j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                                OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante)
                              )
                                AND p.palpite_gols_casa <> j.gols_casa
                                AND p.palpite_gols_visitante <> j.gols_visitante
                           THEN 1 ELSE 0 END), 0) AS errou_tudo,
        COALESCE(SUM(CASE WHEN j.gols_casa = j.gols_visitante
                            AND p.palpite_gols_casa = p.palpite_gols_visitante
                           THEN 1 ELSE 0 END), 0) AS acertou_empate
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE p.usuario_id = ? AND j.finalizado = 1
    `, [userId]);

    // Pontos por rodada
    const porRodada = await all(`
      SELECT j.rodada, COALESCE(SUM(p.pontos_obtidos), 0) AS pontos
      FROM jogos j
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      WHERE j.fase = 'grupo'
      GROUP BY j.rodada
      ORDER BY j.rodada
    `, [userId]);

    // Jogos finalizados com resultados reais e palpites do usuário (todas as fases)
    const jogosFinalizados = await all(`
      SELECT j.id, j.rodada, j.data, j.fase, j.gols_casa, j.gols_visitante,
        j.gols_casa_pror, j.gols_visitante_pror,
        j.placar_penaltis_casa, j.placar_penaltis_visitante,
        j.selecao_casa_id, j.selecao_visitante_id, j.classificado_id,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.palpite_classificado_id, p.pontos_obtidos,
        cc.nome_pt AS classificado_pt,
        fp.pts_classificado,
        CASE WHEN j.fase <> 'grupo'
               AND j.gols_casa = j.gols_visitante
               AND j.classificado_id IS NOT NULL
               AND p.palpite_classificado_id IS NOT NULL
               AND p.palpite_classificado_id = j.classificado_id
             THEN fp.pts_classificado ELSE 0 END AS bonus_qualificacao
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN selecoes cc ON j.classificado_id = cc.id
      LEFT JOIN palpites p ON p.jogo_id = j.id AND p.usuario_id = ?
      LEFT JOIN fase_pontuacao fp ON fp.fase = j.fase
      WHERE j.finalizado = 1
      ORDER BY j.data DESC, j.id DESC
    `, [userId]);

    // Lista de participantes para racha
    const participantes = await all(`
      SELECT id, nome FROM usuarios WHERE id != ? ORDER BY nome
    `, [userId]);

    // Racha com um participante específico (query param ?com=id)
    let racha = null;
    const rachaId = parseInt(req.query.com, 10);
    if (rachaId && !isNaN(rachaId)) {
      const rachaUser = await get('SELECT id, nome, foto FROM usuarios WHERE id = ?', [rachaId]);
      if (rachaUser) {
        // Busca palpites dos dois incluindo fase, rodada, nomes e placar — dados
        // necessários para montar a tabela por rodada/fase e o top 5 maiores gaps.
        const palpitesEu = await all(`
          SELECT p.jogo_id, p.pontos_obtidos, j.rodada, j.fase,
                 j.gols_casa, j.gols_visitante,
                 sc.sigla AS casa_sigla, sv.sigla AS visitante_sigla
          FROM palpites p
          JOIN jogos j ON j.id = p.jogo_id
          LEFT JOIN selecoes sc ON sc.id = j.selecao_casa_id
          LEFT JOIN selecoes sv ON sv.id = j.selecao_visitante_id
          WHERE p.usuario_id = ? AND j.finalizado = 1
          ORDER BY j.data, j.id
        `, [userId]);

        const palpitesEle = await all(`
          SELECT p.jogo_id, p.pontos_obtidos, j.rodada, j.fase,
                 j.gols_casa, j.gols_visitante,
                 sc.sigla AS casa_sigla, sv.sigla AS visitante_sigla
          FROM palpites p
          JOIN jogos j ON j.id = p.jogo_id
          LEFT JOIN selecoes sc ON sc.id = j.selecao_casa_id
          LEFT JOIN selecoes sv ON sv.id = j.selecao_visitante_id
          WHERE p.usuario_id = ? AND j.finalizado = 1
          ORDER BY j.data, j.id
        `, [rachaId]);

        // Busca bônus e extras de ambos
        const [bonusEu, extrasEu, bonusEle, extrasEle] = await Promise.all([
          get('SELECT COALESCE(SUM(pontos),0) AS total FROM pontos_bonus WHERE usuario_id = ?', [userId]),
          get('SELECT COALESCE(SUM(r.pontos),0) AS total FROM palpites_extras pe JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id WHERE pe.usuario_id = ?', [userId]),
          get('SELECT COALESCE(SUM(pontos),0) AS total FROM pontos_bonus WHERE usuario_id = ?', [rachaId]),
          get('SELECT COALESCE(SUM(r.pontos),0) AS total FROM palpites_extras pe JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id WHERE pe.usuario_id = ?', [rachaId])
        ]);
        const totalBonusEu = (bonusEu?.total || 0) + (extrasEu?.total || 0);
        const totalBonusEle = (bonusEle?.total || 0) + (extrasEle?.total || 0);

        // Total de pontos de palpites (sem bônus/extras)
        const palpitesEuTotal = palpitesEu.reduce((s, p) => s + (p.pontos_obtidos || 0), 0);
        const palpitesEleTotal = palpitesEle.reduce((s, p) => s + (p.pontos_obtidos || 0), 0);

        // Total geral (palpites + bônus/extras)
        const pontosEu = palpitesEuTotal + totalBonusEu;
        const pontosEle = palpitesEleTotal + totalBonusEle;

        // === Pontos por rodada/fase (lado a lado) ===
        // Cada entrada: { key, label, eu, ele, diff }
        const chaveRodada = (j) => {
          if (j.fase === 'grupo') return { key: 'g' + j.rodada, label: 'R' + j.rodada };
          const mapa = { r32: '16 avos', r16: 'Oitavas', qf: 'Quartas', sf: 'Semi', terceiro: '3º', final: 'Final' };
          return { key: j.fase, label: mapa[j.fase] || j.fase };
        };
        const mapRodada = new Map();
        for (const p of palpitesEu) {
          const k = chaveRodada(p);
          if (!mapRodada.has(k.key)) mapRodada.set(k.key, { key: k.key, label: k.label, eu: 0, ele: 0 });
          mapRodada.get(k.key).eu += (p.pontos_obtidos || 0);
        }
        for (const p of palpitesEle) {
          const k = chaveRodada(p);
          if (!mapRodada.has(k.key)) mapRodada.set(k.key, { key: k.key, label: k.label, eu: 0, ele: 0 });
          mapRodada.get(k.key).ele += (p.pontos_obtidos || 0);
        }
        // Ordem fixa de fases (grupos primeiro em ordem de rodada, depois mata-mata)
        const ordemFases = ['g1', 'g2', 'g3', 'r32', 'r16', 'qf', 'sf', 'terceiro', 'final'];
        const pontosPorRodada = ordemFases
          .filter(k => mapRodada.has(k))
          .map(k => {
            const r = mapRodada.get(k);
            r.diff = r.eu - r.ele;
            return r;
          });

        // === Top 5 maiores gaps (jogo a jogo) ===
        const mapaEle = {};
        for (const p of palpitesEle) mapaEle[p.jogo_id] = p.pontos_obtidos || 0;
        const gaps = [];
        for (const p of palpitesEu) {
          const pEle = mapaEle[p.jogo_id];
          if (pEle === undefined) continue; // ele não palpitou neste jogo
          const diff = (p.pontos_obtidos || 0) - pEle;
          if (diff !== 0) {
            gaps.push({
              jogo_id: p.jogo_id,
              rodada: p.rodada,
              fase: p.fase,
              casa_sigla: p.casa_sigla,
              visitante_sigla: p.visitante_sigla,
              placar: p.gols_casa + '×' + p.gols_visitante,
              ptsEu: p.pontos_obtidos || 0,
              ptsEle: pEle,
              diff
            });
          }
        }
        gaps.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
        const top5Gaps = gaps.slice(0, 5);

        // === V/E/D jogo a jogo (mantido para compatibilidade) ===
        let vitorias = 0, empates = 0, derrotas = 0;
        for (const p of palpitesEu) {
          const pEle = mapaEle[p.jogo_id] ?? -1;
          const pEu = p.pontos_obtidos || 0;
          if (pEu > pEle) vitorias++;
          else if (pEu === pEle) empates++;
          else derrotas++;
        }

        racha = {
          usuario: rachaUser,
          pontosEu,
          pontosEle,
          palpitesEuTotal,
          palpitesEleTotal,
          bonusEu: totalBonusEu,
          bonusEle: totalBonusEle,
          pontosPorRodada,
          top5Gaps,
          vitorias,
          empates,
          derrotas
        };
      }
    }

    const bonusRow = await get('SELECT COALESCE(SUM(pontos), 0) AS total FROM pontos_bonus WHERE usuario_id = ?', [userId]);
    const extrasRowPts = await get(`
      SELECT COALESCE(SUM(r.pontos), 0) AS total
      FROM palpites_extras pe
      JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
      WHERE pe.usuario_id = ?
    `, [userId]);

    const extrasDetalhado = await all(`
      SELECT pe.categoria, SUM(r.pontos) AS pontos
      FROM palpites_extras pe
      JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
      WHERE pe.usuario_id = ?
      GROUP BY pe.categoria
      ORDER BY pe.categoria
    `, [userId]);

    const totalDisputadoResumo = await get(`
      SELECT COALESCE(SUM(
        fp.pts_exato +
        CASE
          WHEN j.fase <> 'grupo'
           AND j.gols_casa = j.gols_visitante
           AND j.classificado_id IS NOT NULL
          THEN fp.pts_classificado
          ELSE 0
        END
      ), 0) AS total
      FROM jogos j
      JOIN fase_pontuacao fp ON fp.fase = j.fase
      WHERE j.finalizado = 1
    `);
    const maximoPontosResumo = Number(totalDisputadoResumo?.total) || 0;
    const aproveitamento = maximoPontosResumo > 0
      ? Math.max(0, Math.min(100, Math.round(((Number(stats?.total_pontos) || 0) / maximoPontosResumo) * 100)))
      : 0;

    res.render('resumo', {
      title: 'Meu resumo',
      stats,
      bonusPontos: bonusRow?.total || 0,
      extrasPontos: extrasRowPts?.total || 0,
      extrasDetalhado,
      CATEGORIAS,
      aproveitamento,
      porRodada,
      jogosFinalizados,
      participantes,
      racha,
      rachaId: req.query.com || ''
    });
  } catch (err) {
    logger.error('Erro no resumo:', err);
    req.flash('erro', 'Erro ao carregar resumo. Tente novamente em alguns instantes.');
    // Direciona direto ao /dashboard — o redirect para '/' também levaria
    // ao dashboard (porque o usuário está logado), mas passando por '/'
    // o flash some e a UX fica pior.
    res.redirect('/dashboard');
  }
});

module.exports = router;
