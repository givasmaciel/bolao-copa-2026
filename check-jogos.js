const { all } = require('./database/db');

setTimeout(() => {
  all('SELECT id, fase, data FROM jogos WHERE id IN (7, 9, 19)').then(rows => {
    console.log('=== Jogos 7, 9, 19 ===');
    rows.forEach(r => console.log('  #' + r.id, '|', r.fase, '|', r.data));
    return all('SELECT jogo_id, COUNT(*) as c FROM palpites GROUP BY jogo_id');
  }).then(rows => {
    console.log('=== Palpites por jogo ===');
    rows.forEach(r => console.log('  Jogo #' + r.jogo_id, ':', r.c, 'palpites'));
    process.exit(0);
  });
}, 200);
