const { all, get } = require('../database/db');

function pts(g) {
  return (g.vitorias || 0) * 3 + (g.empates || 0);
}

function ordenarGrupo(selecoes) {
  return selecoes.sort((a, b) => {
    if (pts(b) !== pts(a)) return pts(b) - pts(a);
    if ((b.saldo_gols || 0) !== (a.saldo_gols || 0)) return (b.saldo_gols || 0) - (a.saldo_gols || 0);
    return (b.gols_pro || 0) - (a.gols_pro || 0);
  }).map((s, i) => ({ ...s, posicao: i + 1 }));
}

async function classificarGrupo(grupoId) {
  const selecoes = await all(
    'SELECT id, nome, nome_pt, sigla, bandeira_url FROM selecoes WHERE grupo_id = ?',
    [grupoId]
  );

  const resultados = {};
  for (const s of selecoes) {
    resultados[s.id] = { ...s, pontos: 0, vitorias: 0, empates: 0, derrotas: 0, gols_pro: 0, gols_contra: 0, saldo_gols: 0, jogos: 0 };
  }

  const jogos = await all(
    'SELECT selecao_casa_id, selecao_visitante_id, gols_casa, gols_visitante FROM jogos WHERE grupo_id = ? AND finalizado = 1',
    [grupoId]
  );

  for (const j of jogos) {
    const gc = j.gols_casa;
    const gv = j.gols_visitante;
    if (gc === null || gv === null) continue;

    if (resultados[j.selecao_casa_id]) {
      resultados[j.selecao_casa_id].gols_pro += gc;
      resultados[j.selecao_casa_id].gols_contra += gv;
      resultados[j.selecao_casa_id].jogos += 1;
      if (gc > gv) { resultados[j.selecao_casa_id].vitorias += 1; }
      else if (gc === gv) { resultados[j.selecao_casa_id].empates += 1; }
      else { resultados[j.selecao_casa_id].derrotas += 1; }
    }
    if (resultados[j.selecao_visitante_id]) {
      resultados[j.selecao_visitante_id].gols_pro += gv;
      resultados[j.selecao_visitante_id].gols_contra += gc;
      resultados[j.selecao_visitante_id].jogos += 1;
      if (gv > gc) { resultados[j.selecao_visitante_id].vitorias += 1; }
      else if (gv === gc) { resultados[j.selecao_visitante_id].empates += 1; }
      else { resultados[j.selecao_visitante_id].derrotas += 1; }
    }
  }

  const lista = Object.values(resultados).map(r => ({
    ...r,
    pontos: r.vitorias * 3 + r.empates,
    saldo_gols: r.gols_pro - r.gols_contra
  }));

  return ordenarGrupo(lista);
}

async function classificarTodosGrupos() {
  const grupos = await all('SELECT id, letra FROM grupos ORDER BY letra');
  const grupoIds = grupos.map(g => g.id);

  const [todasSelecoes, todosJogos] = await Promise.all([
    all(`SELECT id, nome, nome_pt, sigla, bandeira_url, grupo_id FROM selecoes WHERE grupo_id IN (${grupoIds.map(() => '?').join(',')})`, grupoIds),
    all(`SELECT selecao_casa_id, selecao_visitante_id, gols_casa, gols_visitante, grupo_id FROM jogos WHERE grupo_id IN (${grupoIds.map(() => '?').join(',')}) AND finalizado = 1`, grupoIds),
  ]);

  const selecoesPorGrupo = {};
  for (const s of todasSelecoes) {
    if (!selecoesPorGrupo[s.grupo_id]) selecoesPorGrupo[s.grupo_id] = [];
    selecoesPorGrupo[s.grupo_id].push(s);
  }

  const jogosPorGrupo = {};
  for (const j of todosJogos) {
    if (!jogosPorGrupo[j.grupo_id]) jogosPorGrupo[j.grupo_id] = [];
    jogosPorGrupo[j.grupo_id].push(j);
  }

  const resultado = {};
  for (const g of grupos) {
    resultado[g.letra] = processarGrupo(g.id, selecoesPorGrupo[g.id] || [], jogosPorGrupo[g.id] || []);
  }
  return resultado;
}

