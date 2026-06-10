const express = require('express');
const { run, get } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

// GET /config - página de configurações da conta
router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const usuario = await get('SELECT nome, email, username FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    res.render('config', { title: 'Minha conta', usuario: { ...req.session.usuario, ...usuario } });
  } catch (err) {
    console.error('Erro ao carregar config:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/');
  }
});

// POST /config/username - altera o nome de usuário
router.post('/username', verificarAutenticado, async (req, res) => {
  const { username } = req.body;
  if (!username || !username.trim()) {
    req.flash('erro', 'Informe um nome de usuário.');
    return res.redirect('/config');
  }

  const usernameLimpo = username.trim().toLowerCase();

  try {
    // Verifica se já existe outro usuário com este username
    const existe = await get('SELECT id FROM usuarios WHERE username = ? AND id != ?', [usernameLimpo, req.session.usuario.id]);
    if (existe) {
      req.flash('erro', 'Este nome de usuário já está em uso por outro participante.');
      return res.redirect('/config');
    }

    await run('UPDATE usuarios SET username = ? WHERE id = ?', [usernameLimpo, req.session.usuario.id]);
    req.session.usuario.username = usernameLimpo;
    req.flash('sucesso', 'Nome de usuário atualizado com sucesso!');
    res.redirect('/config');
  } catch (err) {
    console.error('Erro ao alterar username:', err);
    req.flash('erro', 'Erro ao alterar nome de usuário.');
    res.redirect('/config');
  }
});

module.exports = router;
