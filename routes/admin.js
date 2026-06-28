const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../database/db');
const { verificarAdmin } = require('../middleware/auth');
const { gerarMataMata, listarConfrontos, limparMataMata } = require('../services/mata-mata');
const { calcularPontos, calcularPontosMataMata } = require('../services/pontuacao');
const logger = require('../logger');

const router = express.Router();

// GET /admin/diagnostic - verifica estado do banco (acesso sem login, use chave)
router.get('/diagnostic', async (req, res) => {
  if (!process.env.DIAGNOSTIC_KEY) return res.status(404).send('Diagnóstico desabilitado');
  if (req.query.chave !== process.env.DIAGNOSTIC_KEY) {
    return res.status(403).send('Acesso negado');
  }
  try {
    const usandoPG = !!process.env.DATABASE_URL;
    const totalUsers = await get('SELECT COUNT(*) AS total FROM usuarios');
    const adminEmailDiagnostic = process.env.ADMIN_DIAG_EMAIL || (process.env.ADMIN_EMAIL || '');
    const adminUser = adminEmailDiagnostic ? await get("SELECT id, email, is_admin, length(senha_hash) AS hash_len, substring(senha_hash, 1, 30) AS hash_inicio FROM usuarios WHERE email = ?", [adminEmailDiagnostic]) : null;
    const envEmail = process.env.ADMIN_EMAIL || '(não definido)';
    const envSenhaLen = (process.env.ADMIN_SENHA || '').length;

    const adminSenha = process.env.ADMIN_SENHA || '';
    let senhaOk = false;
    if (adminUser && adminSenha) {
      const fullUser = await get("SELECT senha_hash FROM usuarios WHERE email = ?", [adminEmailDiagnostic]);
      senhaOk = await bcrypt.compare(adminSenha, fullUser.senha_hash);
    }

    res.json({
      usandoPG,
      total_usuarios: totalUsers?.total || 0,
      admin: adminUser ? {
        id: adminUser.id,
        email: adminUser.email,
        is_admin: adminUser.is_admin,
        hash_len: adminUser.hash_len
      } : null,
      env: {
        ADMIN_EMAIL: envEmail,
        ADMIN_SENHA_length: envSenhaLen
      },
      senha_ok: senhaOk
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Busca configuração de pontuação para uma fase
async function getPontosFase(fase) {
  const row = await get('SELECT * FROM fase_pontuacao WHERE fase = ?', [fase]);
  return row || require('../services/pontuacao').PONTUACAO_PADRAO;
}

// GET /admin - painel principal
router.get('/', verificarAdmin, async (req, res) => {
  try {
    const totais = await get(`
      SELECT
        (SELECT COUNT(*) FROM jogos) AS total_jogos,
        (SELECT COUNT(*) FROM jogos WHERE fase = 'grupo' AND finalizado = 1) AS jogos_finalizados,
        (SELECT COUNT(*) FROM jogos WHERE finalizado = 0 AND data < ${process.env.DATABASE_URL ? 'NOW()' : "datetime('now')"}) AS jogos_pendentes,
        (SELECT COUNT(*) FROM usuarios) AS total_usuarios,
        (SELECT COUNT(*) FROM palpites) AS total_palpites
    `);

    const proximosJogos = await all(`
      SELECT j.id, j.data, j.finalizado, j.gols_casa, j.gols_visitante,
             sc.nome_pt AS casa_pt, sv.nome_pt AS visitante_pt
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      ORDER BY j.data DESC
      LIMIT 10
    `);

    const resumoRanking = await all(`
      SELECT u.nome,
        COALESCE(SUM(p.pontos_obtidos), 0) + COALESCE((
          SELECT SUM(r.pontos)
          FROM palpites_extras pe
          JOIN resultados_extras r ON r.categoria = pe.categoria AND r.selecao_id = pe.selecao_id
          WHERE pe.usuario_id = u.id
        ), 0) + COALESCE((SELECT SUM(pontos) FROM pontos_bonus WHERE usuario_id = u.id), 0) AS pontos
      FROM usuarios u
      LEFT JOIN palpites p ON p.usuario_id = u.id
      GROUP BY u.id
      ORDER BY pontos DESC
      LIMIT 5
    `);

    res.render('admin', { title: 'Painel Admin', totais, proximosJogos, resumoRanking });
  } catch (err) {
    console.error('Erro no admin:', err);
    req.flash('erro', 'Erro ao carregar painel.');
    res.redirect('/');
  }
});

// GET /admin/jogos - lista de jogos para editar resultados
router.get('/jogos', verificarAdmin, async (req, res) => {
  try {
    const jogos = await all(`
      SELECT j.id, j.fase, j.rodada, j.data, j.finalizado, j.gols_casa, j.gols_visitante, j.palpite_limite,
             j.gols_casa_pror, j.gols_visitante_pror,
             j.placar_penaltis_casa, j.placar_penaltis_visitante,
             j.selecao_casa_id, j.selecao_visitante_id, j.classificado_id,
             g.letra AS grupo_letra,
             sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla,
             sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      ORDER BY CASE WHEN j.gols_casa IS NOT NULL OR j.gols_visitante IS NOT NULL OR j.finalizado = 1 THEN 1 ELSE 0 END, j.data
    `);

    res.render('admin-jogos', { title: 'Editar resultados', jogos, query: req.query });
  } catch (err) {
    console.error('Erro ao listar jogos admin:', err);
    req.flash('erro', 'Erro ao carregar jogos.');
    res.redirect('/admin');
  }
});

// POST /admin/jogos/:id - atualiza resultado de um jogo e recalcula pontos
router.post('/jogos/:id', verificarAdmin, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  const { gols_casa, gols_visitante, finalizado } = req.body;

  if (isNaN(jogoId)) return res.redirect('/admin/jogos');

  try {
    const jogo = await get('SELECT * FROM jogos WHERE id = ?', [jogoId]);
    if (!jogo) {
      req.flash('erro', 'Jogo não encontrado.');
      return res.redirect('/admin/jogos');
    }

    const gc = gols_casa === '' || gols_casa === null ? null : parseInt(gols_casa, 10);
    const gv = gols_visitante === '' || gols_visitante === null ? null : parseInt(gols_visitante, 10);
    const fin = finalizado === '1' ? 1 : 0;

    if (fin === 1 && (gc === null || gv === null || isNaN(gc) || isNaN(gv))) {
      req.flash('erro', 'Para finalizar, informe o placar.');
      return res.redirect('/admin/jogos');
    }

    // Mata-mata: processa prorrogação, pênaltis e classificado
    const ehMataMata = jogo.fase !== 'grupo';
    let gcPror = null, gvPror = null, penCasa = null, penVisit = null, classificadoId = null;

    if (ehMataMata) {
      gcPror = req.body.gols_casa_pror === '' || req.body.gols_casa_pror == null ? null : parseInt(req.body.gols_casa_pror, 10);
      gvPror = req.body.gols_visitante_pror === '' || req.body.gols_visitante_pror == null ? null : parseInt(req.body.gols_visitante_pror, 10);
      penCasa = req.body.placar_penaltis_casa === '' || req.body.placar_penaltis_casa == null ? null : parseInt(req.body.placar_penaltis_casa, 10);
      penVisit = req.body.placar_penaltis_visitante === '' || req.body.placar_penaltis_visitante == null ? null : parseInt(req.body.placar_penaltis_visitante, 10);
      classificadoId = req.body.classificado_id && req.body.classificado_id !== '' ? parseInt(req.body.classificado_id, 10) : null;

      // Validação: placar 90 min empatado em mata-mata exige classificado definido
      const placarEmpate = gc !== null && gv !== null && gc === gv;
      if (fin === 1 && placarEmpate && !classificadoId) {
        req.flash('erro', 'Mata-mata com placar empatado: informe quem classificou (prorrogação/pênaltis).');
        return res.redirect('/admin/jogos');
      }
      // Jogo decidido nos 90 minutos não usa classificado/prorrogação/pênaltis.
      const temDadosDesempate = classificadoId
        || gcPror !== null || gvPror !== null
        || penCasa !== null || penVisit !== null;
      if (fin === 1 && !placarEmpate && temDadosDesempate) {
        req.flash('erro', 'Jogo decidido nos 90 minutos: não informe prorrogação, pênaltis ou classificado.');
        return res.redirect('/admin/jogos');
      }

      // Sanity check: classificado deve ser um dos dois times
      if (classificadoId && classificadoId !== jogo.selecao_casa_id && classificadoId !== jogo.selecao_visitante_id) {
        req.flash('erro', 'Quem classificou deve ser um dos dois times do confronto.');
        return res.redirect('/admin/jogos');
      }
    }

    await run(
      `UPDATE jogos
       SET gols_casa = ?, gols_visitante = ?, finalizado = ?,
           gols_casa_pror = ?, gols_visitante_pror = ?,
           placar_penaltis_casa = ?, placar_penaltis_visitante = ?,
           classificado_id = ?
       WHERE id = ?`,
      [gc, gv, fin, gcPror, gvPror, penCasa, penVisit, classificadoId, jogoId]
    );

    // Recalcula pontos dos palpites desse jogo
    if (fin === 1 && gc !== null && gv !== null) {
      const ptsConfig = await getPontosFase(jogo.fase);
      const palpites = await all(
        'SELECT id, palpite_gols_casa, palpite_gols_visitante, palpite_classificado_id FROM palpites WHERE jogo_id = ?',
        [jogoId]
      );
      const isMataMata = jogo.fase !== 'grupo';
      const jogoComResultado = { ...jogo, gols_casa: gc, gols_visitante: gv, classificado_id: classificadoId };
      for (const p of palpites) {
        let pontos;
        if (isMataMata) {
          pontos = calcularPontosMataMata(jogoComResultado, p.palpite_gols_casa, p.palpite_gols_visitante, p.palpite_classificado_id, ptsConfig);
        } else {
          pontos = calcularPontos(gc, gv, p.palpite_gols_casa, p.palpite_gols_visitante, ptsConfig);
        }
        await run('UPDATE palpites SET pontos_obtidos = ? WHERE id = ?', [pontos, p.id]);
      }
    } else {
      // Se "desfinalizou" ou limpou placar, zera pontos desse jogo
      await run('UPDATE palpites SET pontos_obtidos = 0 WHERE jogo_id = ?', [jogoId]);
    }

    req.flash('sucesso', 'Resultado atualizado e pontos recalculados!');
    res.redirect('/admin/jogos');
  } catch (err) {
    console.error('Erro ao atualizar jogo:', err);
    req.flash('erro', 'Erro ao atualizar.');
    res.redirect('/admin/jogos');
  }
});

// POST /admin/recalcular - recalcula todos os pontos
router.post('/recalcular', verificarAdmin, async (req, res) => {
  try {
    const [jogos, todasFases] = await Promise.all([
      all('SELECT id, fase, gols_casa, gols_visitante, classificado_id FROM jogos WHERE finalizado = 1'),
      all('SELECT * FROM fase_pontuacao')
    ]);
    const ptsCache = {};
    for (const f of todasFases) ptsCache[f.fase] = f;
    const ids = jogos.map(j => j.id);
    if (ids.length === 0) {
      req.flash('aviso', 'Nenhum jogo finalizado para recalcular.');
      return res.redirect('/admin');
    }
    const todosPalpites = await all(
      `SELECT id, jogo_id, palpite_gols_casa, palpite_gols_visitante, palpite_classificado_id FROM palpites WHERE jogo_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const palpitesPorJogo = {};
    for (const p of todosPalpites) {
      if (!palpitesPorJogo[p.jogo_id]) palpitesPorJogo[p.jogo_id] = [];
      palpitesPorJogo[p.jogo_id].push(p);
    }
    let total = 0;
    for (const j of jogos) {
      const ptsConfig = ptsCache[j.fase] || { pts_exato: 20, pts_empate: 14, pts_resultado_gol: 14, pts_resultado: 8, pts_gol: 3, pts_classificado: 0 };
      const palpites = palpitesPorJogo[j.id] || [];
      const isMataMata = j.fase !== 'grupo';
      for (const p of palpites) {
        let pontos;
        if (isMataMata) {
          pontos = calcularPontosMataMata(j, p.palpite_gols_casa, p.palpite_gols_visitante, p.palpite_classificado_id, ptsConfig);
        } else {
          pontos = calcularPontos(j.gols_casa, j.gols_visitante, p.palpite_gols_casa, p.palpite_gols_visitante, ptsConfig);
        }
        await run('UPDATE palpites SET pontos_obtidos = ? WHERE id = ?', [pontos, p.id]);
        total++;
      }
    }
    req.flash('sucesso', `${total} palpites recalculados!`);
    res.redirect('/admin');
  } catch (err) {
    console.error('Erro ao recalcular:', err);
    req.flash('erro', 'Erro ao recalcular.');
    res.redirect('/admin');
  }
});

// GET /admin/usuarios - gerenciar participantes
router.get('/usuarios', verificarAdmin, async (req, res) => {
  try {
    const usuarios = await all(`
      SELECT u.id, u.nome, u.email, u.username, u.foto, u.is_admin, u.criado_em,
        COALESCE((SELECT SUM(pontos) FROM pontos_bonus WHERE usuario_id = u.id), 0) AS total_bonus
      FROM usuarios u ORDER BY u.nome
    `);
    // Busca histórico de bônus de cada usuário
    const userIds = usuarios.map(u => u.id);
    const todosBonuses = userIds.length > 0
      ? await all(`SELECT id, usuario_id, pontos, motivo, criado_em FROM pontos_bonus WHERE usuario_id IN (${userIds.map(() => '?').join(',')}) ORDER BY criado_em DESC`, userIds)
      : [];
    const bonusMap = {};
    for (const b of todosBonuses) {
      if (!bonusMap[b.usuario_id]) bonusMap[b.usuario_id] = [];
      bonusMap[b.usuario_id].push(b);
    }
    res.render('admin-usuarios', { title: 'Gerenciar participantes', usuarios, bonusMap });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/admin');
  }
});

// POST /admin/usuarios/:id/tornar-admin
router.post('/usuarios/:id/tornar-admin', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  try {
    await run('UPDATE usuarios SET is_admin = 1 WHERE id = ?', [id]);
    req.flash('sucesso', 'Usuário promovido a admin.');
  } catch (err) {
    req.flash('erro', 'Erro ao promover.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/rebaixar
router.post('/usuarios/:id/rebaixar', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  try {
    await run('UPDATE usuarios SET is_admin = 0 WHERE id = ?', [id]);
    req.flash('sucesso', 'Admin rebaixado a participante.');
  } catch (err) {
    req.flash('erro', 'Erro ao rebaixar.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/resetar-palpites
router.post('/usuarios/:id/resetar-palpites', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  try {
    await run('DELETE FROM palpites WHERE usuario_id = ?', [id]);
    await run('DELETE FROM palpites_extras WHERE usuario_id = ?', [id]);
    req.flash('sucesso', 'Palpites do participante foram resetados.');
  } catch (err) {
    req.flash('erro', 'Erro ao resetar.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/resetar-senha
router.post('/usuarios/:id/resetar-senha', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 4) {
    req.flash('erro', 'A senha deve ter pelo menos 4 caracteres.');
    return res.redirect('/admin/usuarios');
  }
  try {
    const hash = await bcrypt.hash(nova_senha, 10);
    await run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, id]);
    req.flash('sucesso', 'Senha do participante foi redefinida.');
  } catch (err) {
    console.error('Erro ao resetar senha:', err);
    req.flash('erro', 'Erro ao redefinir senha.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/resetar-todos-palpites - só reseta palpites de jogos não finalizados + extras se prazo não passou
router.post('/resetar-todos-palpites', verificarAdmin, async (req, res) => {
  try {
    // Só apaga palpites de jogos que ainda não foram finalizados
    await run("DELETE FROM palpites WHERE jogo_id IN (SELECT id FROM jogos WHERE finalizado = 0)");

    // Só apaga palpites extras se a data limite ainda não passou
    const config = await get("SELECT valor FROM config WHERE chave = 'extras_data_limite'");
    const dataLimite = config ? new Date(config.valor) : null;
    if (!dataLimite || new Date() < dataLimite) {
      await run('DELETE FROM palpites_extras');
    }

    // Resultados oficiais (admin) podem ser resetados sempre
    await run('DELETE FROM resultados_extras');

    req.flash('sucesso', 'Palpites pendentes + resultados oficiais resetados (jogos já finalizados e bets após prazo preservados).');
  } catch (err) {
    console.error('Erro ao resetar:', err);
    req.flash('erro', 'Erro ao resetar.');
  }
  res.redirect('/admin');
});

// POST /admin/usuarios/criar - cria um novo participante
router.post('/usuarios/criar', verificarAdmin, async (req, res) => {
  const { nome, email, senha, username } = req.body;
  if (!nome || !email || !senha) {
    req.flash('erro', 'Preencha os campos obrigatórios (nome, e-mail, senha).');
    return res.redirect('/admin/usuarios');
  }
  if (nome.length > 100 || email.length > 255 || senha.length > 100) {
    req.flash('erro', 'Valor muito longo.');
    return res.redirect('/admin/usuarios');
  }
  if (senha.length < 4) {
    req.flash('erro', 'A senha deve ter pelo menos 4 caracteres.');
    return res.redirect('/admin/usuarios');
  }
  try {
    const emailLimpo = email.toLowerCase().trim();
    const existeEmail = await get('SELECT id FROM usuarios WHERE email = ?', [emailLimpo]);
    if (existeEmail) {
      req.flash('erro', 'Já existe um participante com este e-mail.');
      return res.redirect('/admin/usuarios');
    }
    const usernameLimpo = username ? username.trim().toLowerCase() : null;
    if (usernameLimpo) {
      const existeUser = await get('SELECT id FROM usuarios WHERE username = ?', [usernameLimpo]);
      if (existeUser) {
        req.flash('erro', 'Este nome de usuário já está em uso.');
        return res.redirect('/admin/usuarios');
      }
    }
    const hash = await bcrypt.hash(senha, 10);
    await run('INSERT INTO usuarios (nome, email, username, senha_hash, is_admin) VALUES (?, ?, ?, ?, 0)', [
      nome.trim(), emailLimpo, usernameLimpo, hash
    ]);
    req.flash('sucesso', `Participante ${nome} criado com sucesso!`);
  } catch (err) {
    console.error('Erro ao criar participante:', err);
    req.flash('erro', 'Erro ao criar participante.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/alterar-username
router.post('/usuarios/:id/alterar-username', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  const { username } = req.body;
  try {
    const usernameLimpo = username ? username.trim().toLowerCase() : null;
    if (usernameLimpo) {
      const existe = await get('SELECT id FROM usuarios WHERE username = ? AND id != ?', [usernameLimpo, id]);
      if (existe) {
        req.flash('erro', 'Este nome de usuário já está em uso.');
        return res.redirect('/admin/usuarios');
      }
    }
    await run('UPDATE usuarios SET username = ? WHERE id = ?', [usernameLimpo, id]);
    req.flash('sucesso', 'Nome de usuário atualizado.');
  } catch (err) {
    console.error('Erro ao alterar username:', err);
    req.flash('erro', 'Erro ao alterar username.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/excluir
router.post('/usuarios/:id/excluir', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  try {
    await run('DELETE FROM palpites WHERE usuario_id = ?', [id]);
    await run('DELETE FROM palpites_extras WHERE usuario_id = ?', [id]);
    await run('DELETE FROM usuarios WHERE id = ?', [id]);
    req.flash('sucesso', 'Participante excluído.');
  } catch (err) {
    console.error('Erro ao excluir:', err);
    req.flash('erro', 'Erro ao excluir.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/jogos/:id/limite - define prazo personalizado para palpites
router.post('/jogos/:id/limite', verificarAdmin, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  if (isNaN(jogoId)) return res.redirect('/admin/jogos');
  const { palpite_limite } = req.body;
  try {
    if (palpite_limite) {
      // Converte string local BRT para Date UTC
      const partes = palpite_limite.split('T');
      const dataPartes = partes[0].split('-');
      const horaPartes = partes[1].split(':');
      // datetime-local envia no fuso local do browser (BRT)
      // Criamos Date no fuso BRT e salvamos como Date (pg serializa como TIMESTAMPTZ)
      const dataBRT = new Date(
        parseInt(dataPartes[0]), parseInt(dataPartes[1]) - 1, parseInt(dataPartes[2]),
        parseInt(horaPartes[0]), parseInt(horaPartes[1])
      );
      // Ajusta para UTC: BRT é UTC-3
      const dataUTC = new Date(dataBRT.getTime() + 3 * 60 * 60 * 1000);
      await run('UPDATE jogos SET palpite_limite = ? WHERE id = ?', [dataUTC, jogoId]);
      req.flash('sucesso', 'Prazo personalizado definido!');
    } else {
      await run('UPDATE jogos SET palpite_limite = NULL WHERE id = ?', [jogoId]);
      req.flash('sucesso', 'Prazo personalizado removido.');
    }
  } catch (err) {
    console.error('Erro ao definir prazo:', err);
    req.flash('erro', 'Erro ao definir prazo.');
  }
  res.redirect('/admin/jogos');
});

// POST /admin/jogos/:id/limpar-limite - limpa prazo personalizado
router.post('/jogos/:id/limpar-limite', verificarAdmin, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  if (isNaN(jogoId)) return res.redirect('/admin/jogos');
  try {
    await run('UPDATE jogos SET palpite_limite = NULL WHERE id = ?', [jogoId]);
    req.flash('sucesso', 'Prazo personalizado removido.');
  } catch (err) {
    console.error('Erro ao limpar prazo:', err);
    req.flash('erro', 'Erro ao limpar prazo.');
  }
  res.redirect('/admin/jogos');
});

// Converte string datetime-local (interpretada como BRT pelo browser) para Date UTC
function brtLocalStringToUTC(value) {
  // value = "YYYY-MM-DDTHH:MM" (datetime-local)
  const [dataParte, horaParte] = value.split('T');
  const [ano, mes, dia] = dataParte.split('-').map(Number);
  const [hora, min] = horaParte.split(':').map(Number);
  // Cria Date no fuso BRT (UTC-3) e converte para UTC adicionando 3h
  const dataBRTMs = Date.UTC(ano, mes - 1, dia, hora, min);
  return new Date(dataBRTMs + 3 * 60 * 60 * 1000);
}

// POST /admin/jogos/:id/horario - ajusta horário de início e/ou estádio/cidade/país
// Usado para correções pontuais (mudança de data, troca de estádio) sem precisar de deploy.
router.post('/jogos/:id/horario', verificarAdmin, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  if (isNaN(jogoId)) return res.redirect('/admin/jogos');
  const { data, estadio, cidade, pais } = req.body;
  try {
    const jogo = await get('SELECT id, finalizado FROM jogos WHERE id = ?', [jogoId]);
    if (!jogo) {
      req.flash('erro', 'Jogo não encontrado.');
      return res.redirect('/admin/jogos');
    }

    const updates = [];
    const params = [];

    if (data && data.trim() !== '') {
      const dataUTC = brtLocalStringToUTC(data);
      if (isNaN(dataUTC.getTime())) {
        req.flash('erro', 'Data/hora inválida.');
        return res.redirect('/admin/jogos');
      }
      updates.push('data = ?');
      params.push(dataUTC);
    }

    if (typeof estadio === 'string' && estadio.trim() !== '') {
      updates.push('estadio = ?');
      params.push(estadio.trim());
    }
    if (typeof cidade === 'string' && cidade.trim() !== '') {
      updates.push('cidade = ?');
      params.push(cidade.trim());
    }
    if (typeof pais === 'string' && pais.trim() !== '') {
      updates.push('pais = ?');
      params.push(pais.trim());
    }

    if (updates.length === 0) {
      req.flash('aviso', 'Nenhum campo foi alterado.');
      return res.redirect('/admin/jogos');
    }

    params.push(jogoId);
    await run(`UPDATE jogos SET ${updates.join(', ')} WHERE id = ?`, params);
    req.flash('sucesso', 'Horário/estádio atualizado! Os palpites pendentes revalidam o prazo automaticamente.');
  } catch (err) {
    console.error('Erro ao atualizar horário/estádio:', err);
    req.flash('erro', 'Erro ao atualizar horário/estádio.');
  }
  res.redirect('/admin/jogos');
});

// GET /admin/mata-mata - visualizar e editar confrontos do mata-mata
router.get('/mata-mata', verificarAdmin, async (req, res) => {
  try {
    const confrontos = await listarConfrontos();
    const selecoes = await all('SELECT id, nome_pt, sigla FROM selecoes ORDER BY nome_pt');
    res.render('admin-mata-mata', { title: 'Mata-mata', confrontos, selecoes });
  } catch (err) {
    console.error('Erro ao carregar mata-mata:', err);
    req.flash('erro', 'Erro ao carregar confrontos.');
    res.redirect('/admin');
  }
});

// POST /admin/mata-mata/gerar - gera confrontos automaticamente
router.post('/mata-mata/gerar', verificarAdmin, async (req, res) => {
  try {
    const resultados = await gerarMataMata();
    const atualizados = resultados.filter(r => r.atualizado).length;
    const ignorados = resultados.filter(r => r.ignorado).length;
    req.flash('sucesso', `Confrontos gerados! ${atualizados} jogos atualizados, ${ignorados} aguardando fase anterior.`);
  } catch (err) {
    req.flash('erro', err.message);
  }
  res.redirect('/admin/mata-mata');
});

// POST /admin/mata-mata/limpar - limpa todos os confrontos
router.post('/mata-mata/limpar', verificarAdmin, async (req, res) => {
  try {
    const total = await limparMataMata();
    req.flash('sucesso', `${total} confrontos foram limpos.`);
  } catch (err) {
    console.error('Erro ao limpar confrontos:', err);
    req.flash('erro', 'Erro ao limpar confrontos.' + (err.message ? ' (' + err.message + ')' : ''));
  }
  res.redirect('/admin/mata-mata');
});

// POST /admin/mata-mata/:id/editar - editar time de um confronto
router.post('/mata-mata/:id/editar', verificarAdmin, async (req, res) => {
  const jogoId = parseInt(req.params.id, 10);
  if (isNaN(jogoId)) return res.redirect('/admin/mata-mata');
  const { selecao_casa_id, selecao_visitante_id } = req.body;
  try {
    const jogo = await get('SELECT finalizado FROM jogos WHERE id = ?', [jogoId]);
    if (!jogo) { req.flash('erro', 'Jogo não encontrado.'); return res.redirect('/admin/mata-mata'); }
    if (jogo.finalizado) { req.flash('erro', 'Jogo já finalizado.'); return res.redirect('/admin/mata-mata'); }

    const casa = selecao_casa_id && selecao_casa_id !== '' ? parseInt(selecao_casa_id) : null;
    const visitante = selecao_visitante_id && selecao_visitante_id !== '' ? parseInt(selecao_visitante_id) : null;

    await run('UPDATE jogos SET selecao_casa_id = ?, selecao_visitante_id = ? WHERE id = ?',
      [casa, visitante, jogoId]);
    req.flash('sucesso', 'Confronto atualizado manualmente.');
  } catch (err) {
    console.error('Erro ao editar confronto:', err);
    req.flash('erro', 'Erro ao editar confronto.');
  }
  res.redirect('/admin/mata-mata');
});

// GET /admin/pontuacao-fases - configura pontuação por fase
router.get('/pontuacao-fases', verificarAdmin, async (req, res) => {
  try {
    const fases = await all('SELECT * FROM fase_pontuacao ORDER BY CASE fase WHEN \'grupo\' THEN 1 WHEN \'r32\' THEN 2 WHEN \'r16\' THEN 3 WHEN \'qf\' THEN 4 WHEN \'sf\' THEN 5 WHEN \'terceiro\' THEN 6 WHEN \'final\' THEN 7 END');
    const faseLabel = { grupo: 'Fase de Grupos', r32: '16 avos de Final', r16: 'Oitavas de Final', qf: 'Quartas de Final', sf: 'Semifinal', terceiro: 'Disputa de 3º lugar', final: 'Final' };
    res.render('admin-pontuacao-fases', { title: 'Pontuação por Fase', fases, faseLabel });
  } catch (err) {
    console.error('Erro:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/admin');
  }
});

// POST /admin/pontuacao-fases - salva configuração
router.post('/pontuacao-fases', verificarAdmin, async (req, res) => {
  try {
    const fases = ['grupo', 'r32', 'r16', 'qf', 'sf', 'terceiro', 'final'];
    for (const fase of fases) {
      const exato = parseInt(req.body[fase + '_exato'], 10);
      const empate = parseInt(req.body[fase + '_empate'], 10);
      const resultadoGol = parseInt(req.body[fase + '_resultado_gol'], 10);
      const resultado = parseInt(req.body[fase + '_resultado'], 10);
      const gol = parseInt(req.body[fase + '_gol'], 10);
      if ([exato, empate, resultadoGol, resultado, gol].some(isNaN)) continue;
      // Regra fixa: bônus por classificado = metade inteira de "Só resultado".
      const classificado = fase === 'grupo' ? 0 : Math.floor(resultado / 2);
      await run(
        'UPDATE fase_pontuacao SET pts_exato = ?, pts_empate = ?, pts_resultado_gol = ?, pts_resultado = ?, pts_gol = ?, pts_classificado = ? WHERE fase = ?',
        [exato, empate, resultadoGol, resultado, gol, classificado, fase]
      );
    }
    req.flash('sucesso', 'Pontuação das fases atualizada!');
    res.redirect('/admin/pontuacao-fases');
  } catch (err) {
    console.error('Erro:', err);
    req.flash('erro', 'Erro ao salvar.');
    res.redirect('/admin/pontuacao-fases');
  }
});

// GET /admin/premios - editar premiações do bolão
router.get('/premios', verificarAdmin, async (req, res) => {
  try {
    const rows = await all("SELECT chave, valor FROM config WHERE chave LIKE 'premio_%'");
    const premios = { premio_1: '300.00', premio_2: '125.00', premio_3: '75.00' };
    for (const r of rows) premios[r.chave] = r.valor;
    res.render('admin-premios', { title: 'Premiações', premios });
  } catch (err) {
    console.error('Erro ao carregar premiações:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/admin');
  }
});

// POST /admin/premios - salva premiações
router.post('/premios', verificarAdmin, async (req, res) => {
  try {
    const chaves = ['premio_1', 'premio_2', 'premio_3'];
    for (const chave of chaves) {
      const valor = (req.body[chave] || '').toString().replace(',', '.');
      const num = parseFloat(valor);
      if (isNaN(num) || num < 0) {
        req.flash('erro', `Valor inválido para ${chave}.`);
        return res.redirect('/admin/premios');
      }
      const existe = await get('SELECT chave FROM config WHERE chave = ?', [chave]);
      if (existe) {
        await run('UPDATE config SET valor = ? WHERE chave = ?', [num.toFixed(2), chave]);
      } else {
        await run('INSERT INTO config (chave, valor) VALUES (?, ?)', [chave, num.toFixed(2)]);
      }
    }
    req.flash('sucesso', 'Premiações atualizadas!');
    res.redirect('/admin/premios');
  } catch (err) {
    console.error('Erro ao salvar premiações:', err);
    req.flash('erro', 'Erro ao salvar.');
    res.redirect('/admin/premios');
  }
});

// GET /admin/link-login - gera link de login automático
router.get('/link-login', verificarAdmin, async (req, res) => {
  try {
    const token = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await run("DELETE FROM config WHERE chave = 'auth_token_hash'");
    await run("INSERT INTO config (chave, valor) VALUES ('auth_token_hash', ?)", [hash]);
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const link = `${baseUrl}/login/${token}`;
    res.render('admin-link-login', { title: 'Link de login', link });
  } catch (err) {
    console.error('Erro ao gerar link:', err);
    req.flash('erro', 'Erro ao gerar link.');
    res.redirect('/admin');
  }
});

// POST /admin/usuarios/:id/bonus - adiciona pontos bônus
router.post('/usuarios/:id/bonus', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.redirect('/admin/usuarios');
  const { pontos, motivo } = req.body;
  const pts = parseInt(pontos, 10);
  if (isNaN(pts) || pts <= 0) {
    req.flash('erro', 'Informe um número de pontos válido (maior que zero).');
    return res.redirect('/admin/usuarios');
  }
  try {
    await run('INSERT INTO pontos_bonus (usuario_id, pontos, motivo) VALUES (?, ?, ?)', [id, pts, motivo || null]);
    req.flash('sucesso', `${pts} ponto(s) bônus adicionado(s)!`);
  } catch (err) {
    console.error('Erro ao adicionar bônus:', err);
    req.flash('erro', 'Erro ao adicionar bônus.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/bonus/:bonusId/remover - remove um bônus específico
router.post('/usuarios/:id/bonus/:bonusId/remover', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bonusId = parseInt(req.params.bonusId, 10);
  if (isNaN(id) || isNaN(bonusId)) return res.redirect('/admin/usuarios');
  try {
    await run('DELETE FROM pontos_bonus WHERE id = ? AND usuario_id = ?', [bonusId, id]);
    req.flash('sucesso', 'Bônus removido.');
  } catch (err) {
    console.error('Erro ao remover bônus:', err);
    req.flash('erro', 'Erro ao remover bônus.');
  }
  res.redirect('/admin/usuarios');
});

// POST /admin/usuarios/:id/bonus/:bonusId/editar - edita pontos e motivo de um bônus
router.post('/usuarios/:id/bonus/:bonusId/editar', verificarAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const bonusId = parseInt(req.params.bonusId, 10);
  if (isNaN(id) || isNaN(bonusId)) return res.redirect('/admin/usuarios');
  const { pontos, motivo } = req.body;
  const pts = parseInt(pontos, 10);
  if (isNaN(pts) || pts <= 0) {
    req.flash('erro', 'Informe um número de pontos válido (maior que zero).');
    return res.redirect('/admin/usuarios');
  }
  try {
    await run('UPDATE pontos_bonus SET pontos = ?, motivo = ? WHERE id = ? AND usuario_id = ?', [pts, motivo || null, bonusId, id]);
    req.flash('sucesso', 'Bônus atualizado!');
  } catch (err) {
    console.error('Erro ao editar bônus:', err);
    req.flash('erro', 'Erro ao editar bônus.');
  }
  res.redirect('/admin/usuarios');
});

const { buscarPlacares, getStatus } = require('../services/placar-automatico');

// GET /admin/placar-automatico - status do serviço
router.get('/placar-automatico', verificarAdmin, (req, res) => {
  res.render('admin-placar-automatico', { title: 'Placar Automático', status: getStatus() });
});

// POST /admin/placar-automatico/executar - executa manualmente
router.post('/placar-automatico/executar', verificarAdmin, async (req, res) => {
  req.flash('aviso', 'Buscando placares...');
  try {
    const resultado = await buscarPlacares();
    if (resultado.ok) {
      req.flash('sucesso', resultado.mensagem);
    } else {
      req.flash('erro', resultado.mensagem);
    }
  } catch (err) {
    logger.error('placar-automatico erro manual', { error: err.message });
    req.flash('erro', `Erro inesperado: ${err.message}`);
  }
  res.redirect('/admin/placar-automatico');
});

module.exports = { router, getPontosFase };
