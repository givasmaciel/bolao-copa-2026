const { criarSchema } = require('./schema');
const { run, get } = require('./db');
const bcrypt = require('bcryptjs');

async function setup() {
  console.log('⚙️  Verificando banco de dados...');

  // 1. Cria schema se não existir
  await criarSchema();

  // 2. Verifica se já tem dados (selecoes)
  const count = await get('SELECT COUNT(*) AS total FROM selecoes');
  if (!count || count.total === 0) {
    console.log('🌱 Banco vazio. Executando seed...');
    const { seed } = require('./seed');
    await seed();
  } else {
    console.log(`✅ Banco já possui dados (${count.total} seleções). Pulando seed.`);
  }

  // 3. Cria admin se as env vars estiverem definidas
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
