function verificarAutenticado(req, res, next) {
  if (req.session && req.session.usuario) {
    res.locals.usuario = req.session.usuario;
    return next();
  }
  req.flash('erro', 'Você precisa estar logado para acessar esta página.');
  return res.redirect('/login');
}

function verificarAdmin(req, res, next) {
  if (req.session && req.session.usuario && req.session.usuario.is_admin) {
    res.locals.usuario = req.session.usuario;
    return next();
  }
  req.flash('erro', 'Acesso restrito ao administrador.');
  return res.redirect('/');
}

function jaLogado(req, res, next) {
  if (req.session && req.session.usuario) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = { verificarAutenticado, verificarAdmin, jaLogado };
