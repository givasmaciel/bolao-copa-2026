// Resetar palpites e jogos finalizados para teste limpo
const { run } = require('./database/db');

(async () => {
  await run('DELETE FROM palpites');
  await run('UPDATE jogos SET gols_casa = NULL, gols_visitante = NULL, finalizado = 0');
  console.log('✅ Palpites e resultados zerados');
  process.exit(0);
})();
