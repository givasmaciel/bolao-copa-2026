# Especificação Técnica — Bolão da Copa do Mundo FIFA 2026

---

## 1. Visão Geral

Aplicação web full-stack em português do Brasil para cadastro de palpites sobre resultados da Copa do Mundo FIFA 2026. Suporta múltiplos participantes, cálculo automático de pontuação, ranking em tempo real, palpites extras sobre resultados gerais do torneio, recuperação de senha e painel administrativo completo. Desenvolvida sobre Node.js 18+ com Express 4.21 e EJS 3.1 para renderização server-side.

---

## 2. Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **Runtime** | Node.js 18+ |
| **Framework Web** | Express 4.21 |
| **Templates** | EJS 3.1 (server-side rendering) |
| **Banco (dev)** | SQLite 5 via `better-sqlite3` |
| **Banco (prod)** | PostgreSQL 16 no Render |
| **Sessão** | `express-session` (cookie 30 dias, `secure: true` em produção, `sameSite: 'lax'`) |
| **Hash de senhas** | `bcryptjs` (10 rounds) |
| **Flash messages** | `connect-flash` |
| **E-mail** | `nodemailer` (recuperação de senha, opcional) |
| **Deploy** | Render.com via `render.yaml` (plano free) |
| **CSS** | Puro, responsivo (cores verde/amarelo/azul) |
| **Bandeiras** | `flagcdn.com` (URLs externas) |
| **Trust proxy** | `app.set('trust proxy', 1)` — necessário para session cookie atrás do proxy HTTPS do Render |

---

## 3. Banco de Dados — Dual SQLite / PostgreSQL

O banco opera de forma transparente com **SQLite** (desenvolvimento local) ou **PostgreSQL** (produção no Render). A detecção é feita pela presença da variável `DATABASE_URL`:

- `database/db.js` expõe três funções — `run`, `get`, `all` — que abstraem as diferenças entre os SGBDs.
- Placeholders `?` são convertidos automaticamente para `$1, $2, ...` no PostgreSQL.
- `database/schema.js` cria as tabelas com sintaxe condicional:
  - `SERIAL` (PG) vs `AUTOINCREMENT` (SQLite) para PKs.
  - `TIMESTAMPTZ` (PG) vs `DATETIME` (SQLite) para colunas de data/hora.
  - `IF NOT EXISTS` para adição condicional de colunas.
- SQLite: `PRAGMA journal_mode = WAL` e `PRAGMA foreign_keys = ON`.
- Setup em produção: `node database/setup.js && node server.js`. O `setup.js` cria as tabelas, executa seed se vazio e cria/atualiza admin via variáveis de ambiente.

---

## 4. Tabelas

### `usuarios`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `nome` | TEXT NOT NULL | Nome de exibição do participante |
| `email` | TEXT NOT NULL UNIQUE | E-mail (normalizado para minúsculas) |
| `username` | TEXT UNIQUE | Apelido para login (nullable, auto-preenchido via prefixo do email) |
| `codigo_convite` | TEXT UNIQUE | Código de convite do usuário (nullable, gerado automaticamente no cadastro) |
| `senha_hash` | TEXT NOT NULL | Hash bcrypt da senha |
| `is_admin` | INTEGER DEFAULT 0 | 1 = administrador |
| `criado_em` | TIMESTAMP / DATETIME DEFAULT | Data de criação |

### `grupos`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `letra` | TEXT NOT NULL UNIQUE | Letra do grupo (A–L) |
| `nome` | TEXT NOT NULL | Ex.: "Grupo A" |

### `selecoes`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER PK | ID fixo 1–48 (proveniente do seed) |
| `nome` | TEXT NOT NULL | Nome em inglês |
| `nome_pt` | TEXT NOT NULL | Nome em português |
| `sigla` | TEXT NOT NULL | Sigla de 3 letras (ex.: BRA) |
| `bandeira_url` | TEXT | URL da bandeira (flagcdn.com) |
| `grupo_id` | INTEGER FK → grupos | Grupo ao qual pertence |

