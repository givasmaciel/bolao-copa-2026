const express = require('express');
const { all, get } = require('../database/db');
const { CATEGORIAS } = require('./extras');

const router = express.Router();

// GET /ranking - mostra o ranking geral
router.get('/', async (req, res) => {
  try {
    const ranking = await all(`
      SELECT
        u.id,
        u.nome,
        u.foto,
        u.criado_em,
        COUNT(p.id) AS total_palpites,
        SUM(CASE WHEN j.finalizado = 1 THEN 1 ELSE 0 END) AS palpites_finalizados,
        COALESCE(SUM(p.pontos_obtidos), 0) + COALESCE((
          SELECT SUM(r.pontos)
          FROM palpites_extras pe
          JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
          WHERE pe.usuario_id = u.id
        ), 0) + COALESCE((
          SELECT SUM(pontos) FROM pontos_bonus WHERE usuario_id = u.id
        ), 0) AS total_pontos,
        COALESCE(SUM(CASE WHEN j.finalizado = 1 THEN p.pontos_obtidos ELSE 0 END), 0) AS palpites_pontos,
        COALESCE((
          SELECT SUM(r.pontos)
          FROM palpites_extras pe
          JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
          WHERE pe.usuario_id = u.id
        ), 0) AS extras_pontos,
        COALESCE((SELECT SUM(pontos) FROM pontos_bonus WHERE usuario_id = u.id), 0) AS bonus_pontos,
        SUM(CASE WHEN p.pontos_obtidos > 0 THEN 1 ELSE 0 END) AS palpites_com_pontos,
        COALESCE(MAX(p.pontos_obtidos), 0) AS maior_palpite,
        -- Tipo de acerto calculado pelos placares, sem depender do total que pode incluir bônus.
        SUM(CASE WHEN j.finalizado = 1
                  AND p.palpite_gols_casa = j.gols_casa
                  AND p.palpite_gols_visitante = j.gols_visitante
                 THEN 1 ELSE 0 END) AS placares_exatos,
        SUM(CASE WHEN j.finalizado = 1
                  AND ((j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                    OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante))
                  AND (p.palpite_gols_casa = j.gols_casa OR p.palpite_gols_visitante = j.gols_visitante)
                  AND NOT (p.palpite_gols_casa = j.gols_casa AND p.palpite_gols_visitante = j.gols_visitante)
                 THEN 1 ELSE 0 END) AS acertos_resultado_gol,
        SUM(CASE WHEN j.finalizado = 1
                  AND ((j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                    OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante))
                  AND p.palpite_gols_casa <> j.gols_casa
                  AND p.palpite_gols_visitante <> j.gols_visitante
                 THEN 1 ELSE 0 END) AS acertos_resultado,
        SUM(CASE WHEN j.finalizado = 1
                  AND NOT (
                    (j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                    OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante)
                    OR (j.gols_casa = j.gols_visitante AND p.palpite_gols_casa = p.palpite_gols_visitante)
                  )
                  AND (p.palpite_gols_casa = j.gols_casa OR p.palpite_gols_visitante = j.gols_visitante)
                 THEN 1 ELSE 0 END) AS acertos_gol,
        -- Gols certos: +1 por gol de cada time que o palpite acertou exatamente
        SUM(CASE WHEN j.finalizado = 1 AND p.palpite_gols_casa = j.gols_casa THEN 1 ELSE 0 END) +
        SUM(CASE WHEN j.finalizado = 1 AND p.palpite_gols_visitante = j.gols_visitante THEN 1 ELSE 0 END) AS gols_acertados
      FROM usuarios u
      LEFT JOIN palpites p ON p.usuario_id = u.id
      LEFT JOIN jogos j ON j.id = p.jogo_id
      LEFT JOIN fase_pontuacao fp ON fp.fase = j.fase
      WHERE u.excluir_ranking = 0
      GROUP BY u.id
      -- Critérios de desempate (do mais forte pro mais fraco):
      -- 1) total_pontos, 2) placares exatos, 3) resultado+gol, 4) resultado,
      -- 5) gols certos, 6) 1 gol certo, 7) palpites pontuados, 8) nome
      ORDER BY total_pontos DESC,
               placares_exatos DESC,
               acertos_resultado_gol DESC,
               acertos_resultado DESC,
               gols_acertados DESC,
               acertos_gol DESC,
               palpites_com_pontos DESC,
               u.nome ASC
    `);

    // A consulta já está ordenada por todos os critérios de desempate.
    // Portanto, cada participante recebe sua posição final nessa ordem.
    ranking.forEach((u, idx) => {
      u.posicao = idx + 1;
    });

    // Calcula totais
    const totais = await get(`
      SELECT
        (SELECT COUNT(*) FROM usuarios WHERE excluir_ranking = 0) AS total_usuarios,
        (SELECT COUNT(*) FROM jogos) AS total_jogos,
        (SELECT COUNT(*) FROM jogos WHERE finalizado = 1) AS jogos_finalizados,
        (SELECT COUNT(*) FROM jogos WHERE finalizado = 0) AS jogos_pendentes,
        (SELECT COUNT(*) FROM palpites) AS total_palpites
    `);

    // Busca pontos por rodada para cada usuário
    const pontosPorRodada = await all(`
      SELECT p.usuario_id, j.rodada, SUM(p.pontos_obtidos) AS pontos
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      JOIN usuarios u ON u.id = p.usuario_id
      WHERE u.excluir_ranking = 0
      GROUP BY p.usuario_id, j.rodada
      ORDER BY p.usuario_id, j.rodada
    `);

    // Converte em mapa: usuario_id -> { rodada: pontos }
    const rodadaMap = {};
    pontosPorRodada.forEach(r => {
      if (!rodadaMap[r.usuario_id]) rodadaMap[r.usuario_id] = {};
      rodadaMap[r.usuario_id][r.rodada] = r.pontos;
    });

    // Busca rodadas dinâmicas do banco (em vez de array fixo)
    const fasesRodada = await all(
      'SELECT DISTINCT rodada, fase FROM jogos WHERE fase IS NOT NULL ORDER BY rodada'
    );
    const rodadas = fasesRodada.map(f => f.rodada);
    const faseLabel = { grupo: r => 'R' + r, r32: '16av', r16: '8av', qf: 'QF', sf: 'SF', terceiro: '3º', final: 'Final' };
    const labels = {};
    fasesRodada.forEach(f => {
      const gen = faseLabel[f.fase];
      labels[f.rodada] = typeof gen === 'function' ? gen(f.rodada) : gen;
    });

    // Resultados dos palpites extras
    const extrasResultados = await all(`
      SELECT r.categoria, r.selecao_id, r.pontos, s.nome_pt, s.sigla
      FROM resultados_extras r
      JOIN selecoes s ON s.id = r.selecao_id
      ORDER BY r.categoria
    `);
    const extrasAcertos = await all(`
      SELECT r.categoria, r.selecao_id, pe.usuario_id, u.nome
      FROM resultados_extras r
      JOIN palpites_extras pe ON pe.categoria = r.categoria AND pe.selecao_id = r.selecao_id
      JOIN usuarios u ON u.id = pe.usuario_id
      WHERE u.excluir_ranking = 0
      ORDER BY r.categoria, r.selecao_id, u.nome
    `);
    // Monta mapa: resultado_id -> [usuarios]
    const extrasAcertosMap = {};
    for (const a of extrasAcertos) {
      const key = a.categoria + '_' + a.selecao_id;
      if (!extrasAcertosMap[key]) extrasAcertosMap[key] = [];
      extrasAcertosMap[key].push(a);
    }
    // Monta estrutura por categoria para facilitar a view
    const extrasPorCategoria = {};
    for (const r of extrasResultados) {
      if (!extrasPorCategoria[r.categoria]) extrasPorCategoria[r.categoria] = [];
      const key = r.categoria + '_' + r.selecao_id;
      extrasPorCategoria[r.categoria].push({
        selecao_id: r.selecao_id,
        nome_pt: r.nome_pt,
        sigla: r.sigla,
        pontos: r.pontos,
        acertaram: extrasAcertosMap[key] || []
      });
    }

    // Calcula total de pontos disputados (soma dos pts_exato dos jogos finalizados)
    const totalJogos = await get(`
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
    const totalDisputado = totalJogos?.total || 0;

    // Adiciona aproveitamento a cada participante (somente pontos de jogos, sem extras/bônus)
    for (const u of ranking) {
      const pts = Number(u.palpites_pontos) || 0;
      u.aproveitamento = totalDisputado > 0 ? Math.max(0, Math.min(100, Math.round((pts / totalDisputado) * 100))) : 0;
    }

    // ====== Estatísticas dos jogos concluídos ======
    // Pontos distribuídos em jogos finalizados (soma dos pontos_obtidos)
    const pontosDistribuidos = await get(`
      SELECT COALESCE(SUM(p.pontos_obtidos), 0) AS total,
             COUNT(p.id) AS total_palpites_finalizados,
             COALESCE(MAX(p.pontos_obtidos), 0) AS melhor_palpite_finalizado
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE j.finalizado = 1
    `);

    // Distribuição pelo placar-base; o bônus de classificado não altera o tipo do acerto.
    const tiersFinalizados = await all(`
      SELECT CASE
               WHEN p.palpite_gols_casa = j.gols_casa
                AND p.palpite_gols_visitante = j.gols_visitante
                 THEN 'exato'
               WHEN j.gols_casa = j.gols_visitante
                AND p.palpite_gols_casa = p.palpite_gols_visitante
                 THEN 'empate'
               WHEN (
                    (j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                 OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante)
               ) AND (p.palpite_gols_casa = j.gols_casa OR p.palpite_gols_visitante = j.gols_visitante)
                 THEN 'resultado_gol'
               WHEN (
                    (j.gols_casa > j.gols_visitante AND p.palpite_gols_casa > p.palpite_gols_visitante)
                 OR (j.gols_casa < j.gols_visitante AND p.palpite_gols_casa < p.palpite_gols_visitante)
               )
                 THEN 'resultado'
               WHEN p.palpite_gols_casa = j.gols_casa OR p.palpite_gols_visitante = j.gols_visitante
                 THEN 'gol'
               ELSE 'zero'
             END AS tier
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE j.finalizado = 1
    `);
    const tierCount = { exato: 0, empate: 0, resultado_gol: 0, resultado: 0, gol: 0, zero: 0 };
    for (const t of tiersFinalizados) {
      if (tierCount[t.tier] !== undefined) tierCount[t.tier]++;
    }

    // Quantos usuários distintos pontuaram em jogos finalizados
    const usuariosComPontos = await get(`
      SELECT COUNT(DISTINCT p.usuario_id) AS total
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      WHERE j.finalizado = 1 AND p.pontos_obtidos > 0
    `);

    // Lista compacta dos jogos finalizados (para mostrar no card)
    const jogosConcluidos = await all(`
      SELECT j.id, j.rodada, j.fase, j.gols_casa, j.gols_visitante, j.data,
             sc.sigla AS casa_sigla, sc.nome_pt AS casa_pt, sc.bandeira_url AS casa_bandeira,
             sv.sigla AS visitante_sigla, sv.nome_pt AS visitante_pt, sv.bandeira_url AS visitante_bandeira,
             fp.pts_exato
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN fase_pontuacao fp ON fp.fase = j.fase
      WHERE j.finalizado = 1
      ORDER BY j.data DESC, j.id DESC
      LIMIT 10
    `);

    const statsConcluidos = {
      jogosFinalizados: totais?.jogos_finalizados || 0,
      pontosPossiveis: totalDisputado,
      pontosDistribuidos: pontosDistribuidos?.total || 0,
      totalPalpitesFinalizados: pontosDistribuidos?.total_palpites_finalizados || 0,
      melhorPalpiteFinalizado: pontosDistribuidos?.melhor_palpite_finalizado || 0,
      placaresExatos: tierCount.exato,
      empates: tierCount.empate,
      acertosResultado: tierCount.resultado + tierCount.resultado_gol,
      acertosGol: tierCount.gol,
      zeros: tierCount.zero,
      usuariosComPontos: usuariosComPontos?.total || 0,
      mediaPontosPorPalpite: pontosDistribuidos?.total_palpites_finalizados > 0
        ? ((pontosDistribuidos.total / pontosDistribuidos.total_palpites_finalizados).toFixed(2))
        : 0,
      aproveitamentoMedio: totalDisputado > 0
        ? Math.round((pontosDistribuidos.total / (totalDisputado * (totais.total_usuarios || 1))) * 100)
        : 0,
      jogosConcluidos
    };

    // Busca detalhes dos bônus (motivo) para tooltip
    const bonusDetalhes = await all('SELECT usuario_id, pontos, motivo FROM pontos_bonus ORDER BY usuario_id, criado_em');
    const bonusMap = {};
    for (const b of bonusDetalhes) {
      if (!bonusMap[b.usuario_id]) bonusMap[b.usuario_id] = [];
      bonusMap[b.usuario_id].push(b);
    }

    // Busca premiações (1º/2º/3º lugar)
    const premiosRows = await all("SELECT chave, valor FROM config WHERE chave LIKE 'premio_%'");
    const premios = { premio_1: '300.00', premio_2: '125.00', premio_3: '75.00' };
    for (const r of premiosRows) premios[r.chave] = r.valor;

    // Pontuação por fase (para o card de regras do ranking)
    const pontuacaoFases = await all('SELECT * FROM fase_pontuacao ORDER BY CASE fase WHEN \'grupo\' THEN 1 WHEN \'r32\' THEN 2 WHEN \'r16\' THEN 3 WHEN \'qf\' THEN 4 WHEN \'sf\' THEN 5 WHEN \'terceiro\' THEN 6 WHEN \'final\' THEN 7 END');
    const faseLabelCompleto = { grupo: 'Fase de Grupos', r32: '16 avos de Final', r16: 'Oitavas de Final', qf: 'Quartas de Final', sf: 'Semifinal', terceiro: 'Disputa de 3º lugar', final: 'Final' };

    res.render('ranking', {
      title: 'Ranking do Bolão',
      ranking, totais, rodadaMap, rodadas, labels,
      extrasResultados, extrasPorCategoria, CATEGORIAS,
      totalDisputado, bonusMap, statsConcluidos,
      premios, pontuacaoFases, faseLabelCompleto
    });
  } catch (err) {
    console.error('Erro ao listar ranking:', err);
    req.flash('erro', 'Erro ao carregar ranking.');
    res.redirect('/');
  }
});

// GET /ranking/usuario/:id - mostra os palpites de um usuário específico
router.get('/usuario/:id', async (req, res) => {
  const usuarioId = parseInt(req.params.id, 10);
  if (isNaN(usuarioId)) return res.redirect('/ranking');

  try {
    const usuario = await get('SELECT id, nome, foto, criado_em FROM usuarios WHERE id = ?', [usuarioId]);
    if (!usuario) {
      req.flash('erro', 'Usuário não encontrado.');
      return res.redirect('/ranking');
    }

    const palpites = await all(`
      SELECT
        j.id, j.rodada, j.data, j.finalizado, j.gols_casa, j.gols_visitante, j.fase,
        j.palpite_limite,
        j.gols_casa_pror, j.gols_visitante_pror,
        j.placar_penaltis_casa, j.placar_penaltis_visitante,
        j.selecao_casa_id, j.selecao_visitante_id, j.classificado_id,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla,
        p.palpite_gols_casa, p.palpite_gols_visitante, p.palpite_classificado_id, p.pontos_obtidos,
        cc.nome_pt AS classificado_pt
      FROM palpites p
      JOIN jogos j ON j.id = p.jogo_id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      LEFT JOIN selecoes cc ON j.classificado_id = cc.id
      WHERE p.usuario_id = ?
      ORDER BY j.rodada, j.data, j.id
    `, [usuarioId]);

    const stats = await get(`
      SELECT
        COUNT(*) AS total,
        COALESCE(SUM(pontos_obtidos), 0) AS pontos,
        SUM(CASE WHEN pontos_obtidos > 0 THEN 1 ELSE 0 END) AS acertos
      FROM palpites WHERE usuario_id = ?
    `, [usuarioId]);

    const bonusRow = await get('SELECT COALESCE(SUM(pontos), 0) AS total FROM pontos_bonus WHERE usuario_id = ?', [usuarioId]);
    const extrasPontosRow = await get(`
      SELECT COALESCE(SUM(r.pontos), 0) AS total
      FROM palpites_extras pe
      JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
      WHERE pe.usuario_id = ?
    `, [usuarioId]);

    // Busca palpites extras (só passa pro view se tiver)
    const extras = await all(
      'SELECT pe.categoria, pe.selecao_id, s.nome_pt FROM palpites_extras pe LEFT JOIN selecoes s ON s.id = pe.selecao_id WHERE pe.usuario_id = ? ORDER BY pe.categoria',
      [usuarioId]
    );

    const extrasDeadline = await get("SELECT valor FROM config WHERE chave = 'extras_data_limite'");
    const extrasPrazo = extrasDeadline ? new Date(extrasDeadline.valor) : new Date('2026-06-11T15:55-03:00');
    const extrasLiberado = new Date() >= extrasPrazo;

    // Calcula aproveitamento
    const totalJogos = await get(`
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
    const totalExtras = await get('SELECT COALESCE(SUM(pontos), 0) AS total FROM resultados_extras');
    const totalDisputado = (totalJogos?.total || 0) + (totalExtras?.total || 0);
    // Aproveitamento mede somente pontos competitivos: jogos + extras. Bônus administrativos ficam fora.
    const totalUsuarioCompetitivo = (stats?.pontos || 0) + (extrasPontosRow?.total || 0);
    const aproveitamento = totalDisputado > 0
      ? Math.max(0, Math.min(100, Math.round((totalUsuarioCompetitivo / totalDisputado) * 100)))
      : 0;

    res.render('palpites-usuario', {
      title: `Palpites de ${usuario.nome}`,
      usuario, palpites, stats,
      bonusPontos: bonusRow?.total || 0,
      extrasPontos: extrasPontosRow?.total || 0,
      totalDisputado,
      aproveitamento,
      agora: new Date(),
      extras, extrasLiberado, extrasPrazo,
      CATEGORIAS
    });
  } catch (err) {
    console.error('Erro ao listar palpites do usuário:', err);
    req.flash('erro', 'Erro ao carregar palpites.');
    res.redirect('/ranking');
  }
});

module.exports = router;
