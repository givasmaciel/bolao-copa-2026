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
| **Banco (prod)** | PostgreSQL 16 no Neon |
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

O banco opera de forma transparente com **SQLite** (desenvolvimento local) ou **PostgreSQL** (produção no Neon). A detecção é feita pela presença da variável `DATABASE_URL`:

- `database/db.js` expõe três funções — `run`, `get`, `all` — que abstraem as diferenças entre os SGBDs.
- Placeholders `?` são convertidos automaticamente para `$1, $2, ...` no PostgreSQL.
- `database/schema.js` cria as tabelas com sintaxe condicional:
  - `SERIAL` (PG) vs `AUTOINCREMENT` (SQLite) para PKs.
  - `TIMESTAMPTZ` (PG) vs `DATETIME` (SQLite) para colunas de data/hora.
  - `IF NOT EXISTS` para adição condicional de colunas.
- **Atenção — dupla fonte de verdade**: O `schema.js` contém uma migration (linhas ~328–407) que sobrescreve os 72 jogos de grupo toda vez que o servidor inicia. O `seed.js` também define esses mesmos jogos. **Ambos os arquivos devem ser mantidos em sincronia** ao alterar horários, estádios ou cidades de jogos da fase de grupos.
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
| `senha_hash` | TEXT NOT NULL | Hash bcrypt da senha |
| `is_admin` | INTEGER DEFAULT 0 | 1 = administrador |
| `criado_em` | TIMESTAMP / DATETIME DEFAULT | Data de criação |
| `foto_base64` | TEXT | Foto de perfil em base64 (persiste no PostgreSQL mesmo após deploy no Render) |
| `foto` | TEXT | Caminho da foto no disco (efêmero no Render) |

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
| `palpite_limite` | TIMESTAMPTZ / DATETIME | Prazo customizado de palpites (admin pode alterar). Se null, usa a regra padrão de 2 min antes do jogo. |
| `estadio` | TEXT | Nome do estádio |
| `cidade` | TEXT | Cidade-sede |
| `pais` | TEXT | País-sede |
| `gols_casa` | INTEGER | Gols reais nos 90 min (preenchido pelo admin; nullable) |
| `gols_visitante` | INTEGER | Gols reais nos 90 min (preenchido pelo admin; nullable) |
| `gols_casa_pror` | INTEGER | Gols na prorrogação (nullable; só mata-mata) |
| `gols_visitante_pror` | INTEGER | Gols na prorrogação (nullable; só mata-mata) |
| `placar_penaltis_casa` | INTEGER | Gols na disputa de pênaltis (nullable; só mata-mata) |
| `placar_penaltis_visitante` | INTEGER | Gols na disputa de pênaltis (nullable; só mata-mata) |
| `classificado_id` | INTEGER FK → selecoes | Quem avançou no mata-mata (nullable; preenchido quando vai para pró./pên.) |
| `descricao` | TEXT | Texto descritivo do confronto mata-mata (ex.: "1ºA vs 3ºC/E/F/H/I") |
| `finalizado` | INTEGER DEFAULT 0 | 1 = jogo encerrado |

### `palpites`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `usuario_id` | INTEGER FK → usuarios | Quem palpitou |
| `jogo_id` | INTEGER FK → jogos | Qual jogo |
| `palpite_gols_casa` | INTEGER NOT NULL | Palpite do usuário (gols da casa nos 90 min) |
| `palpite_gols_visitante` | INTEGER NOT NULL | Palpite do usuário (gols visitante nos 90 min) |
| `palpite_classificado_id` | INTEGER FK → selecoes | Quem o usuário acha que avança no mata-mata (nullable; só mata-mata). Se acertar e o jogo foi para pró./pên., ganha o bônus `pts_classificado`. |
| `pontos_obtidos` | INTEGER DEFAULT 0 | Pontuação calculada (pts dos 90 min + bônus classificado) |
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

Armazena configurações do sistema, como o prazo limite dos palpites extras (ex.: `extras_data_limite`) e o marcador do banco (`db_marker`) usado pelo `/jogos/db-info` e exibido no rodapé do site. Exemplo de valores: `db_marker=render-producao-2026-06-19`, `db_marker=neon-producao-2026-06-27`.

### `fase_pontuacao`

