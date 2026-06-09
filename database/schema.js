const { run } = require('./db');

async function criarSchema() {
  // Tabela de usuários / participantes
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

  // Tabela de grupos da copa
  await run(`
    CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      letra TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL
    )
  `);

  // Tabela de seleções
  await run(`
    CREATE TABLE IF NOT EXISTS selecoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      nome_pt TEXT NOT NULL,
      sigla TEXT NOT NULL,
      bandeira_url TEXT,
      grupo_id INTEGER,
      FOREIGN KEY (grupo_id) REFERENCES grupos(id)
    )
  `);

  // Tabela de jogos
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

  // Tabela de palpites
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

  console.log('✅ Schema criado/verificado');
}

module.exports = { criarSchema };