### `jogos`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER PK | ID fixo 1–104 (proveniente do seed) |
| `fase` | TEXT NOT NULL | `grupo`, `r32`, `r16`, `qf`, `sf`, `terceiro`, `final` |
| `rodada` | INTEGER NOT NULL | 1–9 |
| `grupo_id` | INTEGER FK → grupos | Grupo (apenas fase de grupos; null no mata-mata) |
| `selecao_casa_id` | INTEGER FK → selecoes | Time da casa (null no mata-mata) |
| `selecao_visitante_id` | INTEGER FK → selecoes | Time visitante (null no mata-mata) |
| `data` | TIMESTAMPTZ / DATETIME | Data/hora armazenada com offset -03:00 (BRT); PG converte para UTC internamente |
| `estadio` | TEXT | Nome do estádio |
| `cidade` | TEXT | Cidade-sede |
| `pais` | TEXT | País-sede |
| `gols_casa` | INTEGER | Gols reais (preenchido pelo admin; nullable) |
| `gols_visitante` | INTEGER | Gols reais (preenchido pelo admin; nullable) |
| `finalizado` | INTEGER DEFAULT 0 | 1 = jogo encerrado |

### `palpites`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `usuario_id` | INTEGER FK → usuarios | Quem palpitou |
| `jogo_id` | INTEGER FK → jogos | Qual jogo |
| `palpite_gols_casa` | INTEGER NOT NULL | Palpite do usuário (gols da casa) |
| `palpite_gols_visitante` | INTEGER NOT NULL | Palpite do usuário (gols visitante) |
| `pontos_obtidos` | INTEGER DEFAULT 0 | Pontuação calculada |
| `criado_em` | TIMESTAMP / DATETIME DEFAULT | Data de criação |
| `atualizado_em` | TIMESTAMP / DATETIME DEFAULT | Data da última edição |
| UNIQUE | `(usuario_id, jogo_id)` | Um palpite por jogo por usuário |

### `palpites_extras`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `usuario_id` | INTEGER FK → usuarios | Quem palpitou |
| `categoria` | TEXT NOT NULL | `campeao`, `vice`, `terceiro`, `r32`, `oitavas`, `quartas`, `semi`, `finalista` |
| `selecao_id` | INTEGER FK → selecoes | Seleção escolhida |
| `criado_em` | TIMESTAMP / DATETIME DEFAULT | Data de criação |
| UNIQUE | `(usuario_id, categoria, selecao_id)` | |

### `resultados_extras`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `categoria` | TEXT NOT NULL | Mesmas categorias dos palpites extras |
| `selecao_id` | INTEGER FK → selecoes | Seleção vencedora da categoria |
| `pontos` | INTEGER NOT NULL DEFAULT 0 | Pontos que a categoria vale |
| UNIQUE | `(categoria, selecao_id)` | |

### `password_reset_tokens`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `usuario_id` | INTEGER FK → usuarios | Usuário que solicitou |
| `token` | TEXT NOT NULL UNIQUE | Token aleatório (32 bytes hex) |
| `expira_em` | TIMESTAMP NOT NULL | Prazo de expiração (1 hora) |
| `usado` | INTEGER DEFAULT 0 | 1 = já utilizado |
| `criado_em` | TIMESTAMP / DATETIME DEFAULT | Data de criação |

### `config`

| Coluna | Tipo | Descrição |
|---|---|---|
| `chave` | TEXT PRIMARY KEY | Nome da chave |
| `valor` | TEXT NOT NULL | Valor da configuração |

Armazena configurações do sistema, como o prazo limite dos palpites extras (ex.: `extras_deadline`).

---

## 5. Rotas — Referência Completa

### 5.1 Autenticação (`routes/auth.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/cadastro` | Exibe formulário de cadastro |
| POST | `/cadastro` | Cria usuário (nome, email, senha, codigo_convite); auto-login após criação |
| GET | `/login` | Exibe formulário de login |
| POST | `/login` | Autentica por email / username / nome + senha; inicia sessão |
| POST | `/logout` | Destrói a sessão |

**Regras:**
- Usuários já logados são redirecionados para `/dashboard`.
- E-mail normalizado para minúsculas antes de salvar/buscar.
- Senha mínima de 4 caracteres.
- `codigo_convite` (código de convite) obrigatório no cadastro; cada usuário recebe o seu automaticamente no momento da criação.
- Após cadastro bem-sucedido, o usuário é logado automaticamente.