| Coluna | Tipo | Descrição |
|---|---|---|
| `fase` | TEXT PRIMARY KEY | `grupo`, `r32`, `r16`, `qf`, `sf`, `terceiro`, `final` |
| `pts_exato` | INTEGER DEFAULT 20 | Pontos por placar exato (90 min) |
| `pts_empate` | INTEGER DEFAULT 14 | Pontos por acertar empate (qualquer placar) |
| `pts_resultado_gol` | INTEGER DEFAULT 14 | Pontos por resultado + 1 gol certo |
| `pts_resultado` | INTEGER DEFAULT 8 | Pontos por resultado correto sem gols |
| `pts_gol` | INTEGER DEFAULT 3 | Pontos por 1 gol certo mas resultado errado |
| `pts_classificado` | INTEGER DEFAULT 0 | Bônus por acertar quem classificou na prorrogação/pênaltis (só mata-mata). Default = metade do `pts_resultado`; configurável em `/admin/pontuacao-fases`. |

### `pontos_bonus`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL / INTEGER PK | ID único |
| `usuario_id` | INTEGER FK → usuarios | Participante que recebeu o bônus |
| `pontos` | INTEGER NOT NULL DEFAULT 0 | Quantidade de pontos bônus |
| `motivo` | TEXT | Justificativa do bônus (ex.: "entrou na rodada 2") |
| `criado_em` | TIMESTAMP / DATETIME DEFAULT | Data de criação |

---

## 5. Rotas — Referência Completa

### 5.1 Autenticação (`routes/auth.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/cadastro` | Exibe formulário de cadastro |
| POST | `/cadastro` | Cria usuário (nome, email, senha); auto-login após criação |
| GET | `/login` | Exibe formulário de login |
| POST | `/login` | Autentica por email / username / nome + senha; inicia sessão |
| POST | `/logout` | Destrói a sessão |

**Regras:**
- Usuários já logados são redirecionados para `/dashboard`.
- E-mail normalizado para minúsculas antes de salvar/buscar.
- Senha mínima de 4 caracteres.
- Cadastro aberto, sem necessidade de código de convite (bloqueado após o fechamento dos palpites extras, verificado pela chave `extras_data_limite` na tabela `config`).
- Após cadastro bem-sucedido, o usuário é logado automaticamente.

### 5.2 Dashboard (`routes/dashboard.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/dashboard` | Página principal pós-login com resumo estatístico |

**Conteúdo:**
- Cards com: total de pontos (incluindo bônus e extras com tags), jogos finalizados, palpites pendentes.
- Tabela de pontuação por fase (dinâmica do banco).
- Regras gerais com item sobre encerramento de cadastro após prazo dos extras.
- Próximos 5 jogos com contagem regressiva (BRT).
- Top 5 do ranking.
- **Banner do próximo jogo com 3 estados visuais:**
  - **Fechado** (`jahFechou = true`) — fundo vermelho claro, "🔒 JOGO FECHADO" em CAIXA ALTA vermelha; exibe palpite do usuário ou "Você não palpitou".
  - **Urgente** (`diffMin <= 120`) — gradiente amarelo→laranja, "⚠️ PALPITE FECHANDO" em CAIXA ALTA laranja escuro, ícone com `animation: pulse 1.5s infinite`, box-shadow amarelo translúcido; CTA "Palpitar agora →" em laranja escuro.
  - **Aberto** — fundo amarelo claro, "⚽ PRÓXIMO JOGO" em verde; exibe "Aberto para palpites até X minutos".
- Notificação de palpites extras pendentes.

### 5.3 Palpites dos Jogos (`routes/palpites.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/palpites` | Lista todos os jogos (grupos + mata-mata) com formulário individual por jogo |
| POST | `/palpites/salvar/:jogoId` | Salva ou atualiza o palpite de UM jogo específico |

**Regras:**
- Jogos de todas as fases são exibidos: grupos e mata-mata (r32, r16, qf, sf, terceiro, final).
- Jogos de mata-mata sem times definidos (`selecao_casa_id` nulo) são ocultados até o admin gerar os confrontos.
- Cada jogo possui seu próprio formulário e botão "Salvar" individual (NÃO é salvamento em lote).
- Cada jogo é bloqueado 2 minutos antes do seu horário (horário de Brasília).
- Jogos finalizados (`finalizado = 1`) são bloqueados independentemente do horário.
- Administradores são redirecionados para `/admin` com mensagem flash.
- Placar validado entre 0–99; valores vazios ou não numéricos são ignorados.
- Se o jogo possui campo `time_casa` (nome alternativo) ou está bloqueado, exibe mensagem apropriada.
- Lógica de upsert: INSERT se não existe palpite; UPDATE se já existe.

