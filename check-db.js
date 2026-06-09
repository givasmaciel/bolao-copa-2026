const { all } = require('./database/db');

setTimeout(() => {
  all(`
    SELECT u.nome, p.jogo_id, p.palpite_gols_casa, p.palpite_gols_visitante, p.pontos_obtidos
    FROM palpites p
    JOIN usuarios u ON u.id = p.usuario_id
    ORDER BY u.nome, p.jogo_id
  `).then(rows => {
    console.log('=== Palpites no banco ===');
    if (rows.length === 0) { console.log('(vazio)'); }
    rows.forEach(r => console.log('  -', r.nome, '| Jogo #' + r.jogo_id, '|', r.palpite_gols_casa + 'x' + r.palpite_gols_visitante, '| Pontos:', r.pontos_obtidos));
    process.exit(0);
  }).catch(err => { console.error(err); process.exit(1); });
}, 200);