### 5.2 Dashboard (`routes/dashboard.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dashboard` | Página principal pós-login com resumo estatístico |

**Conteúdo:**
- Cards com: total de pontos, jogos finalizados, palpites pendentes, posição no ranking.
- Próximos 5 jogos com contagem regressiva (BRT).
- Top 5 do ranking.
- Banner de alerta com contagem regressiva para o próximo jogo.
- Nome, posição e pontos do usuário logado.

### 5.3 Palpites dos Jogos (`routes/palpites.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/palpites` | Lista os 72 jogos da fase de grupos com formulário individual por jogo |
| POST | `/palpites/salvar/:jogoId` | Salva ou atualiza o palpite de UM jogo específico |

**Regras:**
- Apenas jogos com `fase = 'grupo'` são exibidos.
- Cada jogo possui seu próprio formulário e botão "Salvar" individual (NÃO é salvamento em lote).
- Cada jogo é bloqueado 2 minutos antes do seu horário (horário de Brasília).
- Jogos finalizados (`finalizado = 1`) são bloqueados independentemente do horário.
- Administradores são redirecionados para `/admin` com mensagem flash.
- Placar validado entre 0–99; valores vazios ou não numéricos são ignorados.
- Se o jogo possui campo `time_casa` (nome alternativo) ou está bloqueado, exibe mensagem apropriada.
- Lógica de upsert: INSERT se não existe palpite; UPDATE se já existe.

### 5.4 Palpites Extras (`routes/extras.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/palpites-extras` | Exibe formulário com 8 categorias de aposta |
| POST | `/palpites-extras` | Salva palpites extras do usuário (salvamento por categoria) |
| GET | `/admin/extras` | Admin: define resultados das categorias |
| POST | `/admin/extras` | Admin: salva resultados das categorias |

**Categorias:**

| Categoria | Seleções por usuário | Pontos por acerto |
|---|---|---|
| `campeao` | 1 | 150 |
| `vice` | 1 | 150 |
| `terceiro` | 1 | 150 |
| `finalista` | 2 | 30 |
| `semi` | 4 | 20 |
| `quartas` | 8 | 15 |
| `oitavas` | 16 | 10 |
| `r32` | 32 | 10 |

**Regras:**
- Prazo configurável via tabela `config` (chave `extras_deadline`).
- Categorias com múltiplas seleções usam checkboxes; as demais usam select.
- Cada categoria possui seu próprio botão de salvar (salvamento individual por categoria).
- Administradores são bloqueados (redirecionados para `/admin`).
- Contador visual de seleções no front-end.

### 5.5 Resumo / Estatísticas (`routes/resumo.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/resumo` | Estatísticas detalhadas do usuário |

**Conteúdo:**
- Distribuição dos pontos: placar exato, resultado + gol, só resultado, etc.
- Pontos por rodada (exibidos em barras ou cards).
- Seletor de "racha" (head-to-head) com qualquer participante — mostra quem venceria se apenas os jogos daquele participante fossem considerados.
- Histórico de jogos finalizados: resultado real × palpite × pontos obtidos.
- Filtro por período (data início / data fim).

### 5.6 Configurações do Perfil (`routes/config.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/config` | Página de configurações do usuário |

**Funcionalidades:**
- Alterar nome de exibição (`nome`) — também sincronizado com o campo `username` para login.
- Visualizar o próprio código de convite (`codigo_convite`) para compartilhar com novos participantes.
- Exibição de mensagens flash de sucesso/erro.

### 5.7 Jogos — Listagem Pública (`routes/jogos.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/jogos` | Lista pública de todos os 104 jogos agrupados por fase |

**Características:**
- Página pública (não requer login).
- Exibe placar real se finalizado, ou "×" se pendente.
- Fases: grupo, r32, r16, qf, sf, terceiro, final.
- Mostra bandeira, estádio, cidade, data/hora e grupo (quando aplicável).

### 5.8 Ranking (`routes/ranking.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/ranking` | Ranking geral com pontuação total |

**Cálculo:**
- `total_pontos = SUM(palpites.pontos_obtidos) + SUM(pontos dos palpites_extras via subquery)`.
- Exclui administradores (`is_admin = 0`).
- Critério de desempate: maior número de palpites com `pontos_obtidos > 0`; persistindo empate, ordem alfabética por nome.
- Posição calculada no servidor: muda apenas quando o total de pontos difere do participante anterior.

