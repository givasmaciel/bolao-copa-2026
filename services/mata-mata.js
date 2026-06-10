const { all, get, run } = require('../database/db');
const { classificarGrupo, terceirosColocados, obterVencedor, obterPerdedor } = require('./classificacao');

const GRUPO_LETRA_POR_ID = {};
async function carregarGrupos() {
  const grupos = await all('SELECT id, letra FROM grupos');
  for (const g of grupos) GRUPO_LETRA_POR_ID[g.id] = g.letra;
}

async function obterTimeNoGrupo(selecaoId) {
  const s = await get('SELECT id, nome_pt, sigla, bandeira_url FROM selecoes WHERE id = ?', [selecaoId]);
  return s || null;
}

async function melhorTerceiro(gruposLetras, todosTerceiros) {
  const filtrados = todosTerceiros.filter(t => gruposLetras.includes(t.grupo_letra));
  return filtrados.length > 0 ? filtrados[0] : null;
}

async function resolverDescricao(descricao) {
  // Padrão: "2ºA vs 2ºB"
  const matchPos = descricao.match(/^(\d)º([A-L])\s+vs\s+(\d)º([A-L])$/);
  if (matchPos) {
    const pos1 = parseInt(matchPos[1]);
    const letra1 = matchPos[2];
    const pos2 = parseInt(matchPos[3]);
    const letra2 = matchPos[4];
    const grupo1 = await all('SELECT id FROM grupos WHERE letra = ?', [letra1]);
    const grupo2 = await all('SELECT id FROM grupos WHERE letra = ?', [letra2]);
    if (!grupo1[0] || !grupo2[0]) return { casa: null, visitante: null };
    const classif1 = await classificarGrupo(grupo1[0].id);
    const classif2 = await classificarGrupo(grupo2[0].id);
    return {
      casa: classif1[pos1 - 1]?.id || null,
      visitante: classif2[pos2 - 1]?.id || null
    };
  }

  // Padrão: "1ºX vs 3ºA/B/C..."
  const matchTerceiro = descricao.match(/^1º([A-L])\s+vs\s+3º([A-L/]+)$/);
  if (matchTerceiro) {
    const letra1 = matchTerceiro[1];
    const gruposTerceiro = matchTerceiro[2].split('/');
    const grupo1 = await all('SELECT id FROM grupos WHERE letra = ?', [letra1]);
    if (!grupo1[0]) return { casa: null, visitante: null };
    const classif1 = await classificarGrupo(grupo1[0].id);
    const todosTerceiros = await terceirosColocados();
    const melhorT = await melhorTerceiro(gruposTerceiro, todosTerceiros);
    return {
      casa: classif1[0]?.id || null,
      visitante: melhorT?.id || null
    };
  }

  // Padrão: "Vencedor X vs Vencedor Y"
  const matchVencedor = descricao.match(/^Vencedor\s+(\d+)\s+vs\s+Vencedor\s+(\d+)$/);
  if (matchVencedor) {
    const id1 = parseInt(matchVencedor[1]);
    const id2 = parseInt(matchVencedor[2]);
    const v1 = await obterVencedor(id1);
    const v2 = await obterVencedor(id2);
    return { casa: v1, visitante: v2 };
  }

  // Padrão: "Perdedor X vs Perdedor Y"
  const matchPerdedor = descricao.match(/^Perdedor\s+(\d+)\s+vs\s+Perdedor\s+(\d+)$/);
  if (matchPerdedor) {
    const id1 = parseInt(matchPerdedor[1]);
    const id2 = parseInt(matchPerdedor[2]);
    const p1 = await obterPerdedor(id1);
    const p2 = await obterPerdedor(id2);
    return { casa: p1, visitante: p2 };
  }

  return { casa: null, visitante: null };
}

async function gerarMataMata() {
  await carregarGrupos();

  const jogosMM = await all(
    "SELECT id, descricao, selecao_casa_id, selecao_visitante_id, finalizado FROM jogos WHERE fase != 'grupo' ORDER BY id"
  );

  const resultados = [];
  for (const jogo of jogosMM) {
    if (!jogo.descricao) continue;

    const { casa, visitante } = await resolverDescricao(jogo.descricao);

    const mudouCasa = casa !== null && casa !== jogo.selecao_casa_id && !jogo.finalizado;
    const mudouVisitante = visitante !== null && visitante !== jogo.selecao_visitante_id && !jogo.finalizado;

    if (mudouCasa || mudouVisitante) {
      await run('UPDATE jogos SET selecao_casa_id = ?, selecao_visitante_id = ? WHERE id = ? AND finalizado = 0',
        [mudouCasa ? casa : jogo.selecao_casa_id, mudouVisitante ? visitante : jogo.selecao_visitante_id, jogo.id]);
    }

    resultados.push({
      id: jogo.id,
      descricao: jogo.descricao,
      casa_id: mudouCasa ? casa : jogo.selecao_casa_id,
      visitante_id: mudouVisitante ? visitante : jogo.selecao_visitante_id,
      atualizado: mudouCasa || mudouVisitante
    });
  }

  return resultados;
}

async function listarConfrontos() {
  await carregarGrupos();
  const jogosMM = await all(`
    SELECT j.id, j.fase, j.rodada, j.descricao, j.data, j.finalizado,
           j.gols_casa, j.gols_visitante,
           j.selecao_casa_id AS casa_id, j.selecao_visitante_id AS visitante_id,
           sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
           sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira
    FROM jogos j
    LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
    LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
    WHERE j.fase != 'grupo'
    ORDER BY j.id
  `);
  return jogosMM;
}

module.exports = { gerarMataMata, listarConfrontos };