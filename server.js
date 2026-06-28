require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const Sentry = require('@sentry/node');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');

const { criarSchema } = require('./database/schema');
const authRoutes = require('./routes/auth');
const palpitesRoutes = require('./routes/palpites');
const jogosRoutes = require('./routes/jogos');
const rankingRoutes = require('./routes/ranking');
const senhaRoutes = require('./routes/senha');
const extrasRoutes = require('./routes/extras');
const { router: adminRoutes } = require('./routes/admin');
const configRoutes = require('./routes/config');
const regrasRoutes = require('./routes/regras');
const DbSessionStore = require('./database/session-store');
const sessionStore = new DbSessionStore();
const dashboardRoutes = require('./routes/dashboard');
const resumoRoutes = require('./routes/resumo');
const classificacaoRoutes = require('./routes/classificacao');
const { all, get } = require('./database/db');
const { PALPITE_MARGEM_MS } = require('./services/palpite-config');
const { getStatus: getPlacarStatus } = require('./services/placar-automatico');

const app = express();
const PORT = process.env.PORT || 3000;

// Rede de proteção: nunca deixar o processo morrer por erro assíncrono não tratado.
// Loga o stack e mantém o serviço de pé. Em produção, Render não fica em crash-loop.
process.on('unhandledRejection', (reason, promise) => {
  logger.error('unhandledRejection', {
    error: reason?.message || String(reason),
    stack: reason?.stack
  });
});
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', { error: err.message, stack: err.stack });
});

// Sentry — só inicializa em produção E se SENTRY_DSN estiver definido
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: 'production',
    tracesSampleRate: 0.1,
    // filtra ruído: não reporta healthz/favicon/admin
    beforeSend(event) {
      const url = event.request?.url || '';
      if (url.includes('/healthz') || url.includes('/favicon') || url.includes('/admin')) return null;
      return event;
    }
  });
  app.use(Sentry.Handlers.requestHandler());
  logger.info('sentry inicializado em produção');
} else if (process.env.SENTRY_DSN) {
  logger.info('SENTRY_DSN definido mas NODE_ENV != production, ignorando');
}

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Trust proxy (Render, Heroku, etc)
app.set('trust proxy', 1);