### 5.9 Recuperação de Senha (`routes/senha.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/esqueci-senha` | Formulário para solicitar redefinição |
| POST | `/esqueci-senha` | Gera token (32 bytes hex), envia e-mail ou exibe link na tela |
| GET | `/redefinir-senha/:token` | Valida token e exibe formulário de nova senha |
| POST | `/redefinir-senha/:token` | Redefine a senha e marca token como usado |

**Regras:**
- Token expira em 1 hora; uso único.
- Se SMTP não configurado (variáveis `SMTP_*` ausentes), o link de redefinição é exibido na tela (modo teste/desenvolvimento).
- Mensagem genérica se e-mail não encontrado (segurança — não revela existência da conta).

### 5.10 Administração (`routes/admin.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/admin` | Painel administrativo com estatísticas |
| GET | `/admin/jogos` | Lista todos os jogos para editar resultados |
| POST | `/admin/jogos/:id` | Salva resultado + flag `finalizado`; recalcula pontos automaticamente |
| POST | `/admin/recalcular` | Recalcula TODOS os pontos de TODOS os palpites |
| GET | `/admin/usuarios` | Gerencia participantes |
| POST | `/admin/usuarios/:id/tornar-admin` | Promove participante a administrador |
| POST | `/admin/usuarios/:id/rebaixar` | Rebaixa administrador a participante |
| POST | `/admin/usuarios/:id/resetar-palpites` | Apaga palpites e palpites extras do usuário |
| POST | `/admin/usuarios/:id/resetar-senha` | Redefine a senha do usuário |
| POST | `/admin/usuarios/:id/excluir` | Exclui usuário e todos os seus palpites |
| POST | `/admin/usuarios/:id/alterar-username` | Altera o username do usuário |
| POST | `/admin/resetar-todos-palpites` | Apaga TODOS os palpites do sistema |
| GET | `/admin/criar-participante` | Formulário para criar participante manualmente |
| POST | `/admin/criar-participante` | Cria participante (ignorando sistema de convites) |
| POST | `/admin/config` | Atualiza configurações (ex.: prazo dos extras) |

**Regras:**
- Todas as rotas protegidas pelo middleware `verificarAdmin`.
- Ao finalizar um jogo com placar, os pontos de todos os palpites daquele jogo são recalculados automaticamente via `calcularPontos()`.
- Se um jogo for "desfinalizado" (`finalizado = 0`), os pontos são zerados.

---

## 6. Sistema de Pontuação

### 6.1 Pontuação dos Palpites (função `calcularPontos` em `routes/admin.js`)

A lógica segue a ordem de precedência abaixo (a primeira condição verdadeira determina os pontos):

| # | Condição | Pontos |
|---|---|---|
| 1 | `gols_casa === palpite_casa && gols_visitante === palpite_visitante` | **20** (placar exato) |
| 2 | Resultado real é empate E palpite é empate (qualquer placar de empate) | **14** |
| 3 | Resultado correto (vitória/derrota) E acertou o gol de pelo menos um dos times | **14** |
| 4 | Resultado correto (vitória/derrota) E errou os gols de ambos os times | **6** |
| 5 | Resultado errado (inverteu vencedor) E acertou o gol de pelo menos um dos times | **4** |
| 6 | Nenhuma das anteriores (errou resultado e gols) | **0** |

Os pontos são armazenados na coluna `pontos_obtidos` da tabela `palpites` e recalculados sempre que o admin salva ou atualiza o resultado de um jogo.

### 6.2 Pontuação dos Palpites Extras

A pontuação é fixa por categoria, conforme tabela na seção 5.4. Os pontos são somados ao total do ranking via subquery na consulta de ranking.

---

## 7. Regras de Negócio

1. **Admin não participa** — Usuários com `is_admin = 1` são redirecionados para `/admin` ao tentar acessar `/palpites` ou `/palpites-extras` (com mensagem flash). São excluídos do ranking.

2. **Bloqueio de 2 minutos** — Cada palpite de jogo é bloqueado 2 minutos antes do horário do jogo (horário de Brasília). A verificação é feita por jogo individualmente.

