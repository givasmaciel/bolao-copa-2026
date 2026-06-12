# ⚽ Bolão da Copa do Mundo 2026

Aplicação full-stack em português do Brasil para bolão de palpites da Copa 2026.  
Deploy automático no Render (free tier) via Blueprint com PostgreSQL. Localmente usa SQLite.

## Funcionalidades

- **Login por email, username ou nome** — qualquer um dos três é aceito
- **Cadastro aberto** — qualquer pessoa pode criar conta sem código de convite
- **Palpites por jogo (save individual)** — cada jogo tem seu próprio botão de salvar; trava 2 minutos antes do horário BRT de cada partida
- **Palpites Extras** — campeão, vice, 3º, finalistas, semis, quartas, oitavas, 1/16 avos; salvamento por categoria com contador de seleções ao vivo
- **Dashboard** (`/dashboard`) — cards de estatísticas, próximos 5 jogos, palpites pendentes, top 5 do ranking, banner de alerta com contagem regressiva em BRT, notificação de palpites extras pendentes
- **Resumo** (`/resumo`) — estatísticas detalhadas por tipo de ponto, pontos por rodada, racha (comparação head-to-head) com qualquer participante, histórico de jogos finalizados
- **Visualização pública de palpites** (`/jogos/:id/palpites`) — 3 níveis de visibilidade: 🔒 oculto antes do fechamento, 👀 visível sem pontos após fechar, visível com pontos após resultado; agrupamento por pontuação; destaca o palpite do visitante
- **Config** (`/config`) — participante altera próprio nome (sincronizado com username) e visualiza seu código de convite
- **Admin como juiz** — não participa, não aparece no ranking, redirecionado de `/palpites`
- **Pontos bônus** — admin pode conceder pontos extras a participantes que entraram tarde, para não perderem a motivação
- **Rotas administrativas** — resultados dos jogos, recalcular pontos, gerenciar usuários (promover/rebaixar/excluir/resetar senha, resetar palpites individual/massa, alterar username, criar participante), admin extras, admin config
- **Recuperação de senha** — token por email (SMTP opcional; fallback exibe link na tela)
- **Ranking** — inclui pontos extras via subquery; desempate por mais palpites com pontos > 0; exclui admins

## Pontuação — Jogos

| Acerto | Pontos |
|---|---|
| Placar exato | **20** |
| Resultado certo + 1 gol de um time | **14** |
| Empate (qualquer placar) | **14** |
| Só resultado (vitória/derrota) | **8** |
| Errou resultado + acertou 1 gol | **3** |
| Errou tudo | **0** |

## Pontuação — Extras

| Categoria | Pontos | Máx. seleções |
|---|---|---|
| Campeão | 200 | 1 |
| Vice-campeão | 150 | 1 |
| Terceiro lugar | 100 | 1 |
| Finalista | 50 | 2 |
| Semifinal | 30 | 4 |
| Quartas | 15 | 8 |
| Oitavas | 10 | 16 |
| 1/16 avos | 5 | 32 |

Prazo dos palpites extras configurável via tabela `config` (chave `extras_data_limite`).

**Regras:**
- Categorias são **independentes** — não há hierarquia entre fases. O participante pode eleger um Campeão sem tê-lo colocado como Finalista, por exemplo.
- **Salvamento individual** por categoria (botão próprio) ou **salvamento em lote** ("Salvar todos").
- **Contador ao vivo** com barra de progresso, preview de pontuação máxima, indicador de alterações não salvas (borda tracejada).
- **Busca por time**, selecionar todos / limpar, bandeiras e sigla visíveis em cada opção.
- Após o prazo, página exibe os palpites de todos os participantes agrupados por seleção.

## Tecnologias

- Node.js 18+, Express 4.21, EJS 3.1
- SQLite 5 (dev) / PostgreSQL 16 (produção)
- bcryptjs, express-session, connect-flash, nodemailer
- CSS puro responsivo (verde/amarelo/azul)
- Bandeiras via flagcdn.com

