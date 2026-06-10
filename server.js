require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const methodOverride = require('method-override');

const { criarSchema } = require('./database/schema');
const authRoutes = require('./routes/auth');
const palpitesRoutes = require('./routes/palpites');
const jogosRoutes = require('./routes/jogos');
const rankingRoutes = require('./routes/ranking');
const senhaRoutes = require('./routes/senha');
const extrasRoutes = require('./routes/extras');
const { router: adminRoutes } = require('./routes/admin');
const configRoutes = require('./routes/config');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust proxy (Render, Heroku, etc)
app.set('trust proxy', 1);

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bolao-copa-2026-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dias
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
app.use(flash());

// Disponibiliza flash messages e usuário para as views
app.use((req, res, next) => {
  res.locals.sucesso = req.flash('sucesso');
  res.locals.erro = req.flash('erro');
  res.locals.aviso = req.flash('aviso');
  res.locals.usuario = req.session.usuario || null;
  next();
});

// Rotas
app.get('/', (req, res) => {
  res.render('home', { title: 'Bolão da Copa 2026' });
});

app.use('/', authRoutes);
app.use('/palpites', palpitesRoutes);
app.use('/jogos', jogosRoutes);
app.use('/ranking', rankingRoutes);
app.use('/', senhaRoutes);
app.use('/palpites-extras', extrasRoutes.router);
app.use('/admin', adminRoutes);
app.use('/admin', extrasRoutes.adminRouter);
app.use('/config', configRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Página não encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('500', { title: 'Erro interno' });
});

(async () => {
  try {
    await criarSchema();
    app.listen(PORT, () => {
      console.log('');
      console.log('⚽ ========================================');
      console.log(`   Bolão da Copa 2026 rodando!`);
      console.log(`   Acesse: http://localhost:${PORT}`);
      console.log('⚽ ========================================');
      console.log('');
    });
  } catch (err) {
    console.error('Erro ao iniciar servidor:', err);
    process.exit(1);
  }
})();
