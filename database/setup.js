const { criarSchema } = require('./schema');
const { run, get } = require('./db');
const bcrypt = require('bcryptjs');

async function setup() {
  console.log('⚙️  Verificando banco de dados...');

  // 1. Cria schema se não existir
  await criarSchema();

  // 2. Verifica se já tem dados (selecoes)
  const count = await get('SELECT COUNT(*) AS total FROM selecoes');
  if (!count || Number(count.total) === 0) {
    console.log('🌱 Banco vazio. Executando seed...');
    const { seed } = require('./seed');
    await seed();
  } else {
    console.log(`✅ Banco já possui dados (${count.total} seleções). Pulando seed.`);
  }

  // 3. Corrige horários BRT e estádios de todos os jogos de grupo
  const jogosCount = await get('SELECT COUNT(*) AS total FROM jogos');
  if (jogosCount && Number(jogosCount.total) > 0) {
    const updates = [
      [1,  '2026-06-11 16:00-03:00', 'Estádio Azteca',               'Cidade do México',     'México'],
      [2,  '2026-06-11 23:00-03:00', 'Estádio Akron',                'Guadalajara',          'México'],
      [3,  '2026-06-12 16:00-03:00', 'BMO Field',                    'Toronto',              'Canadá'],
      [4,  '2026-06-12 22:00-03:00', 'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [5,  '2026-06-13 22:00-03:00', 'Gillette Stadium',             'Boston',               'EUA'],
      [6,  '2026-06-14 01:00-03:00', 'BC Place',                     'Vancouver',            'Canadá'],
      [7,  '2026-06-13 19:00-03:00', 'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [8,  '2026-06-13 16:00-03:00', 'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [9,  '2026-06-14 20:00-03:00', 'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [10, '2026-06-14 14:00-03:00', 'NRG Stadium',                  'Houston',              'EUA'],
      [11, '2026-06-14 17:00-03:00', 'AT&T Stadium',                 'Dallas',               'EUA'],
      [12, '2026-06-14 23:00-03:00', 'Estádio BBVA',                 'Monterrey',            'México'],
      [13, '2026-06-15 22:00-03:00', 'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [14, '2026-06-15 13:00-03:00', 'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [15, '2026-06-15 16:00-03:00', 'Lumen Field',                  'Seattle',              'EUA'],
      [16, '2026-06-15 19:00-03:00', 'Hard Rock Stadium',            'Miami',                'EUA'],
      [17, '2026-06-16 16:00-03:00', 'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [18, '2026-06-16 19:00-03:00', 'Gillette Stadium',             'Boston',               'EUA'],
      [19, '2026-06-16 22:00-03:00', 'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [20, '2026-06-17 01:00-03:00', 'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [21, '2026-06-17 14:00-03:00', 'NRG Stadium',                  'Houston',              'EUA'],
      [22, '2026-06-17 17:00-03:00', 'AT&T Stadium',                 'Dallas',               'EUA'],
      [23, '2026-06-17 21:00-03:00', 'Estádio Azteca',               'Cidade do México',     'México'],
      [24, '2026-06-17 20:00-03:00', 'BMO Field',                    'Toronto',              'Canadá'],
      [25, '2026-06-18 22:00-03:00', 'Estádio Akron',                'Guadalajara',          'México'],
      [26, '2026-06-18 16:00-03:00', 'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [27, '2026-06-18 19:00-03:00', 'BC Place',                     'Vancouver',            'Canadá'],
      [28, '2026-06-18 13:00-03:00', 'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [29, '2026-06-19 19:00-03:00', 'Gillette Stadium',             'Boston',               'EUA'],
      [30, '2026-06-19 21:30-03:00', 'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [31, '2026-06-19 16:00-03:00', 'Lumen Field',                  'Seattle',              'EUA'],
      [32, '2026-06-20 00:00-03:00', 'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [33, '2026-06-20 17:00-03:00', 'BMO Field',                    'Toronto',              'Canadá'],
      [34, '2026-06-20 21:00-03:00', 'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [35, '2026-06-20 14:00-03:00', 'NRG Stadium',                  'Houston',              'EUA'],
      [36, '2026-06-20 23:00-03:00', 'Estádio BBVA',                 'Monterrey',            'México'],
      [37, '2026-06-21 16:00-03:00', 'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [38, '2026-06-21 22:00-03:00', 'BC Place',                     'Vancouver',            'Canadá'],
      [39, '2026-06-21 13:00-03:00', 'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [40, '2026-06-21 19:00-03:00', 'Hard Rock Stadium',            'Miami',                'EUA'],
      [41, '2026-06-22 18:00-03:00', 'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [42, '2026-06-22 21:00-03:00', 'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [43, '2026-06-22 14:00-03:00', 'AT&T Stadium',                 'Dallas',               'EUA'],
      [44, '2026-06-23 00:00-03:00', 'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [45, '2026-06-23 14:00-03:00', 'NRG Stadium',                  'Houston',              'EUA'],
      [46, '2026-06-23 20:00-03:00', 'BMO Field',                    'Toronto',              'Canadá'],
      [47, '2026-06-23 23:00-03:00', 'Estádio Akron',                'Guadalajara',          'México'],
      [48, '2026-06-23 17:00-03:00', 'Gillette Stadium',             'Boston',               'EUA'],
      [49, '2026-06-24 19:00-03:00', 'Hard Rock Stadium',            'Miami',                'EUA'],
      [50, '2026-06-24 19:00-03:00', 'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [51, '2026-06-24 22:00-03:00', 'Estádio BBVA',                 'Monterrey',            'México'],
      [52, '2026-06-24 22:00-03:00', 'Estádio Azteca',               'Cidade do México',     'México'],
      [53, '2026-06-24 16:00-03:00', 'Lumen Field',                  'Seattle',              'EUA'],
      [54, '2026-06-24 16:00-03:00', 'BC Place',                     'Vancouver',            'Canadá'],
      [55, '2026-06-25 17:00-03:00', 'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [56, '2026-06-25 17:00-03:00', 'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [57, '2026-06-25 23:00-03:00', 'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [58, '2026-06-25 23:00-03:00', 'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [59, '2026-06-25 20:00-03:00', 'AT&T Stadium',                 'Dallas',               'EUA'],
      [60, '2026-06-25 20:00-03:00', 'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [61, '2026-06-26 16:00-03:00', 'BMO Field',                    'Toronto',              'Canadá'],
      [62, '2026-06-26 16:00-03:00', 'Gillette Stadium',             'Boston',               'EUA'],
      [63, '2026-06-27 00:00-03:00', 'Lumen Field',                  'Seattle',              'EUA'],
      [64, '2026-06-27 00:00-03:00', 'BC Place',                     'Vancouver',            'Canadá'],
      [65, '2026-06-26 21:00-03:00', 'NRG Stadium',                  'Houston',              'EUA'],
      [66, '2026-06-26 21:00-03:00', 'Estádio Akron',                'Guadalajara',          'México'],
      [67, '2026-06-27 18:00-03:00', 'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [68, '2026-06-27 18:00-03:00', 'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [69, '2026-06-27 23:00-03:00', 'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [70, '2026-06-27 23:00-03:00', 'AT&T Stadium',                 'Dallas',               'EUA'],
      [71, '2026-06-27 20:30-03:00', 'Hard Rock Stadium',            'Miami',                'EUA'],
      [72, '2026-06-27 20:30-03:00', 'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
    ];
    for (const [id, data, estadio, cidade, pais] of updates) {
      const tsCast = process.env.DATABASE_URL ? '::timestamptz' : '';
      await run(`UPDATE jogos SET data = ?${tsCast}, estadio = ?, cidade = ?, pais = ? WHERE id = ?`, [data, estadio, cidade, pais, id]);
    }
    console.log(`✅ Horários de ${updates.length} jogos atualizados`);
  }

  // FORÇA atualização via pgPool direto (bypass do run)
  if (process.env.DATABASE_URL) {
    try {
      const { Pool } = require('pg');
      const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      const forceUpdates = [
        [1, '2026-06-11T19:00:00+00'], [2, '2026-06-12T02:00:00+00'],
        [3, '2026-06-12T19:00:00+00'], [4, '2026-06-13T01:00:00+00'],
        [5, '2026-06-14T01:00:00+00'], [6, '2026-06-14T04:00:00+00'],
        [7, '2026-06-13T22:00:00+00'], [8, '2026-06-13T19:00:00+00'],
        [9, '2026-06-14T23:00:00+00'], [10, '2026-06-14T17:00:00+00'],
        [11, '2026-06-14T20:00:00+00'], [12, '2026-06-15T02:00:00+00'],
        [13, '2026-06-16T01:00:00+00'], [14, '2026-06-15T16:00:00+00'],
        [15, '2026-06-15T19:00:00+00'], [16, '2026-06-15T22:00:00+00'],
        [17, '2026-06-16T19:00:00+00'], [18, '2026-06-16T22:00:00+00'],
        [19, '2026-06-17T01:00:00+00'], [20, '2026-06-17T04:00:00+00'],
        [21, '2026-06-17T17:00:00+00'], [22, '2026-06-17T20:00:00+00'],
        [23, '2026-06-18T00:00:00+00'], [24, '2026-06-17T23:00:00+00'],
        [25, '2026-06-19T01:00:00+00'], [26, '2026-06-18T19:00:00+00'],
        [27, '2026-06-18T22:00:00+00'], [28, '2026-06-18T16:00:00+00'],
        [29, '2026-06-19T22:00:00+00'], [30, '2026-06-20T00:30:00+00'],
        [31, '2026-06-19T19:00:00+00'], [32, '2026-06-20T03:00:00+00'],
        [33, '2026-06-20T20:00:00+00'], [34, '2026-06-21T00:00:00+00'],
        [35, '2026-06-20T17:00:00+00'], [36, '2026-06-21T02:00:00+00'],
        [37, '2026-06-21T19:00:00+00'], [38, '2026-06-22T01:00:00+00'],
        [39, '2026-06-21T16:00:00+00'], [40, '2026-06-21T22:00:00+00'],
        [41, '2026-06-22T21:00:00+00'], [42, '2026-06-23T00:00:00+00'],
        [43, '2026-06-22T17:00:00+00'], [44, '2026-06-23T03:00:00+00'],
        [45, '2026-06-23T17:00:00+00'], [46, '2026-06-23T23:00:00+00'],
        [47, '2026-06-24T02:00:00+00'], [48, '2026-06-23T20:00:00+00'],
        [49, '2026-06-24T22:00:00+00'], [50, '2026-06-24T22:00:00+00'],
        [51, '2026-06-25T01:00:00+00'], [52, '2026-06-25T01:00:00+00'],
        [53, '2026-06-24T19:00:00+00'], [54, '2026-06-24T19:00:00+00'],
        [55, '2026-06-25T20:00:00+00'], [56, '2026-06-25T20:00:00+00'],
        [57, '2026-06-26T02:00:00+00'], [58, '2026-06-26T02:00:00+00'],
        [59, '2026-06-25T23:00:00+00'], [60, '2026-06-25T23:00:00+00'],
        [61, '2026-06-26T19:00:00+00'], [62, '2026-06-26T19:00:00+00'],
        [63, '2026-06-27T03:00:00+00'], [64, '2026-06-27T03:00:00+00'],
        [65, '2026-06-27T00:00:00+00'], [66, '2026-06-27T00:00:00+00'],
        [67, '2026-06-27T21:00:00+00'], [68, '2026-06-27T21:00:00+00'],
        [69, '2026-06-28T02:00:00+00'], [70, '2026-06-28T02:00:00+00'],
        [71, '2026-06-27T23:30:00+00'], [72, '2026-06-27T23:30:00+00'],
      ];
      for (const [id, utc] of forceUpdates) {
        const r = await p.query("UPDATE jogos SET data = $1::timestamptz WHERE id = $2", [utc, id]);
        if (r.rowCount === 0) {
          console.log(`⚠️ Jogo ${id} não encontrado para força de atualização`);
        }
      }
      const r = await p.query("SELECT id, data FROM jogos WHERE id = 1");
      console.log(`💪 FORÇA: jogo 1 data = ${r.rows[0]?.data}`);
      const r10 = await p.query("SELECT id, data FROM jogos WHERE id = 10");
      console.log(`💪 FORÇA: jogo 10 data = ${r10.rows[0]?.data}`);
      await p.end();
    } catch (err) {
      console.error('❌ Erro na força de atualização:', err.message);
    }
  }

  // Diagnóstico: verifica o dado salvo
  const verificacao = await get("SELECT id, data, estadio FROM jogos WHERE id = 1");
  if (verificacao) {
    console.log(`🔍 Jogo 1: data=${verificacao.data}, estadio=${verificacao.estadio}, cidade=${verificacao.cidade}`);
  }
  const verificacao10 = await get("SELECT id, data, estadio FROM jogos WHERE id = 10");
  if (verificacao10) {
    console.log(`🔍 Jogo 10: data=${verificacao10.data}, estadio=${verificacao10.estadio}`);
  }

  // 4. Cria admin se as env vars estiverem definidas
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminSenha = process.env.ADMIN_SENHA;
  const adminNome = process.env.ADMIN_NOME || 'Administrador';

  if (adminEmail && adminSenha) {
    const adminExistente = await get('SELECT id FROM usuarios WHERE email = ?', [adminEmail.toLowerCase().trim()]);
    if (adminExistente) {
      const hash = await bcrypt.hash(adminSenha, 10);
      await run(
        'UPDATE usuarios SET nome = ?, senha_hash = ?, is_admin = 1 WHERE id = ?',
        [adminNome, hash, adminExistente.id]
      );
      console.log(`✅ Admin atualizado: ${adminEmail}`);
    } else {
      const hash = await bcrypt.hash(adminSenha, 10);
      await run(
        'INSERT INTO usuarios (nome, email, senha_hash, is_admin) VALUES (?, ?, ?, 1)',
        [adminNome, adminEmail.toLowerCase().trim(), hash]
      );
      console.log(`✅ Admin criado: ${adminEmail}`);
    }
  } else {
    console.log('ℹ️  ADMIN_EMAIL/ADMIN_SENHA não definidos. Admin deve ser criado manualmente.');
  }

  console.log('✅ Setup concluído.');
}

setup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Erro no setup:', err);
    process.exit(1);
  });