## Rodar local

```bash
npm install
npm run seed          # 12 grupos, 48 seleções, 104 jogos (horários BRT -03:00)
npm run criar-admin   # cria administrador manualmente
npm start             # http://localhost:3000
```

## Deploy no Render

1. Push do código para o GitHub
2. Render → New Blueprint → apontar para o repositório
3. `render.yaml` cria PostgreSQL + web service automaticamente
4. Configurar variáveis: `ADMIN_EMAIL`, `ADMIN_SENHA`, `SESSION_SECRET`
5. Auto-deploy ativado em todo `git push`

## Variáveis de ambiente

`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA`, `BASE_URL`, `DIAGNOSTIC_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

## Estrutura do projeto

```
database/
  db.js          — adaptador dual SQLite/PostgreSQL (conversão ? para $N)
  session-store.js — persistência de sessão no banco (evita perda ao reiniciar)
  schema.js      — CREATE TABLE com sintaxe condicional + migrações
  seed.js        — grupos, seleções e 104 jogos em BRT
  setup.js       — schema + seed + admin via env vars (executado no deploy)
  criar-admin.js — script manual de criação de admin

routes/
  auth.js        — cadastro (com invite code), login (email/username/nome), logout
  palpites.js    — palpites por jogo, trava 2 min antes, exclusão de admin
  extras.js      — palpites extras independentes, save individual e em lote, revelação pós-prazo
  dashboard.js   — cards, próximos jogos, top 5, banner com contagem regressiva
  resumo.js      — stats detalhadas, pontos por rodada, racha, histórico
  config.js      — alterar nome (sincroniza com username), exibir convite
  jogos.js       — listagem pública dos 104 jogos
  ranking.js     — ranking com pontos extras, desempate, exclui admins
  senha.js       — reset de senha com token + email
  admin.js       — resultados, recalcular, usuários, criar participante, extras, config

middleware/
  auth.js        — verificarAutenticado, verificarAdmin, jaLogado

views/
  partials/      — header.ejs (nav), footer.ejs, flash.ejs
  home.ejs       — landing page com regras
  login.ejs      — formulário de login (email/username/nome)
  cadastro.ejs   — cadastro com campo de código de convite
  dashboard.ejs  — painel do participante
  palpites.ejs   — formulários por jogo com botão salvar individual
  palpites-extras.ejs — formulários por categoria com grid, busca, bandeiras, progresso, preview pts
  jogos-palpites.ejs — palpites públicos de um jogo (3 níveis, agrupado por pontos)
  palpites-usuario.ejs — detalhe dos palpites de um participante
  jogos.ejs      — tabela de jogos públicas
  ranking.ejs    — ranking com posições
  resumo.ejs     — estatísticas, rodadas, racha, histórico
  config.ejs     — alterar nome + exibir convite
  admin.ejs, admin-jogos.ejs, admin-usuarios.ejs, admin-extras.ejs
  esqueci-senha.ejs, redefinir-senha.ejs
  404.ejs, 500.ejs

raiz/
  server.js      — entry point (trust proxy, session, rotas)
  render.yaml    — Blueprint do Render
  .env.example, .node-version, package.json
```

## Regras de negócio

- Admin (is_admin=1) redirecionado de `/palpites` e `/palpites-extras` com flash
- Palpites travam 2 min antes do horário BRT de cada jogo (frontend + backend)
- Pontuação automática ao admin marcar jogo como finalizado; botão de recalcular disponível
- Admin pode recalcular pontos, resetar palpites (individual/massa), resetar senha, promover/rebaixar, excluir usuários
- Cadastro aberto — qualquer pessoa pode criar conta livremente
- Desempate no ranking: quem tem mais palpites com pontos > 0
- Trust proxy: `app.set('trust proxy', 1)` para sessão funcionar atrás do proxy HTTPS do Render
- Sessão: cookie-based, secure em produção, sameSite lax, 30 dias
- Todos os horários armazenados em BRT (-03:00)