3. **Jogos finalizados são imutáveis** — Se `finalizado = 1`, o palpite é bloqueado independentemente do horário.

4. **Mata-mata indisponível para palpites** — Apenas a fase de grupos está disponível para apostas. Confrontos de mata-mata têm `selecao_casa_id` e `selecao_visitante_id` nulos.

5. **Recálculo automático** — Ao salvar resultado com `finalizado = 1`, todos os palpites daquele jogo são recalculados. Se desfinalizado, pontos zeram.

6. **Upsert de palpites** — INSERT se não existe palpite para o par (usuário, jogo); UPDATE se já existe.

7. **Validação de placar** — Gols limitados a 0–99. Valores vazios ou não numéricos são ignorados.

8. **Senha mínima** — 4 caracteres (cadastro e redefinição).

9. **Token de recuperação** — Expira em 1 hora; uso único. Sem SMTP, link é exibido na tela.

10. **Código de convite obrigatório** — Necessário no cadastro. Cada usuário recebe o seu automaticamente na criação.

11. **Login flexível** — Aceita email, username ou nome (display name) no campo de login.

12. **Sincronização de username** — Preenchido automaticamente a partir do prefixo do email (via migration). Atualizado quando o nome é alterado em `/config`.

13. **Salvamento individual** — Cada jogo na página de palpites possui seu próprio formulário e botão "Salvar" (não há salvamento em lote).

14. **Trust proxy** — `app.set('trust proxy', 1)` é essencial para o cookie de sessão funcionar atrás do proxy HTTPS do Render.

15. **Horário BRT** — Todos os horários armazenados com offset -03:00. O PostgreSQL (`TIMESTAMPTZ`) normaliza para UTC internamente.

16. **Extras deadline configurável** — O prazo para palpites extras é armazenado na tabela `config` (chave `extras_deadline`) e verificado no servidor.

---

## 8. Deploy

### 8.1 Render (`render.yaml`)

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

- `SESSION_SECRET` é auto-gerado pelo Render.
- `DATABASE_URL` é vinculada automaticamente ao banco `bolao-db`.
- `ADMIN_EMAIL` e `ADMIN_SENHA` devem ser configurados manualmente no dashboard do Render.
- Nome do serviço: `bolao-copa-2026`.
- URL de produção: `https://bolao-copa-2026-zjoi.onrender.com`.

### 8.2 Script de Setup (`database/setup.js`)

Executado antes do servidor em produção:
1. Cria as tabelas (schema) se não existirem.
2. Verifica se há dados; se vazio, executa o seed (48 seleções, 12 grupos, 104 jogos).
3. Se `ADMIN_EMAIL` e `ADMIN_SENHA` estiverem definidas, cria ou atualiza o administrador automaticamente.

---

## 9. Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `PORT` | Não | Porta do servidor (default: 3000) |
| `SESSION_SECRET` | Sim | Segredo para assinatura dos cookies de sessão |
| `DATABASE_URL` | Não | Se presente, usa PostgreSQL; caso contrário, SQLite |
| `NODE_ENV` | Não | `development` ou `production` |
| `ADMIN_NOME` | Não | Nome do administrador criado no setup (default: "Administrador") |
| `ADMIN_EMAIL` | Não | E-mail do administrador (obrigatório se quiser criação automática) |
| `ADMIN_SENHA` | Não | Senha do administrador (obrigatório se quiser criação automática) |
| `BASE_URL` | Não | URL base para links em e-mails de recuperação |
| `SMTP_HOST` | Não | Servidor SMTP para envio de e-mails |
| `SMTP_PORT` | Não | Porta SMTP (default: 587) |
| `SMTP_USER` | Não | Usuário SMTP |
| `SMTP_PASS` | Não | Senha SMTP |
| `SMTP_FROM` | Não | Remetente dos e-mails |

---

## 10. Estrutura de Arquivos