**Layout da página `/palpites`:**
- **Progress bar** no topo: card verde com "**X** / Y jogos (NN%)" + barra gradiente verde; mensagem contextual "Faltam Y palpites — continue! ⚽" ou "🎉 Você palpitou em todos os jogos!".
- **Card "Seus palpites salvos"** (expansível, **inicia colapsado** por padrão): agrupa palpites por fase com header da fase (ex.: "Fase de Grupos - Rodada 1", "16 avos de Final", "Oitavas") + badge "feitos/total". Primeiros 3 palpites visíveis com ✔ verde; botão "Ver mais N ▾" expande o restante (vira "Ocultar ▴"). Pontos inline nos jogos finalizados.
- **Cards de jogo compactos** (grid 3 colunas `1fr auto 1fr`): casa | placar + botão Salvar | visitante. Metadata (data, estádio, contagem, countdown) consolidada em um footer horizontal separado por `border-top: 1px dashed`.
- **Por fase**: cada fase agrupa seus jogos. Grupos são subdivididos em rodadas, mata-mata aparece por fase (r32, r16, qf, sf, 3º, final). Botões "⚡ Preencher todos" e "💾 Salvar todos" por agrupamento.

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
| `campeao` | 1 | 200 |
| `vice` | 1 | 150 |
| `terceiro` | 1 | 100 |
| `finalista` | 2 | 50 |
| `semi` | 4 | 30 |
| `quartas` | 8 | 15 |
| `oitavas` | 16 | 10 |
| `r32` | 32 | 5 |

**Regras:**
- Prazo configurável via tabela `config` (chave `extras_data_limite`).
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
- Upload e remoção de foto de perfil — salva como arquivo no disco (`public/uploads/`) e como base64 na tabela `usuarios.foto_base64` para persistir no PostgreSQL mesmo após deploy no Render.
- Exibição da foto via rota `/foto/:id` (prioriza base64 do banco → fallback arquivo → fallback SVG com iniciais).
- Exibição de mensagens flash de sucesso/erro.

### 5.7 Jogos — Listagem Pública (`routes/jogos.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/jogos` | Lista pública de todos os 104 jogos agrupados por fase |
| GET | `/jogos/db-info` | Diagnóstico público: retorna JSON com `host` (da `DATABASE_URL`), `marcador` (do `config.chave='db_marker'`), `contagens` (`usuarios`, `jogos`, `palpites`, `jogos_finalizados`) e `rodando_em` (timestamp ISO) |

**Características:**
- Página pública (não requer login).
- Exibe placar real se finalizado, ou "×" se pendente.
- Fases: grupo, r32, r16, qf, sf, terceiro, final.
- Mostra bandeira, estádio, cidade, data/hora e grupo (quando aplicável).
- **`/jogos/db-info`**: o `marcador` permite distinguir Render vs Neon vs dev local. É exibido também no rodapé do site (discreto, opacity 0.5) para evitar confusão quando há mais de um banco em uso.

### 5.8 Ranking (`routes/ranking.js`)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/ranking` | Ranking geral com pontuação total |

**Conteúdo:**
- Card expansível no topo com tabela de **Critérios de desempate** (4 colunas: `# / Critério / Pontos / O que conta`), com badges destacando os pesos por acerto (20/14/8/3 pts, +1/gol, qtd, soma, abc).
- Banner com 4 células: 🏆 **Líder** (nome + pts), ✅ **Mais palpites pontuados** (com qtd e "de X finalizados"), 🎯 **Mais placares exatos** (com qtd de acertos), 📊 **Média geral** (pts/palpite em jogos finalizados).
- Card de **Estatísticas dos Jogos Concluídos** com placares exatos, acertos de resultado, empates, 1 gol certo, zeros, média pts/palpite, melhor palpite, aproveitamento médio global, usuários pontuando, etc. — cada um em uma célula com label em maiúsculas e valor grande.
- Tabela principal com as colunas:
  - `#` (posição com 🥇🥈🥉 para top 3)
  - `Participante` (avatar + nome + tag "(você)" para o usuário logado)
  - `Palpites` (total dinâmico de palpites feitos pelo participante até o momento — cresce conforme ele palita novos jogos)
  - `🎯 Qualidade dos acertos` (grupo de 6 sub-colunas): **Exatos** (20 pts) → **Res+Gol** (14 pts) → **Só Res** (8 pts) → **1 Gol** (3 pts) → **Gols** (placares parciais certos) → **Pont.** (soma das 4 primeiras = palpites pontuados)
  - `Média` (pts/palpite em finalizados)
  - `Aproveit.` (% do máximo possível em finalizados)
  - `Pontos` (com barra visual proporcional ao líder)
