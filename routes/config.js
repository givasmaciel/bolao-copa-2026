const express = require('express');
const { run, get } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

// GET /config - página de configurações da conta
router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const usuario = await get('SELECT nome, email, username, codigo_convite FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    res.render('config', { title: 'Minha conta', usuario: { ...req.session.usuario, ...usuario } });
  } catch (err) {
    console.error('Erro ao carregar config:', err);
    req.flash('erro', 'Erro ao carregar.');
    res.redirect('/');
  }
});

// POST /config/nome - altera o nome (que também serve como username pra login)
router.post('/nome', verificarAutenticado, async (req, res) => {
  const { nome } = req.body;
  if (!nome || !nome.trim()) {
    req.flash('erro', 'Informe um nome.');
    return res.redirect('/config');
  }

  const nomeLimpo = nome.trim();
  const loginLimpo = nomeLimpo.toLowerCase();

  try {
    // Verifica se já existe outro usuário com este nome como login
    const existe = await get('SELECT id FROM usuarios WHERE (nome = ? OR username = ?) AND id != ?', [nomeLimpo, loginLimpo, req.session.usuario.id]);
    if (existe) {
      req.flash('erro', 'Este nome já está em uso por outro participante.');
      return res.redirect('/config');
    }

    await run('UPDATE usuarios SET nome = ?, username = ? WHERE id = ?', [nomeLimpo, loginLimpo, req.session.usuario.id]);
    req.session.usuario.nome = nomeLimpo;
    req.session.usuario.username = loginLimpo;
    req.flash('sucesso', 'Nome atualizado com sucesso!');
    res.redirect('/config');
  } catch (err) {
    console.error('Erro ao alterar nome:', err);
    req.flash('erro', 'Erro ao alterar nome.');
    res.redirect('/config');
  }
});

module.exports = router;
