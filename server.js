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

// Força correção de todos os 72 jogos de grupo com Date() (funciona no pg)
app.get('/debug/fix', async (req, res) => {
  const updates = [
    [1, new Date('2026-06-11T19:00:00Z')], [2, new Date('2026-06-12T02:00:00Z')],
    [3, new Date('2026-06-12T19:00:00Z')], [4, new Date('2026-06-13T01:00:00Z')],
    [5, new Date('2026-06-14T01:00:00Z')], [6, new Date('2026-06-14T04:00:00Z')],
    [7, new Date('2026-06-13T22:00:00Z')], [8, new Date('2026-06-13T19:00:00Z')],
    [9, new Date('2026-06-14T23:00:00Z')], [10, new Date('2026-06-14T17:00:00Z')],
    [11, new Date('2026-06-14T20:00:00Z')], [12, new Date('2026-06-15T02:00:00Z')],
    [13, new Date('2026-06-16T01:00:00Z')], [14, new Date('2026-06-15T16:00:00Z')],
    [15, new Date('2026-06-15T19:00:00Z')], [16, new Date('2026-06-15T22:00:00Z')],
    [17, new Date('2026-06-16T19:00:00Z')], [18, new Date('2026-06-16T22:00:00Z')],
    [19, new Date('2026-06-17T01:00:00Z')], [20, new Date('2026-06-17T04:00:00Z')],
    [21, new Date('2026-06-17T17:00:00Z')], [22, new Date('2026-06-17T20:00:00Z')],
    [23, new Date('2026-06-18T00:00:00Z')], [24, new Date('2026-06-17T23:00:00Z')],
    [25, new Date('2026-06-19T01:00:00Z')], [26, new Date('2026-06-18T19:00:00Z')],
    [27, new Date('2026-06-18T22:00:00Z')], [28, new Date('2026-06-18T16:00:00Z')],
    [29, new Date('2026-06-19T22:00:00Z')], [30, new Date('2026-06-20T00:30:00Z')],
    [31, new Date('2026-06-19T19:00:00Z')], [32, new Date('2026-06-20T03:00:00Z')],
    [33, new Date('2026-06-20T20:00:00Z')], [34, new Date('2026-06-21T00:00:00Z')],
    [35, new Date('2026-06-20T17:00:00Z')], [36, new Date('2026-06-21T02:00:00Z')],
    [37, new Date('2026-06-21T19:00:00Z')], [38, new Date('2026-06-22T01:00:00Z')],
    [39, new Date('2026-06-21T16:00:00Z')], [40, new Date('2026-06-21T22:00:00Z')],
    [41, new Date('2026-06-22T21:00:00Z')], [42, new Date('2026-06-23T00:00:00Z')],
    [43, new Date('2026-06-22T17:00:00Z')], [44, new Date('2026-06-23T03:00:00Z')],
    [45, new Date('2026-06-23T17:00:00Z')], [46, new Date('2026-06-23T23:00:00Z')],
    [47, new Date('2026-06-24T02:00:00Z')], [48, new Date('2026-06-23T20:00:00Z')],
    [49, new Date('2026-06-24T22:00:00Z')], [50, new Date('2026-06-24T22:00:00Z')],
    [51, new Date('2026-06-25T01:00:00Z')], [52, new Date('2026-06-25T01:00:00Z')],
    [53, new Date('2026-06-24T19:00:00Z')], [54, new Date('2026-06-24T19:00:00Z')],
    [55, new Date('2026-06-25T20:00:00Z')], [56, new Date('2026-06-25T20:00:00Z')],
    [57, new Date('2026-06-26T02:00:00Z')], [58, new Date('2026-06-26T02:00:00Z')],
    [59, new Date('2026-06-25T23:00:00Z')], [60, new Date('2026-06-25T23:00:00Z')],
    [61, new Date('2026-06-26T19:00:00Z')], [62, new Date('2026-06-26T19:00:00Z')],
    [63, new Date('2026-06-27T03:00:00Z')], [64, new Date('2026-06-27T03:00:00Z')],
    [65, new Date('2026-06-27T00:00:00Z')], [66, new Date('2026-06-27T00:00:00Z')],
    [67, new Date('2026-06-27T21:00:00Z')], [68, new Date('2026-06-27T21:00:00Z')],
    [69, new Date('2026-06-28T02:00:00Z')], [70, new Date('2026-06-28T02:00:00Z')],
    [71, new Date('2026-06-27T23:30:00Z')], [72, new Date('2026-06-27T23:30:00Z')],
  ];
  const results = [];
  for (const [id, d] of updates) {
    const r = await dbRun("UPDATE jogos SET data = ? WHERE id = ?", [d, id]);
    results.push({ id, changes: r.changes });
  }
  const j1 = await get('SELECT id, data FROM jogos WHERE id = 1');
  const fails = results.filter(r => r.changes === 0);
  res.json({ status: 'ok', jogo1: j1, total: results.length, fails });
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
