const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const rateLimit = require('express-rate-limit');
const { run, get } = require('../database/db');

const senhaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { ok: false, erro: 'Muitas tentativas. Aguarde 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

const usandoPG = !!process.env.DATABASE_URL;
const AGORA = usandoPG ? 'NOW()' : "datetime('now')";

const router = express.Router();

function criarTransportador() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

// GET /esqueci-senha
router.get('/esqueci-senha', (req, res) => {
  res.render('esqueci-senha', { title: 'Esqueci a senha' });
});

// POST /esqueci-senha
router.post('/esqueci-senha', senhaLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    req.flash('erro', 'Informe seu e-mail.');
    return res.redirect('/esqueci-senha');
  }

  try {
    const usuario = await get('SELECT id, nome, email FROM usuarios WHERE email = ?', [email.toLowerCase().trim()]);

    // Mesmo se não encontrar, mostra mensagem genérica (segurança)
    if (!usuario) {
      req.flash('sucesso', 'Se o e-mail existir, enviaremos um link de redefinição.');
      return res.redirect('/esqueci-senha');
    }

    // Gera token de 32 bytes hex
    const token = crypto.randomBytes(32).toString('hex');
    const expiraEm = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await run(
      `INSERT INTO password_reset_tokens (usuario_id, token, expira_em) VALUES (?, ?, ?)`,
      [usuario.id, token, expiraEm.toISOString()]
    );

    // Tenta enviar e-mail
    const transporter = criarTransportador();
    if (transporter) {
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.headers.host}`;
      const link = `${baseUrl}/redefinir-senha/${token}`;

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: usuario.email,
        subject: 'Redefinir senha - Bolão da Copa 2026',
        html: `
          <p>Olá, ${usuario.nome}!</p>
          <p>Recebemos um pedido de redefinição de senha para sua conta no Bolão da Copa 2026.</p>
          <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#009739;color:white;text-decoration:none;border-radius:8px;font-weight:bold">Redefinir senha</a></p>
          <p>Ou copie este link: ${link}</p>
          <p>Este link expira em 1 hora.</p>
          <p>Se não foi você, ignore este e-mail.</p>
        `
      });
    } else {
      // Sem SMTP configurado: exibe o link na tela (útil para teste)
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.headers.host}`;
      req.flash('sucesso', `Link de redefinição (modo teste): ${baseUrl}/redefinir-senha/${token}`);
      return res.redirect('/esqueci-senha');
    }

    req.flash('sucesso', 'Se o e-mail existir, enviaremos um link de redefinição.');
    res.redirect('/esqueci-senha');
  } catch (err) {
    console.error('Erro em esqueci-senha:', err);
    req.flash('erro', 'Erro ao processar solicitação.');
    res.redirect('/esqueci-senha');
  }
});

// GET /redefinir-senha/:token
router.get('/redefinir-senha/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const reset = await get(
      `SELECT id, usuario_id, expira_em, usado
       FROM password_reset_tokens
       WHERE token = ? AND usado = 0 AND expira_em > ${AGORA}`,
      [token]
    );

    if (!reset) {
      req.flash('erro', 'Link inválido ou expirado. Solicite um novo.');
      return res.redirect('/esqueci-senha');
    }

    res.render('redefinir-senha', { title: 'Redefinir senha', token });
  } catch (err) {
    console.error('Erro ao validar token:', err);
    req.flash('erro', 'Erro ao validar link.');
    res.redirect('/esqueci-senha');
  }
});

// POST /redefinir-senha/:token
router.post('/redefinir-senha/:token', senhaLimiter, async (req, res) => {
  const { token } = req.params;
  const { senha, confirmar } = req.body;

  if (!senha || senha.length < 4) {
    req.flash('erro', 'A senha deve ter pelo menos 4 caracteres.');
    return res.redirect(`/redefinir-senha/${token}`);
  }
  if (senha !== confirmar) {
    req.flash('erro', 'As senhas não coincidem.');
    return res.redirect(`/redefinir-senha/${token}`);
  }

  try {
    const valido = await get(
      `SELECT id, usuario_id, expira_em, usado
       FROM password_reset_tokens
       WHERE token = ? AND usado = 0 AND expira_em > ${AGORA}`,
      [token]
    );

    if (!valido) {
      req.flash('erro', 'Link inválido ou expirado.');
      return res.redirect('/esqueci-senha');
    }

    const hash = await bcrypt.hash(senha, 10);
    await run('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, valido.usuario_id]);
    await run('UPDATE password_reset_tokens SET usado = 1 WHERE id = ?', [valido.id]);

    req.flash('sucesso', 'Senha redefinida com sucesso! Faça login.');
    res.redirect('/login');
  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    req.flash('erro', 'Erro ao redefinir senha.');
    res.redirect(`/redefinir-senha/${token}`);
  }
});

module.exports = router;