// Content-Security-Policy — protege contra XSS limitando origens
app.use((req, res, next) => {
  // Permite inline styles/scripts (EJS usa) e imagens externas (flagcdn para bandeiras)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https://flagcdn.com https://*.flagcdn.com; " +
    "font-src 'self' data:; " +
    "connect-src 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'none'"
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

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

// Segurança: SESSION_SECRET em produção deve ser explícito, não o fallback
if (process.env.NODE_ENV === 'production') {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret === 'bolao-copa-2026-secret') {
    console.error('❌ NODE_ENV=production mas SESSION_SECRET não está definido ou usa o valor padrão.');
    console.error('   Defina uma string única e longa em .env: SESSION_SECRET=sua-chave-aqui');
    process.exit(1);
  }
}

// Identifica qual banco está conectado (lê uma vez no boot e cacheia)
// Resolvido: agora é um Promise para evitar race condition — o server só inicia DEPOIS que dbMarker está pronto
const dbMarkerPromise = (async () => {
  try {
    const m = await get("SELECT valor FROM config WHERE chave = 'db_marker'");
    if (m && m.valor) return m.valor;
    // Não tem marcador ainda — pega host do DATABASE_URL como fallback
    const u = process.env.DATABASE_URL || '';
    return u.split('@')[1]?.split('/')[0] || 'local';
  } catch (e) {
    logger.warn('boot erro lendo db_marker', { error: e.message });
    return 'erro';
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
app.use(async (req, res, next) => {
  res.locals.sucesso = req.flash('sucesso');
  res.locals.erro = req.flash('erro');
  res.locals.aviso = req.flash('aviso');
  res.locals.usuario = req.session.usuario || null;
  res.locals.PALPITE_MARGEM_MS = PALPITE_MARGEM_MS;
  res.locals.dbMarker = await dbMarkerPromise;
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

// Health check — usado por Render / monitoramento externo
// Rate limit: max 60 req/min por IP (protege contra abuso)
const healthzLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'rate_limited', erro: 'Muitas requisições. Tente em 1 minuto.' }
});

// Cache em memória (30s) — evita queries repetidas no banco
let healthzCache = { data: null, expiresAt: 0 };
const HEALTHZ_CACHE_MS = 30 * 1000;

app.get('/healthz', healthzLimiter, async (req, res) => {
  // serve do cache se ainda válido (exceto se banco estava degraded)
  if (healthzCache.data && Date.now() < healthzCache.expiresAt) {
    res.set('X-Cache', 'HIT');
    return res.json(healthzCache.data);
  }
  const start = Date.now();
  try {
    const dbCheck = await get('SELECT 1 AS ok');
    const dbLatencyMs = Date.now() - start;
    const [contagens, marcacaoDb] = await Promise.all([
      Promise.all([
        get('SELECT COUNT(*) AS c FROM usuarios'),
        get('SELECT COUNT(*) AS c FROM jogos'),
        get('SELECT COUNT(*) AS c FROM palpites'),
        get('SELECT COUNT(*) AS c FROM jogos WHERE finalizado = 1'),
      ]),
      dbMarkerPromise,
    ]);
    const [usuarios, jogos, palpites, jogosFinalizados] = contagens.map(r => r?.c || 0);

    // Verificações proativas
    const problemas = [];

    // 1) Jogos finalizados sem pontos calculados (indicaria bug no recalculate)
    // Exclui jogos sem palpites (ninguém jogou) — foco em finalizados com palpites mas sem pontos
    const finalizadosSemPontos = await get(`
      SELECT COUNT(*) AS c FROM jogos j
      WHERE j.finalizado = 1
        AND EXISTS (SELECT 1 FROM palpites WHERE jogo_id = j.id)
        AND NOT EXISTS (SELECT 1 FROM palpites WHERE jogo_id = j.id AND pontos_obtidos > 0)
    `);
    if (finalizadosSemPontos?.c > 0) {
      problemas.push(`jogos_finalizados_sem_pontos:${finalizadosSemPontos.c}`);
    }

    // 2) Placar automático parado (>25 min desde última execução)
    const placarStatus = getPlacarStatus();
    if (placarStatus.ultimaExecucao) {
      const minDesdeUltimaExec = (Date.now() - placarStatus.ultimaExecucao.getTime()) / 60000;
      if (minDesdeUltimaExec > 25) {
        problemas.push(`placar_parado_min:${Math.round(minDesdeUltimaExec)}`);
      }
    }

    const data = {
      status: problemas.length > 0 ? 'degraded' : 'ok',
      uptime_segundos: Math.round(process.uptime()),
      db: { conectado: !!dbCheck?.ok, marcador: marcacaoDb, latencia_ms: dbLatencyMs },
      contagens: { usuarios, jogos, palpites, jogos_finalizados: jogosFinalizados },
      versao_node: process.version,
      timestamp: new Date().toISOString(),
      ...(problemas.length > 0 && { problemas }),
    };
    healthzCache = { data, expiresAt: Date.now() + HEALTHZ_CACHE_MS };
    res.set('X-Cache', 'MISS');
    res.json(data);
  } catch (err) {
    // não cacheia erros — Render precisa ver o 503 imediatamente
    res.status(503).json({
      status: 'degraded',
      erro: err.message,
      db: { conectado: false, marcador: await dbMarkerPromise },
      uptime_segundos: Math.round(process.uptime())
    });
  }
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
app.use('/regras', regrasRoutes);

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
    const agora = new Date();
    const jogo = await get(`
      SELECT j.id, j.data, j.palpite_limite,
        sc.nome_pt AS casa_pt, sc.sigla AS casa_sigla, sc.bandeira_url AS casa_bandeira,
        sv.nome_pt AS visitante_pt, sv.sigla AS visitante_sigla, sv.bandeira_url AS visitante_bandeira
      FROM jogos j
      LEFT JOIN selecoes sc ON j.selecao_casa_id = sc.id
      LEFT JOIN selecoes sv ON j.selecao_visitante_id = sv.id
      WHERE j.finalizado = 0 AND j.selecao_casa_id IS NOT NULL AND j.data > ?
      ORDER BY j.data ASC LIMIT 1
    `, [agora]);
    if (!jogo) return res.json({ ok: false });
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

// Sentry error handler (deve vir DEPOIS das rotas, ANTES do error handler nosso)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Error handler
app.use((err, req, res, next) => {
  logger.error('unhandled error', { error: err.message, stack: err.stack, url: req.originalUrl });
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
