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
      [23, dt(2026,6,17,23,0),  'Estádio Azteca',               'Cidade do México',     'México'],
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
      [36, dt(2026,6,21,1,0),   'Estádio BBVA',                 'Monterrey',            'México'],
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
      [57, dt(2026,6,25,23,0),  'SoFi Stadium',                 'Los Angeles',          'EUA'],
      [58, dt(2026,6,25,23,0),  'Levi\'s Stadium',              'San Francisco',        'EUA'],
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
    console.log(`✅ Horários de ${updates.length} jogos da fase de grupos atualizados`);

    // Mata-mata (R32, R16, QF, SF, 3º lugar, Final) - 32 jogos
    // Estes não são sobrescritos pelo seed em deploys subsequentes (o seed só roda
    // se o banco estiver vazio), então mantemos uma migration aqui que alinha com o FIFA.
    const mataMataUpdates = [
      // R32 (16 jogos)
      [73,  dt(2026,6,28,16,0),   'SoFi Stadium',                  'Los Angeles',          'EUA'], // 2A vs 2B
      [74,  dt(2026,6,29,17,30),  'Gillette Stadium',             'Boston',               'EUA'], // 1E vs 3ABCDF
      [75,  dt(2026,6,29,22,0),   'Estádio BBVA',                 'Monterrey',            'México'], // 1F vs 2C
      [76,  dt(2026,6,29,14,0),   'NRG Stadium',                  'Houston',              'EUA'], // 1C vs 2F
      [77,  dt(2026,6,30,18,0),   'MetLife Stadium',              'Nova York/Nova Jersey','EUA'], // 1I vs 3CDFGH
      [78,  dt(2026,6,30,14,0),   'AT&T Stadium',                 'Dallas',               'EUA'], // 2E vs 2I
      [79,  dt(2026,6,30,22,0),   'Estádio Azteca',               'Cidade do México',     'México'], // 1A vs 3CEFHI
      [80,  dt(2026,7,1,13,0),    'Mercedes-Benz Stadium',        'Atlanta',              'EUA'], // 1L vs 3EHIJK
      [81,  dt(2026,7,1,21,0),    'Levi\'s Stadium',              'San Francisco',        'EUA'], // 1D vs 3BEFIJ
      [82,  dt(2026,7,1,17,0),    'Lumen Field',                  'Seattle',              'EUA'], // 1G vs 3AEHIJ
      [83,  dt(2026,7,2,20,0),    'BMO Field',                    'Toronto',              'Canadá'], // 2K vs 2L
      [84,  dt(2026,7,2,16,0),    'SoFi Stadium',                 'Los Angeles',          'EUA'], // 1H vs 2J
      [85,  dt(2026,7,3,0,0),     'BC Place',                     'Vancouver',            'Canadá'], // 1B vs 3EFGIJ
      [86,  dt(2026,7,3,19,0),    'Hard Rock Stadium',            'Miami',                'EUA'], // 1J vs 2H
      [87,  dt(2026,7,3,22,30),   'Arrowhead Stadium',            'Kansas City',          'EUA'], // 1K vs 3DEIJL
      [88,  dt(2026,7,3,15,0),    'AT&T Stadium',                 'Dallas',               'EUA'], // 2D vs 2G
      // R16 (8 jogos)
      [89,  dt(2026,7,4,18,0),    'Lincoln Financial Field',      'Filadélfia',           'EUA'], // W74 vs W77
      [90,  dt(2026,7,4,14,0),    'NRG Stadium',                  'Houston',              'EUA'], // W73 vs W75
      [91,  dt(2026,7,5,17,0),    'MetLife Stadium',              'Nova York/Nova Jersey','EUA'], // W76 vs W78
      [92,  dt(2026,7,5,21,0),    'Estádio Azteca',               'Cidade do México',     'México'], // W79 vs W80
      [93,  dt(2026,7,6,16,0),    'AT&T Stadium',                 'Dallas',               'EUA'], // W83 vs W84
      [94,  dt(2026,7,6,21,0),    'Lumen Field',                  'Seattle',              'EUA'], // W81 vs W82
      [95,  dt(2026,7,7,13,0),    'Mercedes-Benz Stadium',        'Atlanta',              'EUA'], // W86 vs W88
      [96,  dt(2026,7,7,17,0),    'BC Place',                     'Vancouver',            'Canadá'], // W85 vs W87
      // Quartas (4 jogos)
      [97,  dt(2026,7,9,17,0),    'Gillette Stadium',             'Boston',               'EUA'], // W89 vs W90
      [98,  dt(2026,7,10,16,0),   'SoFi Stadium',                 'Los Angeles',          'EUA'], // W93 vs W94
      [99,  dt(2026,7,11,18,0),   'Hard Rock Stadium',            'Miami',                'EUA'], // W91 vs W92
      [100, dt(2026,7,11,22,0),   'Arrowhead Stadium',            'Kansas City',          'EUA'], // W95 vs W96
      // Semifinais (2 jogos)
      [101, dt(2026,7,14,16,0),   'AT&T Stadium',                 'Dallas',               'EUA'], // W97 vs W98
      [102, dt(2026,7,15,16,0),   'Mercedes-Benz Stadium',        'Atlanta',              'EUA'], // W99 vs W100
      // 3º lugar
      [103, dt(2026,7,18,18,0),   'Hard Rock Stadium',            'Miami',                'EUA'], // RU101 vs RU102
      // Final
      [104, dt(2026,7,19,16,0),   'MetLife Stadium',              'Nova York/Nova Jersey','EUA'], // W101 vs W102
    ];
    for (const [id, data, estadio, cidade, pais] of mataMataUpdates) {
      await run("UPDATE jogos SET data = ?, estadio = ?, cidade = ?, pais = ? WHERE id = ?", [data, estadio, cidade, pais, id]);
    }
    console.log(`✅ Horários de ${mataMataUpdates.length} jogos do mata-mata atualizados`);

    // Fix: jogos 29 e 30 do Grupo C estavam com os times trocados no banco
    // (Escócia×Marrocos e Brasil×Haiti tinham selecao_casa_id/visitante_id invertidos)
    await run("UPDATE jogos SET selecao_casa_id = 12, selecao_visitante_id = 10 WHERE id = 29", []); // Escócia × Marrocos
    await run("UPDATE jogos SET selecao_casa_id = 9,  selecao_visitante_id = 11 WHERE id = 30", []); // Brasil × Haiti
    console.log(`✅ Times dos jogos 29 e 30 corrigidos`);
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
