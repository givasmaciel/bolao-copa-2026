const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
let sharp;
try { sharp = require('sharp'); } catch (e) { sharp = null; }
const { run, get } = require('../database/db');
const { verificarAutenticado } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Formato inválido. Use JPG, PNG, GIF ou WebP.'));
    }
    cb(null, true);
  }
});

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function limparFotoAntiga(usuarioId) {
  try {
    const files = fs.readdirSync(uploadsDir);
    for (const f of files) {
      if (f.startsWith(`usuario-${usuarioId}.`)) {
        fs.unlinkSync(path.join(uploadsDir, f));
      }
    }
  } catch (e) { /* diretório vazio ou inexistente */ }
}

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
  if (nome.length > 100) {
    req.flash('erro', 'Nome muito longo.');
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

// POST /config/foto - faz upload e redimensiona a foto de perfil
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
      const usuarioId = req.session.usuario.id;
      limparFotoAntiga(usuarioId);

      let nomeArquivo, bufferFinal;
      if (sharp) {
        nomeArquivo = `usuario-${usuarioId}.webp`;
        bufferFinal = await sharp(req.file.buffer)
          .resize(200, 200, { fit: 'cover', position: 'centre' })
          .webp({ quality: 85 })
          .toBuffer();
        fs.writeFileSync(path.join(uploadsDir, nomeArquivo), bufferFinal);
      } else {
        const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
        nomeArquivo = `usuario-${usuarioId}${ext}`;
        bufferFinal = req.file.buffer;
        fs.writeFileSync(path.join(uploadsDir, nomeArquivo), bufferFinal);
      }

      const fotoBase64 = bufferFinal.toString('base64');
      const mime = path.extname(nomeArquivo) === '.webp' ? 'image/webp' : 'image/jpeg';
      const dataUri = `data:${mime};base64,${fotoBase64}`;
      const fotoPath = '/uploads/' + nomeArquivo;

      await run('UPDATE usuarios SET foto = ?, foto_base64 = ? WHERE id = ?', [fotoPath, dataUri, usuarioId]);
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
    limparFotoAntiga(req.session.usuario.id);
    await run('UPDATE usuarios SET foto = NULL, foto_base64 = NULL WHERE id = ?', [req.session.usuario.id]);
    delete req.session.usuario.foto;
    req.flash('sucesso', 'Foto removida.');
  } catch (err) {
    console.error('Erro ao remover foto:', err);
    req.flash('erro', 'Erro ao remover foto.');
  }
  res.redirect('/config');
});

module.exports = router;