- Tabela por rodada: pontos acumulados em cada rodada (R1, R2, R3, 16av, 8av, QF, SF, 3º, Final) + coluna "Extra" (soma de extras e bônus) antes do total.
- Disclaimer explicando a regra de bônus (último colocado -1) e que cadastro encerra após o prazo dos extras.
- Se houver resultados de extras definidos, seção "Resultados dos Palpites Extras" com acertadores por seleção.

**Cálculo:**
- `total_pontos = SUM(palpites.pontos_obtidos) + SUM(pontos dos palpites_extras via subquery) + SUM(pontos_bonus)`.
- Exclui administradores (`is_admin = 0`).
- **Critérios de desempate (8 níveis, do mais forte pro mais fraco):**

  | # | Critério | SQL / Métrica | Pontos (grupos) |
  |---|---|---|---|
  | 1 | Total de pontos | `total_pontos` | soma |
  | 2 | Placares exatos | `placares_exatos` | 20 pts |
  | 3 | Resultado + gol | `acertos_resultado_gol` | 14 pts |
  | 4 | Só resultado | `acertos_resultado` | 8 pts |
  | 5 | Gols certos | `gols_acertados` (soma dos placares parciais) | +1 / gol |
  | 6 | 1 gol certo | `acertos_gol` | 3 pts |
  | 7 | Palpites pontuados | `palpites_com_pontos` | qtd |
  | 8 | Nome | `u.nome` | alfabético |

  Critérios 2–6 consideram apenas **jogos finalizados**. Extras e bônus entram no total mas não no desempate de qualidade. Os pesos exatos por acerto vêm da tabela `fase_pontuacao` e podem variar por fase.
- Posição calculada no servidor: muda apenas quando o total de pontos difere do participante anterior.
- Aproveitamento = (pontos do participante / totalDisputado) × 100, onde totalDisputado = soma dos pts_exato dos jogos finalizados + soma dos pontos dos resultados_extras.

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
| GET | `/admin/pontuacao-fases` | Exibe formulário de configuração de pontos por fase |
| POST | `/admin/pontuacao-fases` | Salva pontuação personalizada por fase |
| POST | `/admin/jogos/:id/horario` | Edita data/hora, estádio, cidade e país de um jogo (interpretado como BRT, convertido para UTC) |
| POST | `/admin/usuarios/:id/bonus` | Adiciona pontos bônus a um participante (com motivo) |
| POST | `/admin/usuarios/:id/bonus/:bonusId/remover` | Remove um bônus específico |
| POST | `/admin/usuarios/:id/bonus/:bonusId/editar` | Edita pontos e motivo de um bônus específico |

**Regras:**
- Todas as rotas protegidas pelo middleware `verificarAdmin`.
- Ao finalizar um jogo com placar, os pontos de todos os palpites daquele jogo são recalculados automaticamente via `calcularPontos()`.
- Se um jogo for "desfinalizado" (`finalizado = 0`), os pontos são zerados.
- **Editar horário/estádio**: o botão "🕐 Horário/Estádio" em `/admin/jogos` abre um modal inline com os valores atuais de data/hora, estádio, cidade e país. A data/hora é interpretada como BRT e convertida para UTC ao salvar. Útil para correções pontuais sem deploy.

---

## 6. Sistema de Pontuação

### 6.1 Pontuação dos Palpites (função `calcularPontos` em `routes/admin.js`)

A lógica segue a ordem de precedência abaixo (a primeira condição verdadeira determina os pontos). Os valores exatos para cada condição são lidos da tabela `fase_pontuacao` de acordo com a fase do jogo, e configuráveis pelo admin em `/admin/pontuacao-fases`:

| # | Condição | Pontos (padrão — grupos) |
|---|---|---|
| 1 | `gols_casa === palpite_casa && gols_visitante === palpite_visitante` | `pts_exato` (**20**) |
| 2 | Resultado real é empate E palpite é empate (qualquer placar de empate) | `pts_empate` (**14**) |
| 3 | Resultado correto (vitória/derrota) E acertou o gol de pelo menos um dos times | `pts_resultado_gol` (**14**) |
| 4 | Resultado correto (vitória/derrota) E errou os gols de ambos os times | `pts_resultado` (**8**) |
| 5 | Resultado errado (inverteu vencedor) E acertou o gol de pelo menos um dos times | `pts_gol` (**3**) |
| 6 | Nenhuma das anteriores (errou resultado e gols) | **0** |

Os pontos são armazenados na coluna `pontos_obtidos` da tabela `palpites` e recalculados sempre que o admin salva ou atualiza o resultado de um jogo.

Os valores padrão por fase são:

| Fase | pts_exato | pts_empate | pts_resultado_gol | pts_resultado | pts_gol |
|---|---|---|---|---|---|
| Grupos | 20 | 14 | 14 | 8 | 3 | 0 |
| 16 avos | 25 | 18 | 18 | 10 | 4 | 5 |
| Oitavas | 30 | 20 | 20 | 12 | 5 | 6 |
| Quartas | 40 | 28 | 28 | 16 | 6 | 8 |
| Semi | 50 | 35 | 35 | 20 | 8 | 10 |
| 3º lugar | 65 | 45 | 45 | 25 | 9 | 12 |
| Final | 80 | 50 | 50 | 30 | 10 | 15 |

Progressão dos saltos de placar exato: `+5, +5, +10, +10, +15, +15` — cresce até chegar ao campeão.
3º lugar fica entre Semi e Final (65 entre 50 e 80). A coluna **+ Prór.+Pên.** mostra o bônus por acertar quem classificou (só mata-mata, default = ½ do `pts_resultado`).

### 6.2 Bônus de Prorrogação / Pênaltis (mata-mata)

No futebol real, o empate nos 90 minutos não define vencedor — a partida vai para prorrogação (30 min) e, se necessário, pênaltis. O bolão reflete essa realidade com um bônus:

- O usuário palpite o placar dos **90 minutos** e pontua normalmente (exato, empate, res+gol, etc.) — as regras dos grupos continuam valendo.
- **Adicionalmente**, em jogos de mata-mata, o usuário marca **qual time acha que avança** (`palpite_classificado_id`).
- Se o jogo terminar empatado nos 90 min **E** o admin marcar `classificado_id` (prorrogação/pênaltis aconteceram), o usuário ganha um bônus de `pts_classificado` **se acertou quem avançou**.
- Se o jogo foi decidido nos 90 min, o bônus **não se aplica** (mesmo que o usuário tenha marcado um palpite de classificado).

**Exemplo (quartas):** placar 1×1 (empate, 28 pts) + quem classifica: Brasil (correto, +8 pts) = **36 pts**. Se tivesse palpitado 1×1 exato (40 pts) + Brasil avança (+8 pts) = **48 pts**.

**Função:** `services/pontuacao.js::calcularPontosMataMata(jogo, palpiteCasa, palpiteVisitante, palpiteClassificadoId, pts)`. Soma `placarBase + bonus` onde `bonus = (houveEmpateNos90 && jogo.classificado_id && palpiteClassificadoId === jogo.classificado_id) ? pts_classificado : 0`.

### 6.3 Pontuação dos Palpites Extras

A pontuação é fixa por categoria, conforme tabela na seção 5.4. Os pontos são somados ao total do ranking via subquery na consulta de ranking.

---

## 7. Regras de Negócio

1. **Admin não participa** — Usuários com `is_admin = 1` são redirecionados para `/admin` ao tentar acessar `/palpites` ou `/palpites-extras` (com mensagem flash). São excluídos do ranking.

2. **Bloqueio de 2 minutos** — Cada palpite de jogo é bloqueado 2 minutos antes do horário do jogo (horário de Brasília). A verificação é feita por jogo individualmente.

3. **Jogos finalizados são imutáveis** — Se `finalizado = 1`, o palpite é bloqueado independentemente do horário.

