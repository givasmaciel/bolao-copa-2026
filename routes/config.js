const express = require('express');
const path = require('path');
const multer = require('multer');
const { run, get } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `usuario-${req.session.usuario.id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      return cb(new Error('Formato inválido. Use JPG, PNG, GIF ou WebP.'));
    }
    cb(null, true);
  }
});

// GET /config - página de configurações da conta
router.get('/', verificarAutenticado, async (req, res) => {
  try {
    const usuario = await get('SELECT nome, email, username, foto FROM usuarios WHERE id = ?', [req.session.usuario.id]);
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

// POST /config/foto - faz upload da foto de perfil
router.post('/foto', verificarAutenticado, (req, res) => {
  upload.single('foto')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        req.flash('erro', 'Arquivo muito grande. Máximo 2MB.');
      } else {
        req.flash('erro', err.message || 'Erro ao fazer upload.');
      }
      return res.redirect('/config');
    }

    if (!req.file) {
      req.flash('erro', 'Selecione uma imagem.');
      return res.redirect('/config');
    }

    try {
      const fotoPath = '/uploads/' + req.file.filename;
      await run('UPDATE usuarios SET foto = ? WHERE id = ?', [fotoPath, req.session.usuario.id]);
      req.session.usuario.foto = fotoPath;
      req.flash('sucesso', 'Foto atualizada com sucesso!');
    } catch (dbErr) {
      console.error('Erro ao salvar foto:', dbErr);
      req.flash('erro', 'Erro ao salvar foto.');
    }
    res.redirect('/config');
  });
});

// POST /config/foto/remover - remove a foto de perfil
router.post('/foto/remover', verificarAutenticado, async (req, res) => {
  try {
    const usuario = await get('SELECT foto FROM usuarios WHERE id = ?', [req.session.usuario.id]);
    if (usuario && usuario.foto) {
      const fs = require('fs');
      const filePath = path.join(__dirname, '..', 'public', usuario.foto);
      try { fs.unlinkSync(filePath); } catch (e) { /* arquivo não existe */ }
    }
    await run('UPDATE usuarios SET foto = NULL WHERE id = ?', [req.session.usuario.id]);
    delete req.session.usuario.foto;
    req.flash('sucesso', 'Foto removida.');
  } catch (err) {
    console.error('Erro ao remover foto:', err);
    req.flash('erro', 'Erro ao remover foto.');
  }
  res.redirect('/config');
});

module.exports = router;
