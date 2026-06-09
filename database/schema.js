const { run } = require('./db');

async function criarSchema() {
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

  console.log('✅ Schema criado/verificado');
}

module.exports = { criarSchema };
