const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { run, get } = require('../database/db');
const { jaLogado } = require('../middleware/auth');
const logger = require('../logger');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

// GET /cadastro
router.get('/cadastro', jaLogado, (req, res) => {
  res.render('cadastro', {
    title: 'Criar conta',
    dados: {}
  });
});

// POST /cadastro
router.post('/cadastro', jaLogado, authLimiter, async (req, res) => {
  const { nome, email, senha, confirmar } = req.body;

  // Validações
  if (!nome || !email || !senha) {
    req.flash('erro', 'Preencha todos os campos.');
    return res.render('cadastro', { title: 'Criar conta', dados: req.body });
  }
  if (nome.length > 100 || email.length > 255 || senha.length > 100) {
    req.flash('erro', 'Valor muito longo.');
    return res.render('cadastro', { title: 'Criar conta', dados: req.body });
  }
  if (senha.length < 4) {
    req.flash('erro', 'A senha deve ter pelo menos 4 caracteres.');
    return res.render('cadastro', { title: 'Criar conta', dados: req.body });
  }
  if (senha !== confirmar) {
    req.flash('erro', 'As senhas não coincidem.');
    return res.render('cadastro', { title: 'Criar conta', dados: req.body });
  }

  try {
    // Verifica se o cadastro ainda está aberto (prazo dos extras)
    const deadlineRow = await get("SELECT valor FROM config WHERE chave = 'extras_data_limite'");
    if (deadlineRow && deadlineRow.valor) {
      const deadline = new Date(deadlineRow.valor);
      if (!isNaN(deadline.getTime()) && new Date() > deadline) {
        req.flash('erro', 'O cadastro foi encerrado após o fechamento dos palpites extras.');
        return res.render('cadastro', { title: 'Criar conta', dados: req.body });
      }
    }

    const emailLimpo = email.toLowerCase().trim();
    const existe = await get('SELECT id FROM usuarios WHERE email = ?', [emailLimpo]);
    if (existe) {
      req.flash('erro', 'Já existe uma conta com este e-mail.');
      return res.render('cadastro', { title: 'Criar conta', dados: req.body });
    }

    const nomeLimpo = nome.trim();
    const loginLimpo = nomeLimpo.toLowerCase();

    // Verifica se já existe alguém com este nome (como username)
    const existeNome = await get('SELECT id FROM usuarios WHERE nome = ? OR username = ?', [nomeLimpo, loginLimpo]);
    if (existeNome) {
      req.flash('erro', 'Este nome já está em uso. Escolha outro.');
      return res.render('cadastro', { title: 'Criar conta', dados: req.body });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await run(
      'INSERT INTO usuarios (nome, email, username, senha_hash) VALUES (?, ?, ?, ?)',
      [nomeLimpo, emailLimpo, loginLimpo, senhaHash]
    );

    req.session.usuario = {
      id: result.lastID,
      nome: nomeLimpo,
      email: emailLimpo,
      username: loginLimpo,
      is_admin: 0
    };

    req.flash('sucesso', `Bem-vindo ao bolão, ${nome}!`);
    res.redirect('/dashboard');
  } catch (err) {
    logger.error('Erro no cadastro:', err);
    req.flash('erro', 'Erro ao criar conta. Tente novamente.');
    res.render('cadastro', { title: 'Criar conta', dados: req.body });
  }
});

// GET /login
router.get('/login', jaLogado, (req, res) => {
  res.render('login', { title: 'Entrar' });
});

// POST /login
router.post('/login', jaLogado, authLimiter, async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    req.flash('erro', 'Informe e-mail e senha.');
    return res.render('login', { title: 'Entrar' });
  }
  if (email.length > 255 || senha.length > 100) {
    req.flash('erro', 'Valor muito longo.');
    return res.render('login', { title: 'Entrar' });
  }

  try {
    const identifier = email; // campo do form chama 'email' mas aceita qualquer identificador
    const usuario = await get(
      'SELECT id, nome, email, foto, senha_hash, is_admin FROM usuarios WHERE email = ? OR username = ? OR nome = ?',
      [identifier.toLowerCase().trim(), identifier.toLowerCase().trim(), identifier.trim()]
    );

    if (!usuario) {
      req.flash('erro', 'E-mail ou senha inválidos.');
      return res.render('login', { title: 'Entrar' });
    }

    const ok = await bcrypt.compare(senha, usuario.senha_hash);
    if (!ok) {
      req.flash('erro', 'E-mail ou senha inválidos.');
      return res.render('login', { title: 'Entrar' });
    }

    req.session.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      foto: usuario.foto,
      is_admin: usuario.is_admin
    };

    // Salva explicitamente antes do redirect
    req.session.save((err) => {
      if (err) logger.error('Erro ao salvar sessão:', err);
      req.flash('sucesso', `Olá, ${usuario.nome}!`);
      res.redirect('/dashboard');
    });
  } catch (err) {
    logger.error('Erro no login:', err);
    req.flash('erro', 'Erro ao fazer login.');
    res.render('login', { title: 'Entrar' });
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// GET /login/:token - login automático via token
router.get('/login/:token', tokenLimiter, async (req, res) => {
  try {
    const token = req.params.token;
    // Gera o hash do token para comparar com o armazenado
    // (O token é armazenado como sha256 na config)
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = await get("SELECT valor FROM config WHERE chave = 'auth_token_hash'");
    if (!row || row.valor !== hash) {
      req.flash('erro', 'Link inválido ou expirado.');
      return res.redirect('/login');
    }
    // Busca o admin
    const admin = await get("SELECT id, nome, email, foto, is_admin FROM usuarios WHERE is_admin = 1 LIMIT 1");
    if (!admin) {
      req.flash('erro', 'Nenhum administrador encontrado.');
      return res.redirect('/login');
    }
    req.session.usuario = {
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
      foto: admin.foto,
      is_admin: admin.is_admin
    };
    req.session.save((err) => {
      if (err) logger.error('[TOKEN] erro ao salvar sessão:', err);
      req.flash('sucesso', `Login automático: ${admin.nome}`);
      res.redirect('/dashboard');
    });
  } catch (err) {
    logger.error('Erro no login por token:', err);
    req.flash('erro', 'Erro no login automático.');
    res.redirect('/login');
  }
});

module.exports = router;
