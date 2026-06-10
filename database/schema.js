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
        codigo_convite TEXT UNIQUE,
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

  await run('DROP TABLE IF EXISTS palpites_extras');
  await run('DROP TABLE IF EXISTS resultados_extras');

  const tabelaExtrasPG = `
    CREATE TABLE palpites_extras (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      categoria TEXT NOT NULL,
      selecao_id INTEGER REFERENCES selecoes(id),
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(usuario_id, categoria, selecao_id)
    )
  `;
  const tabelaExtrasSQLite = `
    CREATE TABLE palpites_extras (
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
    CREATE TABLE resultados_extras (
      id SERIAL PRIMARY KEY,
      categoria TEXT NOT NULL,
      selecao_id INTEGER REFERENCES selecoes(id),
      pontos INTEGER NOT NULL DEFAULT 0,
      UNIQUE(categoria, selecao_id)
    )
  `;
  const tabelaResultSQLite = `
    CREATE TABLE resultados_extras (
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

  // Migração: adicionar coluna codigo_convite para sistema de convite
  try {
    if (usandoPG) {
      await run("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_convite TEXT UNIQUE");
    } else {
      await run("ALTER TABLE usuarios ADD COLUMN codigo_convite TEXT");
    }
  } catch (e) {
    // Coluna já existe, ignorar
  }

  // Gera código de convite para usuários que não têm
  const semCodigo = await all("SELECT id FROM usuarios WHERE codigo_convite IS NULL");
  for (const u of semCodigo) {
    let codigo;
    do {
      codigo = Math.random().toString(36).substring(2, 10);
    } while (await get("SELECT id FROM usuarios WHERE codigo_convite = ?", [codigo]));
    await run("UPDATE usuarios SET codigo_convite = ? WHERE id = ?", [codigo, u.id]);
  }

  console.log('✅ Schema criado/verificado');
}

module.exports = { criarSchema };
