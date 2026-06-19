require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
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
const DbSessionStore = require('./database/session-store');
const sessionStore = new DbSessionStore();
const dashboardRoutes = require('./routes/dashboard');
const resumoRoutes = require('./routes/resumo');
const classificacaoRoutes = require('./routes/classificacao');
const { all, get } = require('./database/db');
const { PALPITE_MARGEM_MS } = require('./services/palpite-config');

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
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bolao-copa-2026-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 dias
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
app.use(flash());

// Identifica qual banco está conectado (lê uma vez no boot e cacheia)
let dbMarker = 'desconhecido';
(async () => {
  try {
    const m = await get("SELECT valor FROM config WHERE chave = 'db_marker'");
    if (m && m.valor) dbMarker = m.valor;
    else {
      // Não tem marcador ainda — pega host do DATABASE_URL como fallback
      const u = process.env.DATABASE_URL || '';
      const h = u.split('@')[1]?.split('/')[0] || 'local';
      dbMarker = h;
    }
    console.log('[boot] dbMarker =', dbMarker);
  } catch (e) {
    console.warn('[boot] erro lendo db_marker:', e.message);
  }
})();

// CSRF token — gera e valida
const crypto = require('crypto');
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomUUID();
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

// Middleware de validação CSRF para métodos que alteram estado
function csrfProtection(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  // Uploads multipart: CSRF vem como query param na URL (req.query._csrf)
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
    console.warn('CSRF inválido:', {
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
app.use(csrfProtection);

// Disponibiliza flash messages, usuário e constantes para as views
app.use((req, res, next) => {
  res.locals.sucesso = req.flash('sucesso');
  res.locals.erro = req.flash('erro');
  res.locals.aviso = req.flash('aviso');
  res.locals.usuario = req.session.usuario || null;
  res.locals.PALPITE_MARGEM_MS = PALPITE_MARGEM_MS;
  res.locals.dbMarker = dbMarker;
  next();
});

// Garante que foto do usuário esteja sempre na sessão e views
app.use(async (req, res, next) => {
  if (req.session?.usuario?.id) {
    try {
      const row = await get('SELECT foto FROM usuarios WHERE id = ?', [req.session.usuario.id]);
      req.session.usuario.foto = row?.foto || null;
      res.locals.usuario = req.session.usuario;
    } catch (e) { /* fallback silencioso */ }
  }
  next();
});

// Rotas
app.get('/', async (req, res) => {
  if (req.session && req.session.usuario) {
    return res.redirect('/dashboard');
  }
  try {
    const [pontuacaoFases, totalJogosRow] = await Promise.all([
      all('SELECT * FROM fase_pontuacao ORDER BY CASE fase WHEN \'grupo\' THEN 1 WHEN \'r32\' THEN 2 WHEN \'r16\' THEN 3 WHEN \'qf\' THEN 4 WHEN \'sf\' THEN 5 WHEN \'terceiro\' THEN 6 WHEN \'final\' THEN 7 END'),
      get('SELECT COUNT(*) AS total FROM jogos')
    ]);
    res.render('home', { title: 'Bolão da Copa 2026', pontuacaoFases, totalJogos: totalJogosRow?.total || 0 });
  } catch (e) {
    res.render('home', { title: 'Bolão da Copa 2026', pontuacaoFases: [], totalJogos: 0 });
  }
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
app.use('/classificacao', classificacaoRoutes);

// GET /foto/:id — serve a foto do usuário com fallback SVG (iniciais) se o arquivo sumiu (deploy Render)
app.get('/foto/:id', async (req, res) => {
  try {
    const usuario = await get('SELECT nome, foto, foto_base64 FROM usuarios WHERE id = ?', [req.params.id]);
    if (!usuario) return res.status(404).type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#ccc" width="200" height="200"/><text x="100" y="115" text-anchor="middle" font-size="60" fill="#666" font-family="sans-serif">?</text></svg>');

    // 1. Tenta base64 do banco (persiste após deploy)
    if (usuario.foto_base64) {
      const parts = usuario.foto_base64.match(/^data:(image\/\w+);base64,(.+)$/);
      if (parts) {
        res.type(parts[1]);
        return res.send(Buffer.from(parts[2], 'base64'));
      }
    }

    // 2. Fallback: arquivo no disco
    const fs = require('fs');
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (usuario.foto) {
      const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith(`usuario-${req.params.id}.`));
      if (files.length > 0) {
        const filePath = path.join(uploadsDir, files[0]);
        const ext = path.extname(files[0]).toLowerCase();
        const mime = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };
        res.type(mime[ext] || 'application/octet-stream');
        return res.sendFile(filePath);
      }
    }

    // 3. Fallback final: SVG com iniciais
    const nome = usuario.nome || '?';
    const palavras = nome.trim().split(/\s+/);
    const iniciais = palavras.length >= 2 ? (palavras[0][0] + palavras[palavras.length - 1][0]).toUpperCase() : nome.substring(0, 2).toUpperCase();
    const cor = ['#22c55e','#3b82f6','#ef4444','#ca8a04','#a855f7','#06b6d4','#ec4899'][Number(req.params.id) % 7];
    res.type('svg');
    res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="${cor}" width="200" height="200"/><text x="100" y="120" text-anchor="middle" font-size="64" fill="white" font-family="sans-serif" font-weight="bold">${iniciais}</text></svg>`);
  } catch (e) {
    res.status(500).type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#ccc" width="200" height="200"/><text x="100" y="115" text-anchor="middle" font-size="60" fill="#666" font-family="sans-serif">?</text></svg>');
  }
});

// API: próximo jogo (para countdown no header)
app.get('/api/proximo-jogo', async (req, res) => {
  try {
    const { get, all } = require('./database/db');
    const jogo = await get(`
      SELECT j.id, j.data, j.palpite_limite,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      WHERE j.finalizado = 0 AND j.selecao_casa_id IS NOT NULL
      ORDER BY j.data ASC LIMIT 1
    `);
    if (!jogo) return res.json({ ok: false });
    const agora = new Date();
    const dataJogo = new Date(jogo.data);
    const limite = jogo.palpite_limite ? new Date(jogo.palpite_limite) : null;
    const margem = limite || new Date(dataJogo.getTime() - PALPITE_MARGEM_MS);
    res.json({
      ok: true,
      casa: jogo.casa_pt,
      visitante: jogo.visitante_pt,
      bandeiraCasa: jogo.casa_bandeira,
      bandeiraVisitante: jogo.visitante_bandeira,
      fechaEm: margem.toISOString(),
      data: dataJogo.toISOString()
    });
  } catch (err) {
    console.error('Erro ao buscar próximo jogo:', err);
    res.json({ ok: false });
  }
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: 'Página não encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.locals.usuario = req.session?.usuario || null;
  res.status(500).render('500', { title: 'Erro interno' });
});

(async () => {
  try {
    await criarSchema();

    // Limpa sessões expiradas no startup e a cada 1h
    sessionStore.clearExpired();
    setInterval(() => sessionStore.clearExpired(), 60 * 60 * 1000);

    // Placar automático: busca resultados a cada 16 minutos
    // Marca como finalizado e recalcula pontos automaticamente
    const { buscarPlacares } = require('./services/placar-automatico');
    buscarPlacares();
    setInterval(() => buscarPlacares(), 16 * 60 * 1000);
    console.log('⏰ Placar automático ativo — verifica a cada 16 minutos');

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
