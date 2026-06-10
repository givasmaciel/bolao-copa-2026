const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { run, get } = require('../database/db');
const { jaLogado } = require('../middleware/auth');

const router = express.Router();

// GET /cadastro
router.get('/cadastro', jaLogado, (req, res) => {
  res.render('cadastro', {
    title: 'Criar conta',
    dados: {}
  });
});

// POST /cadastro
router.post('/cadastro', jaLogado, async (req, res) => {
  const { nome, email, senha, confirmar, codigo } = req.body;

  // Validações
  if (!nome || !email || !senha || !codigo) {
    req.flash('erro', 'Preencha todos os campos.');
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
    // Valida código de convite
    const convidante = await get('SELECT id FROM usuarios WHERE codigo_convite = ?', [codigo.trim().toLowerCase()]);
    if (!convidante) {
      req.flash('erro', 'Código de convite inválido. Você precisa de um convite de quem já participa.');
      return res.render('cadastro', { title: 'Criar conta', dados: req.body });
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

    // Gera código de convite para o novo usuário
    let novoCodigo;
    do {
      novoCodigo = Math.random().toString(36).substring(2, 10);
    } while (await get('SELECT id FROM usuarios WHERE codigo_convite = ?', [novoCodigo]));

    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await run(
      'INSERT INTO usuarios (nome, email, username, codigo_convite, senha_hash) VALUES (?, ?, ?, ?, ?)',
      [nomeLimpo, emailLimpo, loginLimpo, novoCodigo, senhaHash]
    );

    req.session.usuario = {
      id: result.lastID,
      nome: nomeLimpo,
      email: emailLimpo,
      username: loginLimpo,
      is_admin: 0
    };

    req.flash('sucesso', `Bem-vindo ao bolão, ${nome}! Compartilhe seu código de convite para convidar amigos.`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('Erro no cadastro:', err);
    req.flash('erro', 'Erro ao criar conta. Tente novamente.');
    res.render('cadastro', { title: 'Criar conta', dados: req.body });
  }
});

// GET /login
router.get('/login', jaLogado, (req, res) => {
  res.render('login', { title: 'Entrar' });
});

// POST /login
router.post('/login', jaLogado, async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    req.flash('erro', 'Informe e-mail e senha.');
    return res.render('login', { title: 'Entrar' });
  }

  console.log('[LOGIN] req.secure:', req.secure, '| headers x-forwarded-proto:', req.headers['x-forwarded-proto'], '| NODE_ENV:', process.env.NODE_ENV, '| cookie:', req.headers.cookie);

  try {
    const identifier = email; // campo do form chama 'email' mas aceita qualquer identificador
    const usuario = await get(
      'SELECT id, nome, email, senha_hash, is_admin FROM usuarios WHERE email = ? OR username = ? OR nome = ?',
      [identifier.toLowerCase().trim(), identifier.toLowerCase().trim(), identifier.trim()]
    );

    if (!usuario) {
      console.log('[LOGIN] usuário não encontrado:', email);
      req.flash('erro', 'E-mail ou senha inválidos.');
      return res.render('login', { title: 'Entrar' });
    }

    const ok = await bcrypt.compare(senha, usuario.senha_hash);
    if (!ok) {
      console.log('[LOGIN] senha inválida para:', email);
      req.flash('erro', 'E-mail ou senha inválidos.');
      return res.render('login', { title: 'Entrar' });
    }

    console.log('[LOGIN] sucesso para:', email, '| sessionID:', req.sessionID);

    req.session.usuario = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      is_admin: usuario.is_admin
    };

    // Salva explicitamente antes do redirect
    req.session.save((err) => {
      if (err) {
        console.error('[LOGIN] erro ao salvar sessão:', err);
      } else {
        console.log('[LOGIN] sessão salva com sucesso');
      }
      req.flash('sucesso', `Olá, ${usuario.nome}!`);
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('Erro no login:', err);
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
router.get('/login/:token', async (req, res) => {
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
    const admin = await get("SELECT id, nome, email, is_admin FROM usuarios WHERE is_admin = 1 LIMIT 1");
    if (!admin) {
      req.flash('erro', 'Nenhum administrador encontrado.');
      return res.redirect('/login');
    }
    req.session.usuario = {
      id: admin.id,
      nome: admin.nome,
      email: admin.email,
      is_admin: admin.is_admin
    };
    req.session.save((err) => {
      if (err) console.error('[TOKEN] erro ao salvar sessão:', err);
      req.flash('sucesso', `Login automático: ${admin.nome}`);
      res.redirect('/dashboard');
    });
  } catch (err) {
    console.error('Erro no login por token:', err);
    req.flash('erro', 'Erro no login automático.');
    res.redirect('/login');
  }
});

module.exports = router;