4. **Mata-mata disponível para palpites** — Todas as fases (grupos e mata-mata) estão disponíveis. Confrontos de mata-mata só aparecem após o admin gerar os confrontos (preencher `selecao_casa_id` e `selecao_visitante_id`). Jogos com times nulos são ocultados dos palpites.

5. **Recálculo automático** — Ao salvar resultado com `finalizado = 1`, todos os palpites daquele jogo são recalculados. Se desfinalizado, pontos zeram.

6. **Upsert de palpites** — INSERT se não existe palpite para o par (usuário, jogo); UPDATE se já existe.

7. **Validação de placar** — Gols limitados a 0–99. Valores vazios ou não numéricos são ignorados.

8. **Senha mínima** — 4 caracteres (cadastro e redefinição).

9. **Token de recuperação** — Expira em 1 hora; uso único. Sem SMTP, link é exibido na tela.

10. **Cadastro aberto** — Qualquer pessoa pode criar conta, sem necessidade de código de convite. O cadastro é bloqueado automaticamente após o fechamento dos palpites extras.

11. **Login flexível** — Aceita email, username ou nome (display name) no campo de login.

12. **Sincronização de username** — Preenchido automaticamente a partir do prefixo do email (via migration). Atualizado quando o nome é alterado em `/config`.

13. **Salvamento individual** — Cada jogo na página de palpites possui seu próprio formulário e botão "Salvar" (não há salvamento em lote).

14. **Trust proxy** — `app.set('trust proxy', 1)` é essencial para o cookie de sessão funcionar atrás do proxy HTTPS do Render.

15. **Horário BRT** — Todos os horários armazenados com offset -03:00. O PostgreSQL (`TIMESTAMPTZ`) normaliza para UTC internamente.

16. **Pontos bônus** — Para evitar vantagem ou desvantagem excessiva, participantes que ingressarem após o início da competição iniciam com pontuação igual à do último colocado da rodada de ingresso, reduzida em 1 ponto. Após o encerramento dos palpites extras, não serão aceitas novas inscrições. Os bônus são armazenados na tabela `pontos_bonus` com motivo e podem ser removidos individualmente pelo admin.

17. **Extras deadline configurável** — O prazo para palpites extras é armazenado na tabela `config` (chave `extras_data_limite`) e verificado no servidor.

18. **Pontuação por fase configurável** — O admin pode definir a pontuação de cada fase em `/admin/pontuacao-fases`. A função `calcularPontos` lê os valores da tabela `fase_pontuacao`.

19. **Aproveitamento percentual** — O ranking e o perfil do usuário exibem o aproveitamento (pontos do participante / total de pontos disputados × 100).

20. **Resultados dos extras no ranking** — Os pontos dos palpites extras só aparecem no ranking após o admin definir os resultados em `/admin/extras`.

---

## 8. Deploy

### 8.1 Plataforma

| Componente | Serviço |
|---|---|
| **Web server** | Render (Node.js) — serviço `bolao_copa_2026` |
| **Banco de dados** | Neon (PostgreSQL 16, free tier) |
| **Repositório** | GitHub (`main` → auto-deploy no Render) |

### 8.2 render.yaml (Blueprint)

O arquivo `render.yaml` define o blueprint original do Render. Atualmente o serviço em uso (`bolao_copa_2026`) foi criado manualmente e usa `DATABASE_URL` do Neon, não do banco gerado pelo blueprint.

```yaml
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
        sync: false  # configurada manualmente com a connection string do Neon
```

- `DATABASE_URL` é configurada manualmente no dashboard do Render com a connection string do Neon.
- `ADMIN_EMAIL` e `ADMIN_SENHA` devem ser configurados manualmente no dashboard do Render.
- URL de produção: `https://bolao-copa-2026-zjoi.onrender.com`.

### 8.3 Script de Setup (`database/setup.js`)

