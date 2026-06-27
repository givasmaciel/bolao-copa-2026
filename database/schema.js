const { run, get, all } = require('./db');

const usandoPG = !!process.env.DATABASE_URL;

async function criarSchema() {
  if (usandoPG) {
    await run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS grupos (
        id SERIAL PRIMARY KEY,
        letra TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS selecoes (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        nome_pt TEXT NOT NULL,
        sigla TEXT NOT NULL,
        bandeira_url TEXT,
        grupo_id INTEGER REFERENCES grupos(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS jogos (
        id INTEGER PRIMARY KEY,
        fase TEXT NOT NULL,
        rodada INTEGER NOT NULL,
        grupo_id INTEGER REFERENCES grupos(id),
        selecao_casa_id INTEGER REFERENCES selecoes(id),
        selecao_visitante_id INTEGER REFERENCES selecoes(id),
        data TIMESTAMPTZ NOT NULL,
        estadio TEXT,
        cidade TEXT,
        pais TEXT,
        gols_casa INTEGER,
        gols_visitante INTEGER,
        finalizado INTEGER DEFAULT 0
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS palpites (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        jogo_id INTEGER NOT NULL REFERENCES jogos(id) ON DELETE CASCADE,
        palpite_gols_casa INTEGER NOT NULL,
        palpite_gols_visitante INTEGER NOT NULL,
        pontos_obtidos INTEGER DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, jogo_id)
      )
    `);
  } else {
    await run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        username TEXT UNIQUE,
        senha_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS grupos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        letra TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS selecoes (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        nome_pt TEXT NOT NULL,
        sigla TEXT NOT NULL,
        bandeira_url TEXT,
        grupo_id INTEGER,
        FOREIGN KEY (grupo_id) REFERENCES grupos(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS jogos (
        id INTEGER PRIMARY KEY,
        fase TEXT NOT NULL,
        rodada INTEGER NOT NULL,
        grupo_id INTEGER,
        selecao_casa_id INTEGER,
        selecao_visitante_id INTEGER,
        data DATETIME NOT NULL,
        estadio TEXT,
        cidade TEXT,
        pais TEXT,
        gols_casa INTEGER,
        gols_visitante INTEGER,
        finalizado INTEGER DEFAULT 0,
        FOREIGN KEY (grupo_id) REFERENCES grupos(id),
        FOREIGN KEY (selecao_casa_id) REFERENCES selecoes(id),
        FOREIGN KEY (selecao_visitante_id) REFERENCES selecoes(id)
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS palpites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        jogo_id INTEGER NOT NULL,
        palpite_gols_casa INTEGER NOT NULL,
        palpite_gols_visitante INTEGER NOT NULL,
        pontos_obtidos INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, jogo_id),
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (jogo_id) REFERENCES jogos(id) ON DELETE CASCADE
      )
    `);
  }

  const tabelaReset = usandoPG
    ? `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expira_em TIMESTAMP NOT NULL,
        usado INTEGER DEFAULT 0,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    : `CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expira_em DATETIME NOT NULL,
        usado INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )`;

  await run(tabelaReset);

  // Tabela de sessões (store persistente)
  const tabelaSessoesPG = `
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires TIMESTAMPTZ
    )
  `;
  const tabelaSessoesSQLite = `
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires DATETIME
    )
  `;
  await run(usandoPG ? tabelaSessoesPG : tabelaSessoesSQLite);

  const tabelaExtrasPG = `
    CREATE TABLE IF NOT EXISTS palpites_extras (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      categoria TEXT NOT NULL,
      selecao_id INTEGER REFERENCES selecoes(id),
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(usuario_id, categoria, selecao_id)
    )
  `;
  const tabelaExtrasSQLite = `
    CREATE TABLE IF NOT EXISTS palpites_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      categoria TEXT NOT NULL,
      selecao_id INTEGER,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(usuario_id, categoria, selecao_id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `;
  await run(usandoPG ? tabelaExtrasPG : tabelaExtrasSQLite);

  const tabelaResultPG = `
    CREATE TABLE IF NOT EXISTS resultados_extras (
      id SERIAL PRIMARY KEY,
      categoria TEXT NOT NULL,
      selecao_id INTEGER REFERENCES selecoes(id),
      pontos INTEGER NOT NULL DEFAULT 0,
      UNIQUE(categoria, selecao_id)
    )
  `;
  const tabelaResultSQLite = `
    CREATE TABLE IF NOT EXISTS resultados_extras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT NOT NULL,
      selecao_id INTEGER,
      pontos INTEGER NOT NULL DEFAULT 0,
      UNIQUE(categoria, selecao_id)
    )
  `;
  await run(usandoPG ? tabelaResultPG : tabelaResultSQLite);

  // Tabela de configuração
  const configPG = `
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `;
  const configSQLite = `
    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `;
  await run(usandoPG ? configPG : configSQLite);

  // Migração: remover coluna tipo (não usada mais)
  try {
    if (usandoPG) {
      await run("ALTER TABLE jogos DROP COLUMN IF EXISTS tipo");
    } else {
      await run("ALTER TABLE jogos DROP COLUMN tipo");
    }
  } catch (e) {
    // Coluna já não existe ou SQLite antigo, ignorar
  }

  // Migração: adicionar coluna username para login alternativo
  try {
    if (usandoPG) {
      await run("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username TEXT");
    } else {
      await run("ALTER TABLE usuarios ADD COLUMN username TEXT");
    }
  } catch (e) {
    // Coluna já existe, ignorar
  }

  // Preenche username para usuários existentes que não têm
  try {
    if (usandoPG) {
      await run("UPDATE usuarios SET username = LOWER(SPLIT_PART(email, '@', 1)) WHERE username IS NULL AND email LIKE '%@%'");
    } else {
      await run("UPDATE usuarios SET username = LOWER(SUBSTR(email, 1, INSTR(email, '@') - 1)) WHERE username IS NULL AND email LIKE '%@%'");
    }
  } catch (e) {
    console.warn('Aviso: não foi possível preencher usernames automaticamente:', e.message);
  }

  // Migração: coluna foto para avatar do usuário
  try {
    if (usandoPG) {
      await run("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT");
    } else {
      await run("ALTER TABLE usuarios ADD COLUMN foto TEXT");
    }
  } catch (e) { /* Coluna já existe */ }

  // Migração 2026-06-19: coluna codigo_convite (código único para convite de participantes)
  try {
    if (usandoPG) {
      await run("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_convite TEXT");
    } else {
      await run("ALTER TABLE usuarios ADD COLUMN codigo_convite TEXT");
    }
  } catch (e) { /* Coluna já existe */ }

  // Migração 2026-06-15: coluna foto_base64 (foto persistente no banco, não some no deploy)
  try {
    if (usandoPG) {
      await run("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_base64 TEXT");
    } else {
      await run("ALTER TABLE usuarios ADD COLUMN foto_base64 TEXT");
    }
  } catch (e) { /* Coluna já existe */ }

  // Migração 2026-06-10: coluna palpite_limite (admin pode alterar prazo de cada jogo)
  try {
    if (usandoPG) {
      await run("ALTER TABLE jogos ADD COLUMN IF NOT EXISTS palpite_limite TIMESTAMPTZ");
    } else {
      await run("ALTER TABLE jogos ADD COLUMN palpite_limite DATETIME");
    }
  } catch (e) { /* Coluna já existe */ }

  // Migração 2026-06-10: coluna descricao (confronto descritivo para mata-mata)
  try {
    if (usandoPG) {
      await run("ALTER TABLE jogos ADD COLUMN IF NOT EXISTS descricao TEXT");
    } else {
      await run("ALTER TABLE jogos ADD COLUMN descricao TEXT");
    }
    // Preenche descricao para jogos de mata-mata
    const descricoes = [
      [73,'2ºA vs 2ºB'],[74,'1ºE vs 3ºA/B/C/D/F'],[75,'1ºF vs 2ºC'],[76,'1ºC vs 2ºF'],
      [77,'1ºI vs 3ºC/D/F/G/H'],[78,'2ºE vs 2ºI'],[79,'1ºA vs 3ºC/E/F/H/I'],[80,'1ºL vs 3ºE/H/I/J/K'],
      [81,'1ºD vs 3ºB/E/F/I/J'],[82,'1ºG vs 3ºA/E/H/I/J'],[83,'2ºK vs 2ºL'],[84,'1ºH vs 2ºJ'],
      [85,'1ºB vs 3ºE/F/G/I/J'],[86,'1ºJ vs 2ºH'],[87,'1ºK vs 3ºD/E/I/J/L'],[88,'2ºD vs 2ºG'],
      [89,'Vencedor 74 vs Vencedor 77'],[90,'Vencedor 73 vs Vencedor 75'],
      [91,'Vencedor 76 vs Vencedor 78'],[92,'Vencedor 79 vs Vencedor 80'],
      [93,'Vencedor 83 vs Vencedor 84'],[94,'Vencedor 81 vs Vencedor 82'],
      [95,'Vencedor 86 vs Vencedor 88'],[96,'Vencedor 85 vs Vencedor 87'],
      [97,'Vencedor 89 vs Vencedor 90'],[98,'Vencedor 93 vs Vencedor 94'],
      [99,'Vencedor 91 vs Vencedor 92'],[100,'Vencedor 95 vs Vencedor 96'],
      [101,'Vencedor 97 vs Vencedor 98'],[102,'Vencedor 99 vs Vencedor 100'],
      [103,'Perdedor 101 vs Perdedor 102'],[104,'Vencedor 101 vs Vencedor 102']
    ];
    for (const [id, d] of descricoes) {
      const existe = await get("SELECT id FROM jogos WHERE id = ? AND descricao IS NOT NULL", [id]);
      if (!existe) {
        await run("UPDATE jogos SET descricao = ? WHERE id = ?", [d, id]);
      }
    }
  } catch (e) { /* Coluna já existe ou erro */ }

  // Migração 2026-06-21: premiações padrão (1º/2º/3º lugar) na tabela config
  // Admin pode editar em /admin/premios
  try {
    const premiosDefault = [
      ['premio_1', '300.00'],
      ['premio_2', '125.00'],
      ['premio_3', '75.00']
    ];
    for (const [chave, valor] of premiosDefault) {
      const existe = await get('SELECT valor FROM config WHERE chave = ?', [chave]);
      if (!existe) {
        await run('INSERT INTO config (chave, valor) VALUES (?, ?)', [chave, valor]);
      }
    }
  } catch (e) {
    console.warn('Aviso: não foi possível popular premiações:', e.message);
  }

  // Migração 2026-06-21: suporte a prorrogação e pênaltis no mata-mata
  // Colunas nullable: placar prorrogação, placar pênaltis e classificado (quem avançou)
  try {
    if (usandoPG) {
      await run("ALTER TABLE jogos ADD COLUMN IF NOT EXISTS gols_casa_pror INTEGER");
      await run("ALTER TABLE jogos ADD COLUMN IF NOT EXISTS gols_visitante_pror INTEGER");
      await run("ALTER TABLE jogos ADD COLUMN IF NOT EXISTS placar_penaltis_casa INTEGER");
      await run("ALTER TABLE jogos ADD COLUMN IF NOT EXISTS placar_penaltis_visitante INTEGER");
      await run("ALTER TABLE jogos ADD COLUMN IF NOT EXISTS classificado_id INTEGER REFERENCES selecoes(id)");
    } else {
      try { await run("ALTER TABLE jogos ADD COLUMN gols_casa_pror INTEGER"); } catch (e) { /* já existe */ }
      try { await run("ALTER TABLE jogos ADD COLUMN gols_visitante_pror INTEGER"); } catch (e) { /* já existe */ }
      try { await run("ALTER TABLE jogos ADD COLUMN placar_penaltis_casa INTEGER"); } catch (e) { /* já existe */ }
      try { await run("ALTER TABLE jogos ADD COLUMN placar_penaltis_visitante INTEGER"); } catch (e) { /* já existe */ }
      try { await run("ALTER TABLE jogos ADD COLUMN classificado_id INTEGER REFERENCES selecoes(id)"); } catch (e) { /* já existe */ }
    }
  } catch (e) {
    console.warn('Aviso: não foi possível adicionar colunas de prorrogação/pênaltis:', e.message);
  }

  // Migração 2026-06-21: coluna palpite_classificado_id em palpites (usuário chuta quem classifica)
  try {
    if (usandoPG) {
      await run("ALTER TABLE palpites ADD COLUMN IF NOT EXISTS palpite_classificado_id INTEGER REFERENCES selecoes(id)");
    } else {
      try { await run("ALTER TABLE palpites ADD COLUMN palpite_classificado_id INTEGER REFERENCES selecoes(id)"); } catch (e) { /* já existe */ }
    }
  } catch (e) {
    console.warn('Aviso: não foi possível adicionar palpite_classificado_id:', e.message);
  }

  // Migração 2026-06-10: corrige todos os horários BRT e estádios dos 72 jogos de grupo
  // NOTA: usar Date() em vez de string para compatibilidade com PostgreSQL (pg serializa Date como TIMESTAMPTZ)
  const dt = (y, M, d, h, m) => new Date(Date.UTC(y, M-1, d, h+3, m));
  const updates = [
    // R1 id=1..24
    [1,  dt(2026,6,11,16,0),  'Estádio Azteca',               'Cidade do México',     'México'],
    [2,  dt(2026,6,11,23,0),  'Estádio Akron',                'Guadalajara',          'México'],
    [3,  dt(2026,6,12,16,0),  'BMO Field',                    'Toronto',              'Canadá'],
    [4,  dt(2026,6,12,22,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
    [5,  dt(2026,6,13,22,0),  'Gillette Stadium',             'Boston',               'EUA'],
    [6,  dt(2026,6,14,1,0),   'BC Place',                     'Vancouver',            'Canadá'],
    [7,  dt(2026,6,13,19,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
    [8,  dt(2026,6,13,16,0),  'Levi\'s Stadium',              'San Francisco',        'EUA'],
    [9,  dt(2026,6,14,20,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
    [10, dt(2026,6,14,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
    [11, dt(2026,6,14,17,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
    [12, dt(2026,6,14,23,0),  'Estádio BBVA',                 'Monterrey',            'México'],
    [13, dt(2026,6,15,22,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
    [14, dt(2026,6,15,13,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
    [15, dt(2026,6,15,16,0),  'Lumen Field',                  'Seattle',              'EUA'],
    [16, dt(2026,6,15,19,0),  'Hard Rock Stadium',            'Miami',                'EUA'],
    [17, dt(2026,6,16,16,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
    [18, dt(2026,6,16,19,0),  'Gillette Stadium',             'Boston',               'EUA'],
    [19, dt(2026,6,16,22,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
    [20, dt(2026,6,17,1,0),   'Levi\'s Stadium',              'San Francisco',        'EUA'],
    [21, dt(2026,6,17,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
    [22, dt(2026,6,17,17,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
    [23, dt(2026,6,17,23,0),  'Estádio Azteca',               'Cidade do México',     'México'],
    [24, dt(2026,6,17,20,0),  'BMO Field',                    'Toronto',              'Canadá'],
    // R2 id=25..48
    [25, dt(2026,6,18,22,0),  'Estádio Akron',                'Guadalajara',          'México'],
    [26, dt(2026,6,18,16,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
    [27, dt(2026,6,18,19,0),  'BC Place',                     'Vancouver',            'Canadá'],
    [28, dt(2026,6,18,13,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
    [29, dt(2026,6,19,19,0),  'Gillette Stadium',             'Boston',               'EUA'],
    [30, dt(2026,6,19,21,30), 'Lincoln Financial Field',      'Filadélfia',           'EUA'],
    [31, dt(2026,6,19,16,0),  'Lumen Field',                  'Seattle',              'EUA'],
    [32, dt(2026,6,20,0,0),   'Levi\'s Stadium',              'San Francisco',        'EUA'],
    [33, dt(2026,6,20,17,0),  'BMO Field',                    'Toronto',              'Canadá'],
    [34, dt(2026,6,20,21,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
    [35, dt(2026,6,20,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
    [36, dt(2026,6,21,1,0),   'Estádio BBVA',                 'Monterrey',            'México'],
    [37, dt(2026,6,21,16,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
    [38, dt(2026,6,21,22,0),  'BC Place',                     'Vancouver',            'Canadá'],
    [39, dt(2026,6,21,13,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
    [40, dt(2026,6,21,19,0),  'Hard Rock Stadium',            'Miami',                'EUA'],
    [41, dt(2026,6,22,18,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
    [42, dt(2026,6,22,21,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
    [43, dt(2026,6,22,14,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
    [44, dt(2026,6,23,0,0),   'Levi\'s Stadium',              'San Francisco',        'EUA'],
    [45, dt(2026,6,23,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
    [46, dt(2026,6,23,20,0),  'BMO Field',                    'Toronto',              'Canadá'],
    [47, dt(2026,6,23,23,0),  'Estádio Akron',                'Guadalajara',          'México'],
    [48, dt(2026,6,23,17,0),  'Gillette Stadium',             'Boston',               'EUA'],
    // R3 id=49..72
    [49, dt(2026,6,24,19,0),  'Hard Rock Stadium',            'Miami',                'EUA'],
    [50, dt(2026,6,24,19,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
    [51, dt(2026,6,24,22,0),  'Estádio BBVA',                 'Monterrey',            'México'],
    [52, dt(2026,6,24,22,0),  'Estádio Azteca',               'Cidade do México',     'México'],
    [53, dt(2026,6,24,16,0),  'Lumen Field',                  'Seattle',              'EUA'],
    [54, dt(2026,6,24,16,0),  'BC Place',                     'Vancouver',            'Canadá'],
    [55, dt(2026,6,25,17,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
    [56, dt(2026,6,25,17,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
    [57, dt(2026,6,25,23,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
    [58, dt(2026,6,25,23,0),  'Levi\'s Stadium',              'San Francisco',        'EUA'],
    [59, dt(2026,6,25,20,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
    [60, dt(2026,6,25,20,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
    [61, dt(2026,6,26,16,0),  'BMO Field',                    'Toronto',              'Canadá'],
    [62, dt(2026,6,26,16,0),  'Gillette Stadium',             'Boston',               'EUA'],
    [63, dt(2026,6,27,0,0),   'Lumen Field',                  'Seattle',              'EUA'],
    [64, dt(2026,6,27,0,0),   'BC Place',                     'Vancouver',            'Canadá'],
    [65, dt(2026,6,26,21,0),  'NRG Stadium',                  'Houston',              'EUA'],
    [66, dt(2026,6,26,21,0),  'Estádio Akron',                'Guadalajara',          'México'],
    [67, dt(2026,6,27,18,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
    [68, dt(2026,6,27,18,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
    [69, dt(2026,6,27,23,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
    [70, dt(2026,6,27,23,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
    [71, dt(2026,6,27,20,30), 'Hard Rock Stadium',            'Miami',                'EUA'],
    [72, dt(2026,6,27,20,30), 'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
  ];
  for (const [id, data, estadio, cidade, pais] of updates) {
    await run("UPDATE jogos SET data = COALESCE(data, ?), estadio = COALESCE(estadio, ?), cidade = COALESCE(cidade, ?), pais = COALESCE(pais, ?) WHERE id = ?", [data, estadio, cidade, pais, id]);
  }

  // Migração 2026-06-11: tabela de pontos bônus (admin premia participantes que entraram tarde)
  try {
    const tabelaBonusPG = `
      CREATE TABLE IF NOT EXISTS pontos_bonus (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        pontos INTEGER NOT NULL DEFAULT 0,
        motivo TEXT,
        criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    const tabelaBonusSQLite = `
      CREATE TABLE IF NOT EXISTS pontos_bonus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        pontos INTEGER NOT NULL DEFAULT 0,
        motivo TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
      )
    `;
    await run(usandoPG ? tabelaBonusPG : tabelaBonusSQLite);
  } catch (e) { /* Tabela já existe */ }

  // Migração 2026-06-11: tabela de pontuação por fase (mata-mata vale mais)
  try {
    const tabelaFasePG = `
      CREATE TABLE IF NOT EXISTS fase_pontuacao (
        fase TEXT PRIMARY KEY,
        pts_exato INTEGER NOT NULL DEFAULT 20,
        pts_empate INTEGER NOT NULL DEFAULT 14,
        pts_resultado_gol INTEGER NOT NULL DEFAULT 14,
        pts_resultado INTEGER NOT NULL DEFAULT 8,
        pts_gol INTEGER NOT NULL DEFAULT 3
      )
    `;
    const tabelaFaseSQLite = `
      CREATE TABLE IF NOT EXISTS fase_pontuacao (
        fase TEXT PRIMARY KEY,
        pts_exato INTEGER NOT NULL DEFAULT 20,
        pts_empate INTEGER NOT NULL DEFAULT 14,
        pts_resultado_gol INTEGER NOT NULL DEFAULT 14,
        pts_resultado INTEGER NOT NULL DEFAULT 8,
        pts_gol INTEGER NOT NULL DEFAULT 3
      )
    `;
    await run(usandoPG ? tabelaFasePG : tabelaFaseSQLite);
  } catch (e) { /* Tabela já existe */ }
  // Seed valores default se tabela vazia (fora do try anterior para garantir execução)
  try {
    const count = await get('SELECT COUNT(*) AS total FROM fase_pontuacao');
    if (count && Number(count.total) === 0) {
      const fases = [
        ['grupo', 20, 14, 14, 8, 3],
        ['r32', 25, 18, 18, 10, 4],
        ['r16', 30, 20, 20, 12, 5],
        ['qf', 40, 28, 28, 16, 6],
        ['sf', 50, 35, 35, 20, 8],
        // 3º lugar: entre Semi (50) e Final (80), progressão simétrica +15/+15
        // (antes era 30/20/20/12/5, igual a Oitavas — regredia sem lógica)
        ['terceiro', 65, 45, 45, 25, 9],
        ['final', 80, 50, 50, 30, 10]
      ];
      for (const f of fases) {
        await run('INSERT INTO fase_pontuacao (fase, pts_exato, pts_empate, pts_resultado_gol, pts_resultado, pts_gol) VALUES (?, ?, ?, ?, ?, ?)', f);
      }
    }
  } catch (e) {
    console.warn('Aviso: não foi possível popular fase_pontuacao:', e.message);
  }

  // Migração 2026-06-21: coluna pts_classificado em fase_pontuacao (bônus por acertar quem classifica nos mata-mata)
  // Default = metade do pts_resultado de cada fase (configurável em /admin/pontuacao-fases)
  try {
    if (usandoPG) {
      await run("ALTER TABLE fase_pontuacao ADD COLUMN IF NOT EXISTS pts_classificado INTEGER NOT NULL DEFAULT 5");
    } else {
      try { await run("ALTER TABLE fase_pontuacao ADD COLUMN pts_classificado INTEGER NOT NULL DEFAULT 5"); } catch (e) { /* coluna já existe */ }
    }
    // Atualiza valores de pts_classificado para quem ainda está NULL (coluna adicionada agora)
    // pts_classificado = metade do pts_resultado (arredondado para baixo), exceto grupo (0)
    const rows = await all('SELECT fase, pts_resultado FROM fase_pontuacao WHERE pts_classificado IS NULL');
    for (const row of rows) {
      const pts = row.fase === 'grupo' ? 0 : Math.floor(row.pts_resultado / 2);
      await run('UPDATE fase_pontuacao SET pts_classificado = ? WHERE fase = ?', [pts, row.fase]);
    }
  } catch (e) {
    console.warn('Aviso: não foi possível adicionar pts_classificado:', e.message);
  }

  // Fix 2026-06-21: recalcula pts_classificado pela metade do pts_resultado
  // (o DEFAULT 5 da migration anterior impediu o WHERE IS NULL de funcionar)
  try {
    const fixRows = await all('SELECT fase, pts_resultado, pts_classificado FROM fase_pontuacao');
    for (const row of fixRows) {
      const pts = row.fase === 'grupo' ? 0 : Math.floor(Number(row.pts_resultado) / 2);
      if (Number(row.pts_classificado) !== pts) {
        await run('UPDATE fase_pontuacao SET pts_classificado = ? WHERE fase = ?', [pts, row.fase]);
      }
    }
  } catch (e) {
    console.warn('Aviso: não foi possível recalcular pts_classificado:', e.message);
  }

  // Migração 2026-06-21: corrige pontuação do 3º lugar (estava igual a Oitavas: bug).
  // Idempotente: só atualiza se os valores ainda forem os antigos (30/20/20/12/5).
  // Novos valores: 65/45/45/25/9 — progressão simétrica +15/+15 entre Semi (50) e Final (80).
  // pts_classificado = Math.floor(25/2) = 12 (mesma fórmula das outras fases).
  try {
    const terceiroRow = await get("SELECT pts_exato, pts_empate, pts_resultado_gol, pts_resultado, pts_gol FROM fase_pontuacao WHERE fase = 'terceiro'");
    if (terceiroRow
      && Number(terceiroRow.pts_exato) === 30
      && Number(terceiroRow.pts_empate) === 20
      && Number(terceiroRow.pts_resultado_gol) === 20
      && Number(terceiroRow.pts_resultado) === 12
      && Number(terceiroRow.pts_gol) === 5) {
      await run(
        "UPDATE fase_pontuacao SET pts_exato = ?, pts_empate = ?, pts_resultado_gol = ?, pts_resultado = ?, pts_gol = ?, pts_classificado = ? WHERE fase = 'terceiro'",
        [65, 45, 45, 25, 9, 12]
      );
      console.log('✅ Pontuação do 3º lugar corrigida: 30/20/20/12/5 → 65/45/45/25/9 (pts_classificado 6 → 12)');
    }
  } catch (e) {
    console.warn('Aviso: não foi possível ajustar pontuação do 3º lugar:', e.message);
  }

  // Índices para performance
  try {
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_palpites_usuario_id ON palpites(usuario_id)',
      'CREATE INDEX IF NOT EXISTS idx_palpites_jogo_id ON palpites(jogo_id)',
      'CREATE INDEX IF NOT EXISTS idx_jogos_fase ON jogos(fase)',
      'CREATE INDEX IF NOT EXISTS idx_jogos_finalizado ON jogos(finalizado)',
      'CREATE INDEX IF NOT EXISTS idx_jogos_data ON jogos(data)',
      'CREATE INDEX IF NOT EXISTS idx_jogos_grupo_id ON jogos(grupo_id)',
      'CREATE INDEX IF NOT EXISTS idx_selecoes_grupo_id ON selecoes(grupo_id)',
      'CREATE INDEX IF NOT EXISTS idx_palpites_extras_usuario_id ON palpites_extras(usuario_id)',
      'CREATE INDEX IF NOT EXISTS idx_pontos_bonus_usuario_id ON pontos_bonus(usuario_id)',
    ];
    for (const sql of indices) {
      try { await run(sql); } catch (e) { /* ignorar se já existe ou SQLite não suporta IF NOT EXISTS em index */ }
    }
  } catch (e) { /* índices já existem */ }

  console.log('✅ Schema criado/verificado');
}

module.exports = { criarSchema };
