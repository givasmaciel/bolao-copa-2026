const express = require('express');
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
  const { nome, email, senha, confirmar, username } = req.body;

  // Validações
  if (!nome || !email || !senha) {
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
    const emailLimpo = email.toLowerCase().trim();
    const existe = await get('SELECT id FROM usuarios WHERE email = ?', [emailLimpo]);
    if (existe) {
      req.flash('erro', 'Já existe uma conta com este e-mail.');
      return res.render('cadastro', { title: 'Criar conta', dados: req.body });
    }

    const usernameLimpo = username ? username.trim().toLowerCase() : null;
    if (usernameLimpo) {
      const existeUser = await get('SELECT id FROM usuarios WHERE username = ?', [usernameLimpo]);
      if (existeUser) {
        req.flash('erro', 'Este nome de usuário já está em uso.');
        return res.render('cadastro', { title: 'Criar conta', dados: req.body });
      }
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const result = await run(
      'INSERT INTO usuarios (nome, email, username, senha_hash) VALUES (?, ?, ?, ?)',
      [nome.trim(), emailLimpo, usernameLimpo, senhaHash]
    );

    req.session.usuario = {
      id: result.lastID,
      nome: nome.trim(),
      email: emailLimpo,
      is_admin: 0
    };

    req.flash('sucesso', `Bem-vindo ao bolão, ${nome}!`);
    res.redirect('/palpites');
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
      res.redirect('/palpites');
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

module.exports = router;
