const express = require('express');
const bcrypt = require('bcryptjs');
const { run, get, all } = require('../database/db');
const { verificarAdmin } = require('../middleware/auth');
const { gerarMataMata, listarConfrontos, limparMataMata } = require('../services/mata-mata');

const router = express.Router();

// GET /admin/diagnostic - verifica estado do banco (acesso sem login, use chave)
router.get('/diagnostic', async (req, res) => {
  if (req.query.chave !== 'verificar123') {
    return res.status(403).send('Acesso negado');
  }
  try {
    const usandoPG = !!process.env.DATABASE_URL;
    const totalUsers = await get('SELECT COUNT(*) AS total FROM usuarios');
    const adminUser = await get("SELECT id, email, is_admin, length(senha_hash) AS hash_len, substring(senha_hash, 1, 30) AS hash_inicio FROM usuarios WHERE email = 'gpmmac@gmail.com'");
    const envEmail = process.env.ADMIN_EMAIL || '(não definido)';
    const envSenhaLen = (process.env.ADMIN_SENHA || '').length;

    const testHash = adminUser ? await bcrypt.compare('M@ciel80', adminUser.hash_inicio + '...') : false;
    // bcrypt.compare precisa do hash completo, refaz
    let senhaOk = false;
    if (adminUser) {
      const fullUser = await get("SELECT senha_hash FROM usuarios WHERE email = 'gpmmac@gmail.com'");
      senhaOk = await bcrypt.compare('M@ciel80', fullUser.senha_hash);
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

// Sistema de pontuação
// - Placar exato: 10 pts
// - Empate (qualquer placar): 7 pts
// - Resultado certo + gols de 1 time: 7 pts (5 + 2)
// - Só resultado exceto empate (V/D): 3 pts
// - Errou resultado mas acertou gol de 1 time: 2 pts
// - Errou tudo: 0 pts
function calcularPontos(golsCasa, golsVisitante, palpiteCasa, palpiteVisitante) {
  if (golsCasa === null || golsVisitante === null ||
      golsCasa === undefined || golsVisitante === undefined) return 0;
  if (palpiteCasa === null || palpiteVisitante === null ||
      palpiteCasa === undefined || palpiteVisitante === undefined) return 0;

  // Placar exato
  if (golsCasa === palpiteCasa && golsVisitante === palpiteVisitante) {
    return 10;
  }

  // Determina resultado real e do palpite
  let resReal, resPalpite;
  if (golsCasa > golsVisitante) { resReal = 'C'; }
  else if (golsCasa < golsVisitante) { resReal = 'V'; }
  else { resReal = 'E'; }

  if (palpiteCasa > palpiteVisitante) { resPalpite = 'C'; }
  else if (palpiteCasa < palpiteVisitante) { resPalpite = 'V'; }
  else { resPalpite = 'E'; }

  // Empate (qualquer placar) vale 7 pts
  if (resReal === 'E' && resPalpite === 'E') return 7;

  const acertouGolCasa = golsCasa === palpiteCasa;
  const acertouGolVisitante = golsVisitante === palpiteVisitante;
  const acertouGolTime = acertouGolCasa || acertouGolVisitante;

  if (resReal === resPalpite) {
    if (acertouGolTime) return 7;
    return 3;
  }

  if (acertouGolTime) return 2;
  return 0;
}

// GET /admin - painel principal
router.get('/', verificarAdmin, async (req, res) => {
  try {
    const totais = await get(`
      SELECT
        (SELECT COUNT(*) FROM jogos) AS total_jogos,
        (SELECT COUNT(*) FROM jogos WHERE fase = 'grupo' AND finalizado = 1) AS jogos_finalizados,
        (SELECT COUNT(*) FROM jogos WHERE finalizado = 0 AND data < ${process.env.DATABASE_URL ? 'NOW()' : "datetime('now')"}) AS jogos_pendentes,
        (SELECT COUNT(*) FROM usuarios WHERE is_admin = 0) AS total_usuarios,
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
      SELECT u.nome, COALESCE(SUM(p.pontos_obtidos), 0) AS pontos
      FROM usuarios u
      LEFT JOIN palpites p ON p.usuario_id = u.id
      WHERE u.is_admin = 0
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
             g.letra AS grupo_letra,
             sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla,
             sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla
      FROM jogos j
      LEFT JOIN grupos g ON j.grupo_id = g.id
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      ORDER BY j.id
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

    await run(
      'UPDATE jogos SET gols_casa = ?, gols_visitante = ?, finalizado = ? WHERE id = ?',
      [gc, gv, fin, jogoId]
    );

    // Recalcula pontos dos palpites desse jogo
    if (fin === 1 && gc !== null && gv !== null) {
      const palpites = await all(
        'SELECT id, palpite_gols_casa, palpite_gols_visitante FROM palpites WHERE jogo_id = ?',
        [jogoId]
      );
      for (const p of palpites) {
        const pontos = calcularPontos(gc, gv, p.palpite_gols_casa, p.palpite_gols_visitante);
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
    const jogos = await all('SELECT id, gols_casa, gols_visitante FROM jogos WHERE finalizado = 1');
    let total = 0;
    for (const j of jogos) {
      const palpites = await all(
        'SELECT id, palpite_gols_casa, palpite_gols_visitante FROM palpites WHERE jogo_id = ?',
        [j.id]
      );
      for (const p of palpites) {
        const pontos = calcularPontos(j.gols_casa, j.gols_visitante, p.palpite_gols_casa, p.palpite_gols_visitante);
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
    const usuarios = await all(
      'SELECT id, nome, email, username, codigo_convite, is_admin, criado_em FROM usuarios ORDER BY nome'
    );
    res.render('admin-usuarios', { title: 'Gerenciar participantes', usuarios });
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

// POST /admin/resetar-todos-palpites
router.post('/resetar-todos-palpites', verificarAdmin, async (req, res) => {
  try {
    await run('DELETE FROM palpites');
    await run('DELETE FROM palpites_extras');
    await run('DELETE FROM resultados_extras');
    req.flash('sucesso', 'Todos os palpites (incluindo extras e resultados oficiais) foram resetados.');
  } catch (err) {
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
    let novoCodigo;
    do {
      novoCodigo = Math.random().toString(36).substring(2, 10);
    } while (await get('SELECT id FROM usuarios WHERE codigo_convite = ?', [novoCodigo]));
    await run('INSERT INTO usuarios (nome, email, username, codigo_convite, senha_hash, is_admin) VALUES (?, ?, ?, ?, ?, 0)', [
      nome.trim(), emailLimpo, usernameLimpo, novoCodigo, hash
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

// GET /admin/jogos/:id/limpar-limite - limpa prazo personalizado
router.get('/jogos/:id/limpar-limite', verificarAdmin, async (req, res) => {
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

module.exports = { router, calcularPontos };
