// scripts/dump-db-json.js — gera dump JSON de todas as tabelas do SQLite local
// Uso: node scripts/dump-db-json.js <caminho-do-arquivo-de-saida>
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const outPath = process.argv[2] || 'backup-dump.json';
const dbPath = path.join(__dirname, '..', 'data', 'bolao.db');

if (!fs.existsSync(dbPath)) {
  console.error('Banco SQLite não encontrado em', dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, { readonly: true });

db.serialize(() => {
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", (err, tabelas) => {
    if (err) { console.error(err); process.exit(1); }
    const dump = { _meta: { criado_em: new Date().toISOString(), banco: dbPath, total_tabelas: tabelas.length }, tabelas: {} };
    let pendentes = tabelas.length;

    if (pendentes === 0) {
      fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));
      console.log('Dump vazio salvo em', outPath);
      process.exit(0);
    }

    for (const { name } of tabelas) {
      db.all(`SELECT * FROM "${name}"`, (err, rows) => {
        if (err) { console.error(`Erro em ${name}:`, err.message); rows = []; }
        dump.tabelas[name] = rows;
        pendentes--;
        if (pendentes === 0) {
          fs.writeFileSync(outPath, JSON.stringify(dump, null, 2));
          const size = fs.statSync(outPath).size;
          const totalRows = Object.values(dump.tabelas).reduce((s, r) => s + r.length, 0);
          console.log(`Dump salvo em ${outPath} — ${(size/1024).toFixed(1)} KB — ${totalRows} registros em ${tabelas.length} tabelas`);
          db.close();
        }
      });
    }
  });
});
