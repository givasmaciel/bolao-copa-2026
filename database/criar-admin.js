const bcrypt = require('bcryptjs');
const readline = require('readline');
const { run, get } = require('./db');
const { criarSchema } = require('./schema');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function pergunta(texto) {
  return new Promise((resolve) => rl.question(texto, resolve));
}

async function main() {
  await criarSchema();

  const existeAdmin = await get('SELECT id FROM usuarios WHERE is_admin = 1 LIMIT 1');
  if (existeAdmin) {
    console.log('⚠️  Já existe um administrador cadastrado.');
    const continuar = await pergunta('Deseja criar OUTRO admin mesmo assim? (s/N): ');
    if (continuar.toLowerCase() !== 's') {
      console.log('Cancelado.');
      rl.close();
      process.exit(0);
    }
  }

  console.log('\n🔐 Criar conta de administrador do bolão\n');

  const nome = (await pergunta('Nome: ')).trim();
  const email = (await pergunta('E-mail: ')).trim().toLowerCase();
  const senha = (await pergunta('Senha: ')).trim();

  if (!nome || !email || !senha) {
    console.log('\n❌ Todos os campos são obrigatórios.');
    rl.close();
    process.exit(1);
  }
  if (senha.length < 4) {
    console.log('\n❌ Senha muito curta (mínimo 4 caracteres).');
    rl.close();
    process.exit(1);
  }

  const existe = await get('SELECT id FROM usuarios WHERE email = ?', [email]);
  if (existe) {
    // Atualiza o usuário existente para admin
    const hash = await bcrypt.hash(senha, 10);
    await run(
      'UPDATE usuarios SET nome = ?, senha_hash = ?, is_admin = 1 WHERE id = ?',
      [nome, hash, existe.id]
    );
    console.log(`\n✅ Usuário "${nome}" (<${email}>) foi promovido a administrador!`);
  } else {
    const hash = await bcrypt.hash(senha, 10);
    const result = await run(
      'INSERT INTO usuarios (nome, email, senha_hash, is_admin) VALUES (?, ?, ?, 1)',
      [nome, email, hash]
    );
    console.log(`\n✅ Administrador criado com sucesso! ID: ${result.lastID}`);
  }

  console.log('\nAgora você pode iniciar o servidor: npm start');
  console.log('E acessar http://localhost:3000\n');
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro:', err);
  rl.close();
  process.exit(1);
});