Executado em todo deploy (`node database/setup.js && node server.js`):
1. Cria as tabelas (schema) se não existirem.
2. Verifica se há dados; se vazio, executa o seed (48 seleções, 12 grupos, 104 jogos).
3. Atualiza horários dos 72 jogos da fase de grupos.
4. Atualiza horários dos 32 jogos do mata-mata.
5. Corrige times trocados dos jogos 29 e 30.
6. Se `ADMIN_EMAIL` e `ADMIN_SENHA` estiverem definidas, cria ou atualiza o administrador automaticamente.

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
| `DIAGNOSTIC_KEY` | Não | Chave para diagnosticar estado do banco (opcional) |
| `SMTP_HOST` | Não | Servidor SMTP para envio de e-mails |
| `SMTP_PORT` | Não | Porta SMTP (default: 587) |
| `SMTP_USER` | Não | Usuário SMTP |
| `SMTP_PASS` | Não | Senha SMTP |
| `SMTP_FROM` | Não | Remetente dos e-mails |
| `PLANO_AUTO_API_KEY` | Não | Chave da API 26worldcup.cn para placar automático (fallback para chave hardcoded) |

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
│   ├── db.js                         # Adaptador dual SQLite/PostgreSQL (run, get, all); força TZ=UTC
│   ├── session-store.js              # Persistência de sessão no banco (evita perda ao reiniciar)
│   ├── schema.js                     # Criação das tabelas com sintaxe condicional + migrações
│   ├── seed.js                       # Popula 12 grupos, 48 seleções, 104 jogos e 16 estádios
│   ├── setup.js                      # Setup automático: schema + seed + mata-mata + admin via env vars
│   └── criar-admin.js                # Script interativo para criar administrador
│
├── routes/
│   ├── auth.js                       # Cadastro, login, logout
│   ├── dashboard.js                  # Painel com estatísticas, pontuação por fase, top 5
│   ├── palpites.js                   # Palpites da fase de grupos (salvamento individual)
│   ├── extras.js                     # Palpites extras (campeão, vice, fases)
│   ├── resumo.js                     # Estatísticas detalhadas, racha, histórico
│   ├── config.js                     # Configurações do perfil (nome)
│   ├── classificacao.js             # Classificação dos 12 grupos
│   ├── jogos.js                      # Listagem pública de jogos
│   ├── ranking.js                    # Ranking geral
│   ├── senha.js                      # Recuperação de senha
│   └── admin.js                      # Painel admin: resultados, recalcular, usuários, bônus, pontuação por fase, extras, config
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
│   ├── palpites.ejs                  # Palpites de todas as fases (grupos + mata-mata)
│   ├── palpites-extras.ejs           # Palpites extras
│   ├── palpites-usuario.ejs          # Detalhamento dos palpites de um participante
│   ├── jogos.ejs                     # Tabela de jogos pública
│   ├── jogos-palpites.ejs            # Palpites públicos de um jogo (3 níveis)
│   ├── classificacao.ejs             # Grupos e classificação
│   ├── ranking.ejs                   # Ranking geral
│   ├── resumo.ejs                    # Estatísticas detalhadas
│   ├── config.ejs                    # Configurações do perfil
│   ├── admin.ejs                     # Painel admin
│   ├── admin-jogos.ejs               # Admin: editar resultados
│   ├── admin-usuarios.ejs            # Admin: gerenciar participantes
│   ├── admin-extras.ejs              # Admin: definir resultados extras
│   ├── admin-pontuacao-fases.ejs    # Admin: configurar pontuação por fase
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
│   ├── verificar-horarios.js         # Script utilitário para verificar horários dos jogos
│   ├── daily-snapshot.js             # Backup completo (todas as tabelas) com rotação automática
│   ├── fix-palpites-futuro.js        # Espelha Render→Neon preservando jogos finalizados
│   ├── import-render-dump.js         # Import full do dump Render para outro banco
│   └── import-palpites-only.js       # Import focado só em palpites e palpites_extras
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

