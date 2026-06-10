require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const methodOverride = require('method-override');

const { criarSchema } = require('./database/schema');
const { get, run: dbRun } = require('./database/db');
const authRoutes = require('./routes/auth');
const palpitesRoutes = require('./routes/palpites');
const jogosRoutes = require('./routes/jogos');
const rankingRoutes = require('./routes/ranking');
const senhaRoutes = require('./routes/senha');
const extrasRoutes = require('./routes/extras');
const { router: adminRoutes } = require('./routes/admin');
const configRoutes = require('./routes/config');
const dashboardRoutes = require('./routes/dashboard');
const resumoRoutes = require('./routes/resumo');

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
  if (req.session && req.session.usuario) {
    return res.redirect('/dashboard');
  }
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
app.use('/dashboard', dashboardRoutes);
app.use('/resumo', resumoRoutes);

// Debug: verificar dado bruto no banco
app.get('/debug/jogo/:id', async (req, res) => {
  const jogo = await get('SELECT id, data, estadio, cidade, pais FROM jogos WHERE id = ?', [req.params.id]);
  res.json(jogo);
});

// Força correção dos horários
app.get('/debug/fix', async (req, res) => {
  const updates = [
    [1, '2026-06-11 16:00-03:00'], [2, '2026-06-11 23:00-03:00'],
    [3, '2026-06-12 16:00-03:00'], [4, '2026-06-12 22:00-03:00'],
    [5, '2026-06-13 22:00-03:00'], [6, '2026-06-14 01:00-03:00'],
    [7, '2026-06-13 19:00-03:00'], [8, '2026-06-13 16:00-03:00'],
    [9, '2026-06-14 20:00-03:00'], [10, '2026-06-14 14:00-03:00'],
    [11, '2026-06-14 17:00-03:00'], [12, '2026-06-14 23:00-03:00'],
    [13, '2026-06-15 22:00-03:00'], [14, '2026-06-15 13:00-03:00'],
    [15, '2026-06-15 16:00-03:00'], [16, '2026-06-15 19:00-03:00'],
    [17, '2026-06-16 16:00-03:00'], [18, '2026-06-16 19:00-03:00'],
    [19, '2026-06-16 22:00-03:00'], [20, '2026-06-17 01:00-03:00'],
    [21, '2026-06-17 14:00-03:00'], [22, '2026-06-17 17:00-03:00'],
    [23, '2026-06-17 21:00-03:00'], [24, '2026-06-17 20:00-03:00'],
    [25, '2026-06-18 22:00-03:00'], [26, '2026-06-18 16:00-03:00'],
    [27, '2026-06-18 19:00-03:00'], [28, '2026-06-18 13:00-03:00'],
    [29, '2026-06-19 19:00-03:00'], [30, '2026-06-19 21:30-03:00'],
    [31, '2026-06-19 16:00-03:00'], [32, '2026-06-20 00:00-03:00'],
    [33, '2026-06-20 17:00-03:00'], [34, '2026-06-20 21:00-03:00'],
    [35, '2026-06-20 14:00-03:00'], [36, '2026-06-20 23:00-03:00'],
    [37, '2026-06-21 16:00-03:00'], [38, '2026-06-21 22:00-03:00'],
    [39, '2026-06-21 13:00-03:00'], [40, '2026-06-21 19:00-03:00'],
    [41, '2026-06-22 18:00-03:00'], [42, '2026-06-22 21:00-03:00'],
    [43, '2026-06-22 14:00-03:00'], [44, '2026-06-23 00:00-03:00'],
    [45, '2026-06-23 14:00-03:00'], [46, '2026-06-23 20:00-03:00'],
    [47, '2026-06-23 23:00-03:00'], [48, '2026-06-23 17:00-03:00'],
    [49, '2026-06-24 19:00-03:00'], [50, '2026-06-24 19:00-03:00'],
    [51, '2026-06-24 22:00-03:00'], [52, '2026-06-24 22:00-03:00'],
    [53, '2026-06-24 16:00-03:00'], [54, '2026-06-24 16:00-03:00'],
    [55, '2026-06-25 17:00-03:00'], [56, '2026-06-25 17:00-03:00'],
    [57, '2026-06-25 23:00-03:00'], [58, '2026-06-25 23:00-03:00'],
    [59, '2026-06-25 20:00-03:00'], [60, '2026-06-25 20:00-03:00'],
    [61, '2026-06-26 16:00-03:00'], [62, '2026-06-26 16:00-03:00'],
    [63, '2026-06-27 00:00-03:00'], [64, '2026-06-27 00:00-03:00'],
    [65, '2026-06-26 21:00-03:00'], [66, '2026-06-26 21:00-03:00'],
    [67, '2026-06-27 18:00-03:00'], [68, '2026-06-27 18:00-03:00'],
    [69, '2026-06-27 23:00-03:00'], [70, '2026-06-27 23:00-03:00'],
    [71, '2026-06-27 20:30-03:00'], [72, '2026-06-27 20:30-03:00'],
  ];
  const results = [];
  for (const [id, data] of updates) {
    const r = await dbRun("UPDATE jogos SET data = ? WHERE id = ?", [data, id]);
    results.push({ id, changes: r.changes });
  }
  const j1 = await get('SELECT id, data FROM jogos WHERE id = 1');
  res.json({ status: 'ok', jogo1: j1, results: results.filter(r => r.changes === 0) });
});

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
