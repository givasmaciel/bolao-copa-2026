# ⚽ Bolão da Copa do Mundo FIFA 2026

Aplicação web em **português do Brasil** para você e seus amigos fazerem palpites dos jogos da Copa do Mundo de 2026.

Inspirado no projeto open-source [rezarahiminia/worldcup2026](https://github.com/rezarahiminia/worldcup2026) (que é uma API de dados), este bolão traz a diversão: cadastro de participantes, palpites com placar exato, pontuação automática e ranking em tempo real.

## 🎯 Funcionalidades

- ✅ **Cadastro e login** de participantes (com senha criptografada)
- ✅ **48 seleções** divididas em **12 grupos (A-L)**
- ✅ **104 jogos** (72 da fase de grupos + 32 do mata-mata)
- ✅ **Palpites com placar exato** — você pode editar até a hora do jogo começar
- ✅ **Pontuação automática** (10 pts placar exato, 5 pts resultado+gols, 3 pts só resultado)
- ✅ **Ranking** geral e por participante
- ✅ **Painel admin** para informar os resultados dos jogos
- ✅ Interface bonita, responsiva, em **português do Brasil**
- ✅ Bandeirinhas reais das 48 seleções

## 🛠 Tecnologias

- **Node.js** + **Express**
- **SQLite** (banco local, arquivo único)
- **EJS** (templates server-side)
- **bcryptjs** (hash de senhas)
- **express-session** (autenticação por sessão)

Sem build step, sem frameworks de UI complicados. **Roda em qualquer máquina com Node 14+**.

## 🚀 Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Criar o banco de dados com as 48 seleções, 12 grupos e 104 jogos
npm run seed

# 3. Criar sua conta de administrador
npm run criar-admin
# (vai pedir nome, e-mail e senha)

# 4. Iniciar o servidor
npm start

# 5. Abrir no navegador
# http://localhost:3000
```

## 🎮 Como usar

1. Cada participante **cria uma conta** em `/cadastro`
2. Entra em **"Meus palpites"** e dá o placar dos 72 jogos da fase de grupos
3. O **admin** informa os resultados reais em `/admin/jogos` (a senha fica com a pessoa mais confiável do grupo 😉)
4. Conforme os jogos acontecem, os pontos são **recalculados automaticamente**
5. Acompanhe a disputa no **ranking** em `/ranking`

## 🏆 Sistema de pontuação

| Acerto | Pontos |
|---|---|
| Placar exato (ex: 2×1 e o jogo foi 2×1) | **10** |
| Vencedor/empate certo + gols de 1 time (ex: 2×1 e o jogo foi 2×0) | **5** |
| Só o resultado (V/E/D) (ex: 1×0 e o jogo foi 3×2) | **3** |
| Errou tudo | **0** |

## 📂 Estrutura

```
bolao/
├── database/
│   ├── db.js           # conexão SQLite
│   ├── schema.js       # criação das tabelas
│   ├── seed.js         # popula times, grupos e jogos
│   └── criar-admin.js  # script para criar admin
├── routes/
│   ├── auth.js         # cadastro, login, logout
│   ├── palpites.js     # CRUD de palpites
│   ├── jogos.js        # listagem de jogos
│   ├── ranking.js      # ranking geral
│   └── admin.js        # painel administrativo
├── middleware/
│   └── auth.js         # verificação de sessão
├── views/              # templates EJS
│   ├── partials/       # header, footer, flash
│   ├── home.ejs
│   ├── login.ejs
│   ├── cadastro.ejs
│   ├── palpites.ejs
│   ├── jogos.ejs
│   ├── ranking.ejs
│   ├── palpites-usuario.ejs
│   ├── admin.ejs
│   ├── admin-jogos.ejs
│   ├── 404.ejs
│   └── 500.ejs
├── public/
│   └── css/style.css   # tema verde/amarelo
├── data/
│   └── bolao.db        # banco SQLite (criado pelo seed)
├── server.js           # entry point
├── package.json
└── .env
```

## 📋 Notas

- Os jogos do **mata-mata** (oitavas em diante) só podem ser palpitados após o fim da fase de grupos, quando as seleções classificadas forem definidas. Como a Copa 2026 ainda não começou, os confrontos estão marcados como "A definir" (igual no projeto original).
- O **horário** dos jogos é fictício (baseado no projeto original em horário local) — antes da Copa, a FIFA divulgará os horários oficiais.
- Os palpites são **travados** automaticamente quando o horário do jogo chega. Para reabrir, basta o admin desmarcar "Finalizado" e salvar.

Bom bolão! 🇧🇷⚽
