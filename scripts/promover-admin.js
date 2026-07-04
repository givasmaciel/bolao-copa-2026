// Promove um usuário a admin
const { run, get } = require('./database/db');

(async () => {
  try {
    const email = process.argv[2] || 'joao@teste.com';
    const result = await run('UPDATE usuarios SET is_admin = 1 WHERE email = ?', [email.toLowerCase()]);
    if (result.changes > 0) {
      const u = await get('SELECT id, nome, email, is_admin FROM usuarios WHERE email = ?', [email.toLowerCase()]);
      console.log('✅ Usuário promovido a admin:', u);
    } else {
      console.log('❌ Usuário não encontrado:', email);
    }
    process.exit(0);
  } catch (err) {
    console.error('Erro:', err);
    process.exit(1);
  }
})();
