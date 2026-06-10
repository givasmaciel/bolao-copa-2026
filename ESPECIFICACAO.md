# Especificação Técnica — Bolão da Copa do Mundo FIFA 2026

---

## 1. Visão Geral

O **Bolão da Copa 2026** é uma aplicação web full-stack em português do Brasil que permite a um grupo de amigos cadastrar palpites (apostas) sobre os resultados dos jogos da Copa do Mundo FIFA 2026. O sistema calcula pontuação automaticamente com base no placar real informado pelo administrador, exibe um ranking em tempo real e oferece um módulo de palpites extras sobre os resultados gerais do torneio (campeão, vice, fases etc.).

Inspirado no projeto open-source [worldcup2026](https://github.com/rezarahiminia/worldcup2026) (que provê os dados da copa), esta aplicação adiciona toda a lógica de participação multi-usuário, pontuação, autenticação e administração.

---

## 2. Stack Tecnológica

| Camada        | Tecnologia                                           |
|---------------|------------------------------------------------------|
| **Runtime**   | Node.js 18+                                          |
| **Framework** | Express 4.21                                         |
| **Templates** | EJS 3.1 (server-side rendering)                      |
| **Banco**     | SQLite 5 (dev) ou PostgreSQL 16 (produção no Render) |
| **Sessão**    | express-session com cookie de 30 dias                |
| **Senhas**    | bcryptjs (hash com 10 rounds)                        |
| **Flash**     | connect-flash                                        |
| **E-mail**    | nodemailer (recuperação de senha, opcional)          |
| **Deploy**    | Render.com via render.yaml                           |
| **CSS**       | CSS puro responsivo (sem frameworks)                 |
| **Ícones**    | flagcdn.com para bandeiras das seleções              |

---

## 3. Funcionalidades por Rota

### 3.1 Autenticação (`routes/auth.js`)

| Método | Rota              | Descrição                                         |
|--------|-------------------|---------------------------------------------------|
| GET    | `/cadastro`       | Exibe formulário de cadastro                       |
| POST   | `/cadastro`       | Cria usuário com nome, email e senha (bcrypt)      |
| GET    | `/login`          | Exibe formulário de login                          |
| POST   | `/login`          | Autentica por email + senha, inicia sessão         |
| POST   | `/logout`         | Destrói a sessão e redireciona para `/login`       |

**Regras:**
- Usuários já logados são redirecionados para `/palpites` ao acessar `/login` ou `/cadastro` (middleware `jaLogado`).
- E-mail é convertido para minúsculas antes de salvar/buscar.
- Senha mínima de 4 caracteres.
- Após cadastro, o usuário é automaticamente logado.

### 3.2 Palpites dos Jogos (`routes/palpites.js`)

| Método | Rota                   | Descrição                                           |
|--------|------------------------|-----------------------------------------------------|
| GET    | `/palpites`            | Lista os 72 jogos da fase de grupos com inputs       |
| POST   | `/palpites`            | Salva lote de palpites (upsert) via JSON             |
| GET    | `/palpites/knockout`   | Placeholder — informa que mata-mata será liberado   |

**Regras de bloqueio (2 minutos de margem):**
- O sistema compara `new Date()` contra `data_do_jogo - 2 minutos`.
- Se o horário atual >= (data do jogo - 2 min), o palpite é bloqueado.
- Jogos finalizados também são bloqueados.
- Apenas jogos da fase de grupos (`fase = 'grupo'`) são exibidos/editados.

**Funcionamento do formulário:**
- Os inputs de placar são numerados (`casa_<id>`, `visitante_<id>`).
- Antes do submit, um script JS coleta todos os valores, monta um array JSON e insere num campo oculto `palpites_json`.
- O servidor faz upsert (INSERT ou UPDATE) para cada palpite válido.
- Administradores são impedidos de palpitar (redirecionados para `/admin`).

### 3.3 Palpites Extras (`routes/extras.js`)

| Método | Rota                | Descrição                                    |
|--------|---------------------|----------------------------------------------|
| GET    | `/palpites-extras`  | Exibe formulário com 8 categorias de aposta  |
| POST   | `/palpites-extras`  | Salva palpites extras do usuário             |
| GET    | `/admin/extras`     | Admin: define resultados extras              |
| POST   | `/admin/extras`     | Admin: salva resultados extras               |

**Categorias de aposta:**

| Categoria     | Descrição           | Seleções | Pontos por acerto |
|---------------|---------------------|----------|-------------------|
| `campeao`     | Campeão             | 1        | 50                |
| `vice`        | Vice-campeão        | 1        | 50                |
| `terceiro`    | Terceiro lugar      | 1        | 50                |
| `r32`         | 1/16 avos de Final  | 32       | 10                |
| `oitavas`     | Oitavas de Final    | 16       | 10                |
| `quartas`     | Quartas de Final    | 8        | 15                |
| `semi`        | Semifinal           | 4        | 20                |
| `finalista`   | Finalista           | 2        | 30                |

**Regras:**
- Prazo limite para palpites extras: 11 de junho de 2026 às 11h (horário de Brasília).
- Categorias com múltiplas seleções usam checkboxes; as demais usam select.
- O usuário salva todos os palpites de uma vez (DELETE + INSERT).
- O admin define quais seleções acertaram cada categoria na página `/admin/extras`.
- Os pontos extras são calculados por JOIN entre `palpites_extras` e `resultados_extras` e somados ao total do ranking.

### 3.4 Jogos — Listagem Pública (`routes/jogos.js`)

| Método | Rota      | Descrição                                    |
|--------|-----------|----------------------------------------------|
| GET    | `/jogos`  | Lista todos os 104 jogos agrupados por fase  |

- Página pública (não requer login).
- Exibe placar real se finalizado, ou "×" se pendente.
- Fases: grupo, r32 (32-avos), r16 (oitavas), qf (quartas), sf (semifinais), terceiro, final.
- Mostra bandeira, estádio, cidade, data/hora e grupo (quando aplicável).

### 3.5 Ranking (`routes/ranking.js`)

| Método | Rota                       | Descrição                                      |
|--------|----------------------------|------------------------------------------------|
| GET    | `/ranking`                 | Ranking geral com pontos totais                |
| GET    | `/ranking/usuario/:id`     | Detalhamento dos palpites de um participante   |

**Cálculo do ranking:**
- `total_pontos = SUM(pontos_obtidos dos palpites) + SUM(pontos dos palpites_extras)`.
- Desempate: maior número de palpites com pontos > 0, depois ordem alfabética.
- Usuários com `is_admin = 0` apenas.
- Posição é calculada no servidor: muda apenas quando o total de pontos difere do anterior.

### 3.6 Administração (`routes/admin.js`)

| Método | Rota                                        | Descrição                                    |
|--------|---------------------------------------------|----------------------------------------------|
| GET    | `/admin`                                    | Painel com estatísticas e ações              |
| GET    | `/admin/jogos`                              | Lista todos os jogos para editar resultados  |
| POST   | `/admin/jogos/:id`                          | Atualiza placar e finaliza jogo              |
| POST   | `/admin/recalcular`                         | Recalcula pontos de todos os palpites        |
| GET    | `/admin/usuarios`                           | Gerencia participantes                       |
| POST   | `/admin/usuarios/:id/tornar-admin`          | Promove participante a admin                 |
| POST   | `/admin/usuarios/:id/rebaixar`              | Rebaixa admin a participante                 |
| POST   | `/admin/usuarios/:id/resetar-palpites`      | Apaga palpites e palpites extras do usuário  |
| POST   | `/admin/usuarios/:id/resetar-senha`         | Redefine senha de um usuário                 |
| POST   | `/admin/usuarios/:id/excluir`               | Exclui usuário e todos os seus palpites      |
| POST   | `/admin/resetar-todos-palpites`             | Apaga TODOS os palpites do sistema           |

- Todas as rotas protegidas pelo middleware `verificarAdmin`.
- Ao finalizar um jogo com placar, os pontos de todos os palpites daquele jogo são recalculados automaticamente.
- Se um jogo for "desfinalizado", os pontos são zerados.

### 3.7 Recuperação de Senha (`routes/senha.js`)

| Método | Rota                       | Descrição                                    |
|--------|----------------------------|----------------------------------------------|
| GET    | `/esqueci-senha`           | Formulário para solicitar redefinição        |
| POST   | `/esqueci-senha`           | Gera token de 32 bytes hex, envia e-mail     |
| GET    | `/redefinir-senha/:token`  | Valida token e exibe formulário              |
| POST   | `/redefinir-senha/:token`  | Redefine a senha e marca token como usado    |

**Regras:**
- Token expira em 1 hora.
- Se SMTP não estiver configurado, o link é exibido na tela (modo teste).
- Se o e-mail não existir no banco, uma mensagem genérica é exibida (segurança).

---

## 4. Banco de Dados

### 4.1 Dual SQLite / PostgreSQL

O banco funciona de forma transparente com **SQLite** (desenvolvimento local) ou **PostgreSQL** (produção no Render). A detecção é feita pela presença da variável `DATABASE_URL`:

- `database/db.js` abstrai as diferenças entre os dois SGBDs.
- `database/schema.js` cria as tabelas com sintaxe condicional (`SERIAL` vs `AUTOINCREMENT`, `TIMESTAMPTZ` vs `DATETIME`, `RETURNING` etc.).
- As queries usam `?` como placeholder; o adaptador PostgreSQL converte para `$1`, `$2`… sequencialmente.
- SQLite usa `PRAGMA journal_mode = WAL` e `PRAGMA foreign_keys = ON`.

### 4.2 Tabelas

#### `usuarios`
| Coluna       | Tipo                         | Descrição                    |
|--------------|------------------------------|------------------------------|
| id           | SERIAL / INTEGER PK          | ID único                     |
| nome         | TEXT NOT NULL                | Nome do participante         |
| email        | TEXT NOT NULL UNIQUE         | E-mail (minúsculo)           |
| senha_hash   | TEXT NOT NULL                | Hash bcrypt da senha         |
| is_admin     | INTEGER DEFAULT 0            | 1 = administrador            |
| criado_em    | TIMESTAMP / DATETIME DEFAULT | Data de criação              |

#### `grupos`
| Coluna | Tipo                 | Descrição         |
|--------|----------------------|-------------------|
| id     | SERIAL / INTEGER PK  | ID único          |
| letra  | TEXT NOT NULL UNIQUE | Letra do grupo    |
| nome   | TEXT NOT NULL        | "Grupo A", etc.   |

#### `selecoes`
| Coluna       | Tipo                 | Descrição                    |
|--------------|----------------------|------------------------------|
| id           | INTEGER PK           | ID (1-48, fixo do seed)      |
| nome         | TEXT NOT NULL        | Nome em inglês               |
| nome_pt      | TEXT NOT NULL        | Nome em português            |
| sigla        | TEXT NOT NULL        | Sigla de 3 letras (ex: BRA)  |
| bandeira_url | TEXT                 | URL da bandeira (flagcdn)    |
| grupo_id     | INTEGER FK→grupos    | Grupo ao qual pertence       |

#### `jogos`
| Coluna               | Tipo                         | Descrição                         |
|----------------------|------------------------------|-----------------------------------|
| id                   | INTEGER PK                   | ID único (1-104, fixo do seed)    |
| fase                 | TEXT NOT NULL                 | `grupo`, `r32`, `r16`, `qf`, `sf`, `terceiro`, `final` |
| rodada               | INTEGER NOT NULL             | 1-9                               |
| grupo_id             | INTEGER FK→grupos            | Grupo (apenas fase de grupos)     |
| selecao_casa_id      | INTEGER FK→selecoes          | Time da casa (null no mata-mata)  |
| selecao_visitante_id | INTEGER FK→selecoes          | Time visitante (null no mata-mata)|
| data                 | TIMESTAMPTZ / DATETIME       | Data/hora do jogo                 |
| estadio              | TEXT                         | Nome do estádio                   |
| cidade               | TEXT                         | Cidade                            |
| pais                 | TEXT                         | País                              |
| gols_casa            | INTEGER                      | Gols reais (preenchido pelo admin)|
| gols_visitante       | INTEGER                      | Gols reais (preenchido pelo admin)|
| finalizado           | INTEGER DEFAULT 0            | 1 = jogo encerrado                |

#### `palpites`
| Coluna                | Tipo                 | Descrição                         |
|-----------------------|----------------------|-----------------------------------|
| id                    | SERIAL / INTEGER PK  | ID único                          |
| usuario_id            | INTEGER FK→usuarios  | Quem palpitou                     |
| jogo_id               | INTEGER FK→jogos     | Qual jogo                         |
| palpite_gols_casa     | INTEGER NOT NULL     | Palpite do usuário (gols casa)    |
| palpite_gols_visitante| INTEGER NOT NULL     | Palpite do usuário (gols visit.)  |
| pontos_obtidos        | INTEGER DEFAULT 0    | Pontuação calculada               |
| criado_em             | TIMESTAMP            | Data de criação                   |
| atualizado_em         | TIMESTAMP            | Data da última edição             |
| UNIQUE                | (usuario_id, jogo_id)| Um palpite por jogo por usuário   |

#### `password_reset_tokens`
| Coluna     | Tipo                 | Descrição                     |
|------------|----------------------|-------------------------------|
| id         | SERIAL / INTEGER PK  | ID único                      |
| usuario_id | INTEGER FK→usuarios  | Usuário que solicitou         |
| token      | TEXT NOT NULL UNIQUE  | Token aleatório de 32 bytes   |
| expira_em  | TIMESTAMP NOT NULL    | Expira em 1 hora              |
| usado      | INTEGER DEFAULT 0    | 1 = já utilizado              |
| criado_em  | TIMESTAMP DEFAULT    | Data de criação               |

#### `palpites_extras`
| Coluna     | Tipo                 | Descrição                         |
|------------|----------------------|-----------------------------------|
| id         | SERIAL / INTEGER PK  | ID único                          |
| usuario_id | INTEGER FK→usuarios  | Quem palpitou                     |
| categoria  | TEXT NOT NULL        | `campeao`, `vice`, `terceiro`, `r32`, `oitavas`, `quartas`, `semi`, `finalista` |
| selecao_id | INTEGER FK→selecoes  | Seleção escolhida                 |
| criado_em  | TIMESTAMP DEFAULT    | Data de criação                   |
| UNIQUE     | (usuario_id, categoria, selecao_id) |                                          |

#### `resultados_extras`
| Coluna     | Tipo                 | Descrição                         |
|------------|----------------------|-----------------------------------|
| id         | SERIAL / INTEGER PK  | ID único                          |
| categoria  | TEXT NOT NULL        | Mesmas categorias dos palpites    |
| selecao_id | INTEGER FK→selecoes  | Seleção vencedora da categoria    |
| pontos     | INTEGER NOT NULL     | Pontos que a categoria vale       |
| UNIQUE     | (categoria, selecao_id) |                                         |

---

## 5. Sistema de Pontuação

A função `calcularPontos(golsCasa, golsVisitante, palpiteCasa, palpiteVisitante)` em `routes/admin.js:15` implementa a lógica:

| Condição                                                   | Pontos |
|------------------------------------------------------------|--------|
| Placar exato (gols idênticos)                              | **10** |
| Empate no real E empate no palpite (qualquer placar)       | **7**  |
| Resultado correto (V/E/D) + acertou gol de pelo menos 1 time | **7** |
| Resultado correto (V/D) sem acertar gol de nenhum time     | **3**  |
| Resultado errado mas acertou gol de pelo menos 1 time      | **2**  |
| Errou tudo                                                 | **0**  |

**Detalhamento da lógica (em ordem de precedência):**
1. Se `gols_casa === palpite_casa && gols_visitante === palpite_visitante` → 10 pts.
2. Determina resultado real e do palpite (`C` = casa vence, `V` = visitante vence, `E` = empate).
3. Se ambos são empate → 7 pts (qualquer placar de empate).
4. Se acertou o resultado (C/V):
   - Acertou pelo menos 1 dos gols → 7 pts.
   - Errou ambos os gols → 3 pts.
5. Se errou o resultado mas acertou pelo menos 1 gol → 2 pts.
6. Senão → 0 pts.

Os pontos são armazenados na coluna `pontos_obtidos` da tabela `palpites` e recalculados sempre que o admin salva/atualiza o resultado de um jogo.

Os **palpites extras** têm pontuação fixa por categoria (50, 50, 50, 10, 10, 15, 20, 30) e são somados ao total do ranking via subquery.

---

## 6. Regras de Negócio

1. **Admin não participa** — Usuários com `is_admin = 1` são redirecionados para `/admin` ao tentar acessar `/palpites` ou `/palpites-extras`. Mensagens flash informam que administradores não podem participar.

2. **Bloqueio de 2 minutos** — Palpites só podem ser feitos/editados até 2 minutos antes do horário do jogo. Após esse prazo, o input é desabilitado e o servidor rejeita alterações.

3. **Jogos finalizados são imutáveis** — Se `finalizado = 1`, o palpite é bloqueado independentemente do horário.

4. **Mata-mata bloqueado inicialmente** — A rota `/palpites/knockout` exibe mensagem informando que será liberado após a fase de grupos. Os confrontos de mata-mata têm `selecao_casa_id` e `selecao_visitante_id` nulos (preenchidos depois).

5. **Recalculo automático** — Ao salvar o resultado de um jogo com `finalizado = 1`, todos os palpites daquele jogo têm seus pontos recalculados. Se o jogo for "desfinalizado", os pontos zeram.

6. **Upsert de palpites** — O sistema usa INSERT ou UPDATE dependendo se o usuário já possui palpite para aquele jogo.

7. **Validação de placar** — Gols são limitados a 0-99. Valores vazios ou não-numéricos são ignorados.

8. **Senha mínima** — 4 caracteres (tanto no cadastro quanto na redefinição).

9. **Token de recuperação** — Expira em 1 hora, uso único. Se SMTP não configurado, exibe link na tela (modo teste).

10. **E-mail único** — Não permite cadastro com e-mail já existente.

---

## 7. Deploy

### 7.1 Render (render.yaml)

O arquivo `render.yaml` define a infraestrutura para deploy automático no Render:

```yaml
databases:
  - name: bolao-db
    plan: free
    databaseName: bolao
    region: oregon
    postgresMajorVersion: 16

services:
  - type: web
    name: bolao-copa-2026
    env: node
    region: oregon
    plan: free
    buildCommand: npm install
    startCommand: node database/setup.js && node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: SESSION_SECRET
        generateValue: true
      - key: ADMIN_NOME
        value: Administrador
      - key: ADMIN_EMAIL
        sync: false
      - key: ADMIN_SENHA
        sync: false
      - key: DATABASE_URL
        fromDatabase:
          name: bolao-db
          property: connectionString
```

### 7.2 Script de Setup (`database/setup.js`)

O script `setup.js` é executado antes do servidor em produção:
1. Cria as tabelas (schema) se não existirem.
2. Verifica se há dados; se o banco estiver vazio, executa o seed (48 seleções, 12 grupos, 104 jogos).
3. Se as variáveis `ADMIN_EMAIL` e `ADMIN_SENHA` estiverem definidas, cria/atualiza o admin automaticamente.

### 7.3 Variáveis de Ambiente

| Variável          | Obrigatória | Descrição                              |
|-------------------|-------------|----------------------------------------|
| `PORT`            | Não         | Porta do servidor (default 3000)       |
| `SESSION_SECRET`  | Sim         | Segredo das sessões                    |
| `DATABASE_URL`    | Não         | Se presente, usa PostgreSQL (produção) |
| `NODE_ENV`        | Não         | `development` ou `production`          |
| `ADMIN_NOME`      | Não         | Nome do admin automático               |
| `ADMIN_EMAIL`     | Não         | E-mail do admin automático             |
| `ADMIN_SENHA`     | Não         | Senha do admin automático              |
| `SMTP_HOST`       | Não         | Servidor SMTP (recuperação de senha)   |
| `SMTP_PORT`       | Não         | Porta SMTP (default 587)               |
| `SMTP_USER`       | Não         | Usuário SMTP                           |
| `SMTP_PASS`       | Não         | Senha SMTP                             |
| `SMTP_FROM`       | Não         | Remetente dos e-mails                  |
| `BASE_URL`        | Não         | URL base para links no e-mail          |

---

## 8. Estrutura de Arquivos

```
bolao/
├── server.js                       # Entry point: configura Express, middlewares, rotas e inicia o servidor
├── package.json                    # Dependências e scripts (start, dev, seed, setup, criar-admin)
├── package-lock.json               # Lock de dependências
├── .env.example                    # Template de variáveis de ambiente
├── .env                            # Variáveis de ambiente (ignorado pelo git)
├── .gitignore                      # Arquivos ignorados pelo git
├── .node-version                   # Versão do Node (18)
├── README.md                       # Documentação do projeto
├── render.yaml                     # Configuração de deploy no Render.com
│
├── database/
│   ├── db.js                       # Adaptador dual SQLite/PostgreSQL (run, get, all)
│   ├── schema.js                   # Criação das tabelas (ambos bancos)
│   ├── seed.js                     # Popula 12 grupos, 48 seleções, 104 jogos e 16 estádios
│   ├── setup.js                    # Setup automático: schema + seed + admin via env vars
│   └── criar-admin.js              # Script interativo para criar administrador
│
├── routes/
│   ├── auth.js                     # Cadastro, login, logout
│   ├── palpites.js                 # CRUD de palpites da fase de grupos
│   ├── extras.js                   # Palpites extras (campeão, vice, fases)
│   ├── jogos.js                    # Listagem pública de jogos
│   ├── ranking.js                  # Ranking geral e detalhes por usuário
│   ├── senha.js                    # Recuperação de senha (esqueci-senha / redefinir-senha)
│   └── admin.js                    # Painel admin: resultados, usuários, recalcular pontos
│
├── middleware/
│   └── auth.js                     # Middlewares: verificarAutenticado, verificarAdmin, jaLogado
│
├── views/
│   ├── partials/
│   │   ├── header.ejs             # Head HTML, nav, logo (incluído em todas as páginas)
│   │   ├── footer.ejs             # Footer (incluído em todas as páginas)
│   │   └── flash.ejs              # Exibição de mensagens flash (sucesso, erro, aviso)
│   ├── home.ejs                   # Página inicial com hero, stats, regras e grupos
│   ├── cadastro.ejs               # Formulário de criação de conta
│   ├── login.ejs                  # Formulário de login
│   ├── palpites.ejs               # Palpites da fase de grupos (72 jogos)
│   ├── palpites-extras.ejs        # Palpites extras (campeão, vice, fases)
│   ├── palpites-usuario.ejs       # Detalhamento dos palpites de um participante
│   ├── jogos.ejs                  # Tabela de jogos pública
│   ├── ranking.ejs                # Ranking geral com posições e pontuação
│   ├── admin.ejs                  # Painel admin com estatísticas e ações
│   ├── admin-jogos.ejs            # Admin: editar resultados dos jogos
│   ├── admin-usuarios.ejs         # Admin: gerenciar participantes
│   ├── admin-extras.ejs           # Admin: definir resultados extras
│   ├── esqueci-senha.ejs          # Formulário "esqueci minha senha"
│   ├── redefinir-senha.ejs        # Formulário de redefinição de senha
│   ├── 404.ejs                    # Página de erro 404
│   └── 500.ejs                    # Página de erro 500
│
├── public/
│   └── css/
│       └── style.css              # CSS completo responsivo (tema verde/amarelo/azul)
│
├── data/                          # Diretório do banco SQLite (gitignorado)
│   └── bolao.db                   # Arquivo do banco SQLite
│
├── check-db.js                    # Script utilitário: exibe palpites do banco
├── check-jogos.js                 # Script utilitário: verifica jogos e palpites
├── reset-palpites.js              # Script utilitário: limpa palpites e resultados
├── promover-admin.js              # Script utilitário: promove usuário a admin via argumento
│
├── seed_out.log                   # Log do seed (stdout)
├── seed_err.log                   # Log do seed (stderr)
├── server_out.log                 # Log do servidor (stdout)
└── server_err.log                 # Log do servidor (stderr)
```