function processarGrupo(grupoId, selecoes, jogos) {
  const resultados = {};
  for (const s of selecoes) {
    resultados[s.id] = { ...s, pontos: 0, vitorias: 0, empates: 0, derrotas: 0, gols_pro: 0, gols_contra: 0, saldo_gols: 0, jogos: 0 };
  }

  for (const j of jogos) {
    const gc = j.gols_casa;
    const gv = j.gols_visitante;
    if (gc === null || gv === null) continue;

    if (resultados[j.selecao_casa_id]) {
      resultados[j.selecao_casa_id].gols_pro += gc;
      resultados[j.selecao_casa_id].gols_contra += gv;
      resultados[j.selecao_casa_id].jogos += 1;
      if (gc > gv) resultados[j.selecao_casa_id].vitorias += 1;
      else if (gc === gv) resultados[j.selecao_casa_id].empates += 1;
      else resultados[j.selecao_casa_id].derrotas += 1;
    }
    if (resultados[j.selecao_visitante_id]) {
      resultados[j.selecao_visitante_id].gols_pro += gv;
      resultados[j.selecao_visitante_id].gols_contra += gc;
      resultados[j.selecao_visitante_id].jogos += 1;
      if (gv > gc) resultados[j.selecao_visitante_id].vitorias += 1;
      else if (gv === gc) resultados[j.selecao_visitante_id].empates += 1;
      else resultados[j.selecao_visitante_id].derrotas += 1;
    }
  }

  return ordenarGrupo(Object.values(resultados).map(r => ({
    ...r,
    pontos: r.vitorias * 3 + r.empates,
    saldo_gols: r.gols_pro - r.gols_contra
  })));
}

async function terceirosColocados() {
  const grupos = await all('SELECT id, letra FROM grupos ORDER BY letra');
  const resultado = await classificarTodosGrupos();
  const terceiros = [];
  for (const g of grupos) {
    const classif = resultado[g.letra];
    if (classif.length >= 3) {
      terceiros.push({ ...classif[2], grupo_letra: g.letra });
    }
  }
  return terceiros.sort((a, b) => {
    if (pts(b) !== pts(a)) return pts(b) - pts(a);
    if ((b.saldo_gols || 0) !== (a.saldo_gols || 0)) return (b.saldo_gols || 0) - (a.saldo_gols || 0);
    return (b.gols_pro || 0) - (a.gols_pro || 0);
  });
}

async function obterVencedor(jogoId) {
  const jogo = await get(
    'SELECT selecao_casa_id, selecao_visitante_id, gols_casa, gols_visitante, finalizado, classificado_id FROM jogos WHERE id = ?',
    [jogoId]
  );
  if (!jogo || !jogo.finalizado) return null;
  if (jogo.gols_casa === null || jogo.gols_visitante === null) return null;
  if (jogo.gols_casa > jogo.gols_visitante) return jogo.selecao_casa_id;
  if (jogo.gols_visitante > jogo.gols_casa) return jogo.selecao_visitante_id;
  // Empate no tempo regulamentar: classificado_id decide (definido pelo admin se houve prorrogação/pênaltis)
  return jogo.classificado_id || null;
}

async function obterPerdedor(jogoId) {
  const jogo = await get(
    'SELECT selecao_casa_id, selecao_visitante_id, gols_casa, gols_visitante, finalizado, classificado_id FROM jogos WHERE id = ?',
    [jogoId]
  );
  if (!jogo || !jogo.finalizado) return null;
  if (jogo.gols_casa === null || jogo.gols_visitante === null) return null;
  if (jogo.gols_casa < jogo.gols_visitante) return jogo.selecao_casa_id;
  if (jogo.gols_visitante < jogo.gols_casa) return jogo.selecao_visitante_id;
  // Empate: classificado_id indica quem avançou, perdedor é o outro
  if (jogo.classificado_id) {
    if (jogo.classificado_id === jogo.selecao_casa_id) return jogo.selecao_visitante_id;
    if (jogo.classificado_id === jogo.selecao_visitante_id) return jogo.selecao_casa_id;
  }
  return null;
}

module.exports = { classificarGrupo, classificarTodosGrupos, terceirosColocados, obterVencedor, obterPerdedor };