```
bolao/
├── server.js                         # Entry point: configura Express, middlewares, rotas, trust proxy
├── package.json                      # Dependências e scripts (start, dev, seed, setup, criar-admin)
├── .env.example                      # Template de variáveis de ambiente
├── .node-version                     # Versão do Node (18)
├── render.yaml                       # Configuração de deploy no Render.com
│
├── database/
│   ├── db.js                         # Adaptador dual SQLite/PostgreSQL (run, get, all)
│   ├── schema.js                     # Criação das tabelas com sintaxe condicional
│   ├── seed.js                       # Popula 12 grupos, 48 seleções, 104 jogos e 16 estádios
│   ├── setup.js                      # Setup automático: schema + seed + admin via env vars
│   └── criar-admin.js                # Script interativo para criar administrador
│
├── routes/
│   ├── auth.js                       # Cadastro, login, logout
│   ├── dashboard.js                  # Página inicial pós-login com estatísticas
│   ├── palpites.js                   # Palpites da fase de grupos (salvamento individual)
│   ├── extras.js                     # Palpites extras (campeão, vice, fases)
│   ├── resumo.js                     # Estatísticas detalhadas, racha, histórico
│   ├── config.js                     # Configurações do perfil (nome, código de convite)
│   ├── jogos.js                      # Listagem pública de jogos
│   ├── ranking.js                    # Ranking geral
│   ├── senha.js                      # Recuperação de senha
│   └── admin.js                      # Painel admin: resultados, usuários, recalcular, config
│
├── middleware/
│   └── auth.js                       # Middlewares: verificarAutenticado, verificarAdmin, jaLogado
│
├── views/
│   ├── partials/
│   │   ├── header.ejs               # Head HTML, nav, logo
│   │   ├── footer.ejs               # Footer
│   │   └── flash.ejs                # Mensagens flash (sucesso, erro, aviso)
│   ├── home.ejs                      # Página inicial pública
│   ├── login.ejs                     # Formulário de login
│   ├── cadastro.ejs                  # Formulário de cadastro
│   ├── dashboard.ejs                 # Dashboard pós-login
│   ├── palpites.ejs                  # Palpites da fase de grupos (72 jogos)
│   ├── palpites-extras.ejs           # Palpites extras
│   ├── palpites-usuario.ejs          # Detalhamento dos palpites de um participante
│   ├── jogos.ejs                     # Tabela de jogos pública
│   ├── ranking.ejs                   # Ranking geral
│   ├── resumo.ejs                    # Estatísticas detalhadas
│   ├── config.ejs                    # Configurações do perfil
│   ├── admin.ejs                     # Painel admin
│   ├── admin-jogos.ejs               # Admin: editar resultados
│   ├── admin-usuarios.ejs            # Admin: gerenciar participantes
│   ├── admin-extras.ejs              # Admin: definir resultados extras
│   ├── esqueci-senha.ejs             # Formulário "esqueci minha senha"
│   ├── redefinir-senha.ejs           # Formulário de redefinição de senha
│   ├── 404.ejs                       # Página de erro 404
│   └── 500.ejs                       # Página de erro 500
│
├── public/
│   └── css/
│       └── style.css                 # CSS responsivo (tema verde/amarelo/azul)
│
├── scripts/
│   └── verificar-horarios.js         # Script utilitário para verificar horários dos jogos
│
├── data/
│   └── bolao.db                      # Arquivo do banco SQLite (gitignorado)
│
├── check-db.js                       # Script: exibe palpites do banco
├── check-jogos.js                    # Script: verifica jogos e palpites
├── reset-palpites.js                 # Script: limpa palpites e resultados
└── promover-admin.js                 # Script: promove usuário a admin via argumento
```

---

## 11. Notas Técnicas Adicionais

- **Render free tier**: O banco PostgreSQL e o serviço web休眠 após 15 minutos de inatividade. A primeira requisição após o período de inatividade pode levar alguns segundos (cold start).
- **Timezone**: Todas as datas de jogos são armazenadas com offset `-03:00` (BRT). O PostgreSQL (TIMESTAMPTZ) converte internamente para UTC; o SQLite armazena como datetime string.
- **Segurança de sessão**: `sameSite: 'lax'` e `secure: true` em produção. O trust proxy é ativado com `app.set('trust proxy', 1)` para que o Express confie no header `X-Forwarded-Proto` enviado pelo proxy do Render.
- **Índices**: A constraint UNIQUE em `palpites(usuario_id, jogo_id)` atua como índice para consultas de ranking e recálculo.
