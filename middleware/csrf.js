const crypto = require('crypto');
const logger = require('../logger');

// Gera token CSRF na sessão se não existir e disponibiliza nas views
function csrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomUUID();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

// Valida CSRF em métodos que alteram estado (POST, PUT, PATCH, DELETE)
function csrfProtection(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
    const token = req.query?._csrf || req.headers?.['x-csrf-token'];
    if (!token || token !== req.session.csrfToken) {
      if (req.accepts('json')) return res.status(403).json({ ok: false, erro: 'CSRF inválido. Recarregue a página e tente novamente.' });
      req.flash('erro', 'Sessão expirada. Recarregue a página e tente novamente.');
      return res.redirect('back');
    }
    return next();
  }

  let token = req.body?._csrf || req.query?._csrf || req.headers?.['x-csrf-token'];
  if (Array.isArray(token)) token = token[0];
  if (!token || token !== req.session.csrfToken) {
    logger.warn('CSRF inválido', {
      method: req.method,
      url: req.originalUrl,
      hasSessionCsrf: !!req.session.csrfToken,
      sessionToken: req.session.csrfToken ? String(req.session.csrfToken).substring(0, 8) + '...' : null,
      tokenRecebido: token ? String(token).substring(0, 8) + '...' : null,
      sessionId: req.sessionID,
      contentType: req.headers['content-type']
    });
    if (req.accepts('json')) {
      return res.status(403).json({ ok: false, erro: 'CSRF inválido. Recarregue a página e tente novamente.' });
    }
    req.flash('erro', 'Sessão expirada. Recarregue a página e tente novamente.');
    return res.redirect('back');
  }
  next();
}

module.exports = { csrfToken, csrfProtection };
