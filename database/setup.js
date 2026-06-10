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
  // NOTA: usar Date() em vez de string para compatibilidade com PostgreSQL
  const dt = (y, M, d, h, m) => new Date(Date.UTC(y, M-1, d, h+3, m));
  const jogosCount = await get('SELECT COUNT(*) AS total FROM jogos');
  if (jogosCount && Number(jogosCount.total) > 0) {
    const updates = [
      [1,  dt(2026,6,11,16,0),  'Estádio Azteca',               'Cidade do México',     'México'],
      [2,  dt(2026,6,11,23,0),  'Estádio Akron',                'Guadalajara',          'México'],
      [3,  dt(2026,6,12,16,0),  'BMO Field',                    'Toronto',              'Canadá'],
      [4,  dt(2026,6,12,22,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [5,  dt(2026,6,13,22,0),  'Gillette Stadium',             'Boston',               'EUA'],
      [6,  dt(2026,6,14,1,0),   'BC Place',                     'Vancouver',            'Canadá'],
      [7,  dt(2026,6,13,19,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [8,  dt(2026,6,13,16,0),  'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [9,  dt(2026,6,14,20,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [10, dt(2026,6,14,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
      [11, dt(2026,6,14,17,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
      [12, dt(2026,6,14,23,0),  'Estádio BBVA',                 'Monterrey',            'México'],
      [13, dt(2026,6,15,22,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [14, dt(2026,6,15,13,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [15, dt(2026,6,15,16,0),  'Lumen Field',                  'Seattle',              'EUA'],
      [16, dt(2026,6,15,19,0),  'Hard Rock Stadium',            'Miami',                'EUA'],
      [17, dt(2026,6,16,16,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [18, dt(2026,6,16,19,0),  'Gillette Stadium',             'Boston',               'EUA'],
      [19, dt(2026,6,16,22,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [20, dt(2026,6,17,1,0),   'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [21, dt(2026,6,17,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
      [22, dt(2026,6,17,17,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
      [23, dt(2026,6,17,21,0),  'Estádio Azteca',               'Cidade do México',     'México'],
      [24, dt(2026,6,17,20,0),  'BMO Field',                    'Toronto',              'Canadá'],
      [25, dt(2026,6,18,22,0),  'Estádio Akron',                'Guadalajara',          'México'],
      [26, dt(2026,6,18,16,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [27, dt(2026,6,18,19,0),  'BC Place',                     'Vancouver',            'Canadá'],
      [28, dt(2026,6,18,13,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [29, dt(2026,6,19,19,0),  'Gillette Stadium',             'Boston',               'EUA'],
      [30, dt(2026,6,19,21,30), 'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [31, dt(2026,6,19,16,0),  'Lumen Field',                  'Seattle',              'EUA'],
      [32, dt(2026,6,20,0,0),   'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [33, dt(2026,6,20,17,0),  'BMO Field',                    'Toronto',              'Canadá'],
      [34, dt(2026,6,20,21,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [35, dt(2026,6,20,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
      [36, dt(2026,6,20,23,0),  'Estádio BBVA',                 'Monterrey',            'México'],
      [37, dt(2026,6,21,16,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [38, dt(2026,6,21,22,0),  'BC Place',                     'Vancouver',            'Canadá'],
      [39, dt(2026,6,21,13,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [40, dt(2026,6,21,19,0),  'Hard Rock Stadium',            'Miami',                'EUA'],
      [41, dt(2026,6,22,18,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [42, dt(2026,6,22,21,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [43, dt(2026,6,22,14,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
      [44, dt(2026,6,23,0,0),   'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [45, dt(2026,6,23,14,0),  'NRG Stadium',                  'Houston',              'EUA'],
      [46, dt(2026,6,23,20,0),  'BMO Field',                    'Toronto',              'Canadá'],
      [47, dt(2026,6,23,23,0),  'Estádio Akron',                'Guadalajara',          'México'],
      [48, dt(2026,6,23,17,0),  'Gillette Stadium',             'Boston',               'EUA'],
      [49, dt(2026,6,24,19,0),  'Hard Rock Stadium',            'Miami',                'EUA'],
      [50, dt(2026,6,24,19,0),  'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
      [51, dt(2026,6,24,22,0),  'Estádio BBVA',                 'Monterrey',            'México'],
      [52, dt(2026,6,24,22,0),  'Estádio Azteca',               'Cidade do México',     'México'],
      [53, dt(2026,6,24,16,0),  'Lumen Field',                  'Seattle',              'EUA'],
      [54, dt(2026,6,24,16,0),  'BC Place',                     'Vancouver',            'Canadá'],
      [55, dt(2026,6,25,17,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [56, dt(2026,6,25,17,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [57, dt(2026,6,25,23,0),  'Levi\'s Stadium',              'San Francisco',        'EUA'],
      [58, dt(2026,6,25,23,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [59, dt(2026,6,25,20,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
      [60, dt(2026,6,25,20,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [61, dt(2026,6,26,16,0),  'BMO Field',                    'Toronto',              'Canadá'],
      [62, dt(2026,6,26,16,0),  'Gillette Stadium',             'Boston',               'EUA'],
      [63, dt(2026,6,27,0,0),   'Lumen Field',                  'Seattle',              'EUA'],
      [64, dt(2026,6,27,0,0),   'BC Place',                     'Vancouver',            'Canadá'],
      [65, dt(2026,6,26,21,0),  'NRG Stadium',                  'Houston',              'EUA'],
      [66, dt(2026,6,26,21,0),  'Estádio Akron',                'Guadalajara',          'México'],
      [67, dt(2026,6,27,18,0),  'MetLife Stadium',              'Nova York/Nova Jersey','EUA'],
      [68, dt(2026,6,27,18,0),  'Lincoln Financial Field',      'Filadélfia',           'EUA'],
      [69, dt(2026,6,27,23,0),  'Arrowhead Stadium',            'Kansas City',          'EUA'],
      [70, dt(2026,6,27,23,0),  'AT&T Stadium',                 'Dallas',               'EUA'],
      [71, dt(2026,6,27,20,30), 'Hard Rock Stadium',            'Miami',                'EUA'],
      [72, dt(2026,6,27,20,30), 'Mercedes-Benz Stadium',        'Atlanta',              'EUA'],
    ];
    for (const [id, data, estadio, cidade, pais] of updates) {
      await run("UPDATE jogos SET data = ?, estadio = ?, cidade = ?, pais = ? WHERE id = ?", [data, estadio, cidade, pais, id]);
    }
    console.log(`✅ Horários de ${updates.length} jogos atualizados`);
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
