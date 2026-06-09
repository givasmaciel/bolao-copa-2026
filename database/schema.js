const { run } = require('./db');

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
        data TIMESTAMP NOT NULL,
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

  console.log('✅ Schema criado/verificado');
}

module.exports = { criarSchema };
