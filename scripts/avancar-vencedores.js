require('../database/db');
const { all } = require('../database/db');
const { avancarVencedor } = require('../services/mata-mata');

(async () => {
  const finalizados = await all(
    "SELECT id FROM jogos WHERE fase IN ('r32','r16','qf','sf') AND finalizado = 1 ORDER BY id"
  );
  const resultados = [];
  for (const j of finalizados) {
    resultados.push(await avancarVencedor(j.id));
  }
  console.log(JSON.stringify(resultados, null, 2));
  process.exit(0);
})();
