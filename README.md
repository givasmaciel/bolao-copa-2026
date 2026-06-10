# ⚽ Bolão da Copa do Mundo FIFA 2026

Aplicação web em **português do Brasil** para fazer bolão de palpites da Copa de 2026. Participantes cadastram seus palpites, o admin informa os resultados, e a pontuação é calculada automaticamente.

## 🎯 Funcionalidades

- ✅ **Cadastro e login** com senha criptografada (bcryptjs)
- ✅ **48 seleções** em **12 grupos (A–L)**, **104 jogos**
- ✅ **Palpites com placar exato** — edite até **2 minutos antes** do jogo
- ✅ **Palpites Extras** — campeão, vice, 3º lugar, finalistas, semis, quartas, oitavas e 1/16 avos
- ✅ **Pontuação automática** ao admin marcar o jogo como finalizado
- ✅ **Ranking geral** com pontos de jogos + extras
- ✅ **Admin como juiz** — não participa do bolão, só gerencia
- ✅ **Gerenciar participantes** — promover/rebaixar admin, resetar senha, excluir conta
- ✅ **Resetar palpites** (individual ou em massa)
- ✅ **Recuperação de senha** via e-mail (SMTP opcional) ou link exibido na tela
- ✅ **Dual database**: SQLite (local) / PostgreSQL (produção no Render)
- ✅ **Auto-deploy** via GitHub + Render Blueprint
- ✅ Interface responsiva em **português do Brasil**

## 🛠 Tecnologias

- **Node.js 18+** + **Express**
- **EJS** (templates server-side)
- **SQLite** (local) / **PostgreSQL** (Render)
- **bcryptjs**, **express-session**, **connect-flash**

## 🚀 Como rodar local

```bash
npm install
npm run seed          # populabanco com seleções, grupos, jogos
npm run criar-admin   # cria conta de administrador
npm start             # http://localhost:3000
```

## 🚀 Deploy no Render

1. Crie um repositório no GitHub e faça push do código
2. No Render, use **New Blueprint** e aponte para o repositório
3. O `render.yaml` cria automaticamente:
   - Banco PostgreSQL (`bolao-db`)
   - Web service (`bolao-copa-2026`)
4. Configure as variáveis no Render:
   - `ADMIN_EMAIL` e `ADMIN_SENHA` (admin é criado no deploy)
   - `SESSION_SECRET` (gerado automaticamente)
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (opcional, para e-mail de recuperação)
5. Auto-deploy ativado: todo `git push` atualiza o site

## 🏆 Sistema de pontuação

| Acerto | Pontos |
|---|---|
| Placar exato | **10** |
| Resultado certo + gols de 1 time | **7** |
| Empate (qualquer placar) | **7** |
| Só resultado (vitória/derrota) | **3** |
| Errou resultado mas acertou gol de 1 time | **2** |
| Errou tudo | **0** |

### Palpites Extras

| Categoria | Pontos por seleção | Máx. seleções |
|---|---|---|
| Campeão | 50 | 1 |
| Vice-campeão | 50 | 1 |
| Terceiro lugar | 50 | 1 |
| Finalista | 30 | 2 |
| Semifinal | 20 | 4 |
| Quartas | 15 | 8 |
| Oitavas | 10 | 16 |
| 1/16 avos | 10 | 32 |

Prazo para palpites extras: **11/06/2026 às 11h BRT**.

## 🗄 Banco de Dados

Dual database: SQLite localmente, PostgreSQL no Render.

**Tabelas:** `usuarios`, `grupos`, `selecoes`, `jogos`, `palpites`, `palpites_extras`, `resultados_extras`, `password_reset_tokens`.

A troca é automática via variável `DATABASE_URL`.

## ⚙️ Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL (Render). Ausente = SQLite |
| `SESSION_SECRET` | Chave secreta da sessão |
| `ADMIN_NOME` | Nome do admin (padrão: Administrador) |
| `ADMIN_EMAIL` | E-mail do admin (obrigatório no Render) |
| `ADMIN_SENHA` | Senha do admin (obrigatório no Render) |
| `BASE_URL` | URL base para links de recuperação |
| `SMTP_HOST` | Servidor SMTP (opcional) |
| `SMTP_USER` | Usuário SMTP |
| `SMTP_PASS` | Senha SMTP |
| `SMTP_FROM` | Remetente dos e-mails |

## 📂 Estrutura

```
bolao/
├── database/
│   ├── db.js           # conexão SQLite ou PostgreSQL
│   ├── schema.js       # criação das tabelas
│   ├── seed.js         # popula seleções, grupos, 104 jogos
│   ├── setup.js        # schema + seed + criar admin (usado no Render)
│   └── criar-admin.js  # script manual para criar admin
├── routes/
│   ├── auth.js         # cadastro, login, logout
│   ├── palpites.js     # palpites da fase de grupos
│   ├── extras.js       # palpites extras + admin extras
│   ├── jogos.js        # listagem pública de jogos
│   ├── ranking.js      # ranking geral + detalhe por usuário
│   ├── senha.js        # recuperação de senha
│   └── admin.js        # painel admin (resultados, usuários, recalcular)
├── middleware/
│   └── auth.js         # verificação de sessão
├── views/
│   ├── partials/       # header, footer, flash
│   ├── home.ejs        # landing page com regras
│   ├── login.ejs, cadastro.ejs
│   ├── palpites.ejs    # palpites dos jogos
│   ├── palpites-extras.ejs, admin-extras.ejs
│   ├── jogos.ejs       # tabela de jogos públicos
│   ├── ranking.ejs, palpites-usuario.ejs
│   ├── admin.ejs, admin-jogos.ejs, admin-usuarios.ejs
│   ├── esqueci-senha.ejs, redefinir-senha.ejs
│   ├── 404.ejs, 500.ejs
├── public/css/style.css
├── server.js           # entry point
├── render.yaml         # blueprint Render (banco + web)
├── .env.example        # variáveis de ambiente
├── .node-version       # Node 18
└── package.json
```

## 📋 Regras de negócio

- **Admin não participa** do bolão (não faz palpites, não aparece no ranking)
- Palpites fecham **2 minutos antes** de cada jogo (frontend e backend)
- Pontuação é **automática** ao admin salvar o placar e marcar "Finalizado"
- Admin pode **recalcular** todos os pontos manualmente se necessário
- Admin pode **resetar senha** de qualquer participante
- Palpites extras têm **prazo fixo** (11/06/2026 11h BRT)
- Desempate no ranking: quem tiver mais acertos (palpites com pontos > 0)

---

Bom bolão! 🇧🇷⚽