- **Render free tier**: O serviço web hiberna após 15 minutos de inatividade. A primeira requisição após o período de inatividade pode levar alguns segundos (cold start). O banco (Neon) também escala a zero após 5 minutos, mas a reconexão é transparente.
- **Timezone — TZ=UTC no db.js**: O Render roda com TZ=America/Sao_Paulo. O driver node-pg, por padrão, parseia TIMESTAMPTZ usando o fuso local do processo — isso adiciona +3h ao Date retornado. Para corrigir, `process.env.TZ = 'UTC'` é forçado antes do `require('pg')` em `database/db.js`. Com TZ=UTC, o parse devolve o timestamp UTC correto, e as views convertem para BRT com `toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })`.
- **Timezone — Armazenamento**: Todas as datas de jogos são armazenadas como TIMESTAMPTZ no PostgreSQL (ou DATETIME no SQLite). O seed usa timestamps em UTC. As views convertem para BRT no front-end.
- **Segurança de sessão**: `sameSite: 'lax'` e `secure: true` em produção. O trust proxy é ativado com `app.set('trust proxy', 1)` para que o Express confie no header `X-Forwarded-Proto` enviado pelo proxy do Render.
- **Índices**: A constraint UNIQUE em `palpites(usuario_id, jogo_id)` atua como índice para consultas de ranking e recálculo.
- **Ordenação de jogos**: A view `/jogos` ordena por `j.data, j.id` (não por `j.id`) para garantir que mata-mata apareçam em ordem cronológica.
- **Rota de diagnóstico**: `/jogos/db-info` expõe o host da DATABASE_URL, um marcador da tabela `config` (`db_marker`) e contagens de registros, permitindo confirmar visualmente qual banco está conectado. Útil após migrações. O marcador é exibido também no rodapé do site (opacity 0.5) para que o usuário/admin saiba em qual banco está em cada momento.
- **Health check `/healthz`**: endpoint público que retorna JSON com status, uptime, latência do banco, marcador e contagens. Cache de 30s em memória para reduzir carga (1315ms → 219ms medido, 6x mais rápido). Rate limit 60 req/min por IP. Retorna 503 se banco offline (sem cache, para Render detectar imediatamente).
- **PWA (Progressive Web App)**: `public/manifest.json` + `public/sw.js` (service worker). Estratégia híbrida — assets estáticos cache-first, HTML network-first, APIs/login/admin nunca cacheia. Instalável no celular como app nativo (⚽ verde Brasil). Atalhos para Palpites/Ranking/Jogos. Service worker pula `/healthz` e `/jogos/db-info`.
- **Sentry (opcional)**: se `NODE_ENV=production` E `SENTRY_DSN` estiver setado, inicializa com `tracesSampleRate: 0.1` e middleware de request/error handlers. Filtra `/healthz`, `/favicon` e `/admin`. Zero overhead em dev local.
- **Content-Security-Policy**: middleware seta CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Defesa em profundidade contra XSS e clickjacking. Permite inline (EJS usa) e `flagcdn.com` para bandeiras.
- **Logs estruturados**: `logger.js` emite JSON para stdout (Render indexa). Substitui `console.log/error/warn` por `logger.info/warn/error/debug`. Permite buscas por `level`, `msg`, campos customizados.
- **Toast/snackbar**: `public/js/toast.js` expõe `window.toast(msg, tipo, duracao)`. Substitui `alert()` por notificações modernas com ícones (success/error/warning/info), cor por tipo, posição canto-inferior-central, some sozinho. Usado em `salvarIndividual`, `salvarGrupo` e outros pontos com mensagem de erro/sucesso.
- **Confirmação de exclusão**: em `/admin/usuarios`, modal exige digitar o nome do usuário para habilitar o botão Excluir (substitui `confirm()` de 1-clique). Enter confirma, Esc cancela.
- **Layout mobile**: o card de palpite usa `grid-template-columns: minmax(80px, 1fr) auto minmax(80px, 1fr)` em todos os tamanhos, garantindo que nomes de times nunca somem. Em < 480px, fontes e bandeiras são reduzidas; em landscape em celular (max-height:500px), nav é comprimida e o subtítulo do logo é escondido.
- **Tratamento de erros no front-end**: `salvarIndividual` e `salvarGrupo` em `views/palpites.ejs` validam placar antes de enviar, mostram toast em caso de erro (não silenciosamente), preservam o que o usuário digitou e re-habilitam o botão. CSRF inválido retorna 403 com flash "Sessão expirada" em vez de reload silencioso.
- **Scripts de manutenção**: `scripts/daily-snapshot.js` faz backup completo com rotação (últimos 30 snapshots em `data/snapshots/`). `scripts/fix-palpites-futuro.js` corrige palpites em outro banco preservando os jogos finalizados. `scripts/import-render-dump.js` faz import full do dump. `scripts/import-palpites-only.js` faz import focado em palpites.

---

## 12. Referências

- **FIFA — Jogos e Resultados** ([fifa.com](https://www.fifa.com/pt/tournaments/mens/worldcup/canadamexicousa2026/scores-fixtures?country=BR&wtw-filter=451)) — site oficial da Copa 2026 com todos os horários em BRT, resultados ao vivo e confrontos confirmados. Fonte primária para validação de dados.
