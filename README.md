# ⚽ Bolão da Copa do Mundo 2026

Aplicação full-stack em português do Brasil para bolão de palpites da Copa 2026.  
Deploy no Render (Node.js) com **Postgres no Neon** (free tier permanente). Localmente usa SQLite. Render Postgres foi descontinuado em 28/06/2026 — veja [`docs/MIGRACAO_RENDER_NEON.md`](docs/MIGRACAO_RENDER_NEON.md) para o histórico da migração.

## Funcionalidades

- **Login por email, username ou nome** — qualquer um dos três é aceito
- **Cadastro aberto** — qualquer pessoa pode criar conta sem código de convite
- **Palpites em todas as fases** — grupos e mata-mata (r32, r16, qf, sf, terceiro, final); salvamento individual ou em lote por agrupamento; trava 2 minutos antes do horário BRT; **cards compactos** em grid 3 colunas (casa | placar | visitante) com metadata consolidada em um footer único (data, estádio, palpites, countdown)
- **Progress bar de palpites** — card verde no topo de `/palpites` mostrando "X/Y jogos (NN%)" + barra de progresso com gradiente; mensagem contextual "Faltam Y palpites" ou "🎉 Você palpitou em todos!"
- **Palpites salvos agrupados por fase** — card expansível com header por fase (ex.: "Fase de Grupos - Rodada 1", "16 avos de Final") + badge de progresso (feitos/total); primeiros 3 palpites visíveis com ✔; botão "Ver mais N" expande o resto (seção inicia **colapsada** por padrão)
- **Palpites Extras** — campeão, vice, 3º, finalistas, semis, quartas, oitavas, 1/16 avos; salvamento por categoria com contador de seleções ao vivo
- **Dashboard** (`/dashboard`) — cards de estatísticas, próximos 5 jogos, palpites pendentes, top 5 do ranking, **banner do próximo jogo com 3 estados visuais** (fechado/urgente≤2h com animação pulse + gradiente amarelo→laranja / aberto em amarelo), notificação de palpites extras pendentes
- **Resumo** (`/resumo`) — estatísticas detalhadas por tipo de ponto, pontos por rodada, racha (comparação head-to-head) com qualquer participante, histórico de jogos finalizados
- **Visualização pública de palpites** (`/jogos/:id/palpites`) — 3 níveis de visibilidade: 🔒 oculto antes do fechamento, 👀 visível sem pontos após fechar, visível com pontos após resultado; agrupamento por pontuação; destaca o palpite do visitante. Em mata-mata, coluna **"Classificado"** mostra em quem cada um apostou para avançar
- **Config** (`/config`) — participante altera próprio nome (sincronizado com username)
- **Admin** — gerencia o site via `/admin/*` (jogos, usuários, extras, bônus, mata-mata, horários, pontuação por fase). Pode apostar em `/palpites` e `/palpites-extras` se quiser **e participa normalmente do ranking** — seus palpites contam como qualquer outro participante.
- **Admin: editar horário/estádio** — botão "🕐 Horário/Estádio" em `/admin/jogos` para corrigir data/hora, estádio, cidade e país de qualquer jogo sem precisar de deploy
- **Placar automático** — busca resultados reais da API worldcup26.ir (open-source) a cada 16 minutos; atualiza placar e recalcula pontos automaticamente para **todas as fases** (grupos + mata-mata). No mata-mata decidido nos 90 min, **finaliza automaticamente** com `classificado_id` e **avança o vencedor para a próxima fase** (`avancarVencedor`). Se empate nos 90 min, só grava o placar — admin adiciona prorrogação/pênaltis manualmente. Acionável manualmente pelo admin em `/admin/placar-automatico`
- **Pontos bônus** — participantes tardios recebem pontuação do último colocado -1 da rodada de ingresso; cadastro encerra após fechamento dos extras; tooltip no ranking mostra motivo
- **Rotas administrativas** — resultados dos jogos, recalcular pontos, gerenciar usuários (promover/rebaixar/excluir/resetar senha, resetar palpites individual/massa, alterar username, criar participante), admin extras, admin config
- **Rota de diagnóstico** — `/jogos/db-info` retorna JSON com `host`, `marcador` (do `db_marker` da tabela `config`), contagens (`usuarios`, `jogos`, `palpites`, `jogos_finalizados`) e timestamp
- **Indicador de banco** — `db_marker` lido no boot é exibido discretamente no rodapé (ex.: "🗄️ DB: neon-producao-2026-06-28"), evitando confusão quando há mais de um banco em uso (Neon prod, Render mirror, dev local)
- **Tratamento de erros sem reload silencioso** — `salvarIndividual` e `salvarGrupo` validam placar antes de enviar, mostram mensagem detalhada em caso de erro HTTP, mantêm o placar que o usuário digitou e re-habilitam o botão
- **Mata-mata com alerta de classificado** — ao salvar palpite de mata-mata com placar empatado e sem time classificado, o sistema exibe um `confirm()` para "Salvar todos" e `confirm()` no salvamento individual; o servidor também emite um flash `aviso` para o usuário; o bônus de classificado não é perdido **se o usuário marcar o rádio manualmente**. "Preencher todos" também aciona o auto-preenchimento do classificado baseado no placar (time com mais gols é pré-selecionado).
- **PWA (Progressive Web App)** — manifest.json + service worker (cache offline de assets estáticos, network-first para HTML), atalhos para Palpites/Ranking/Jogos, instalável no celular como app nativo
- **Health check `/healthz`** — endpoint público que verifica conexão com banco, retorna uptime, latência, marcador e contagens. Retorna 503 se banco offline. Útil para monitoramento do Render e debugging.
- **Sentry (opcional)** — se `SENTRY_DSN` estiver definido em produção, errors vão automaticamente para o painel do Sentry com contexto da request. `tracesSampleRate=0.1`. Filtra `/healthz`, `/favicon` e `/admin` para evitar ruído.
- **Toast/snackbar** — substitui `alert()` por notificações modernas (canto inferior, somem sozinhas, com ícones e cores por tipo). Mobile UX muito melhor
- **Confirmação de exclusão** — admin precisa digitar o nome do usuário para excluir (modal). Protege contra cliques acidentais que apagariam participantes
- **Logs estruturados** — `logger.js` emite JSON para stdout (Render indexa). Busca por `level:error`, `msg:palpites`, etc.
- **Content-Security-Policy** — header CSP restringe scripts/estilos a origens confiáveis, mais `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`. Defesa contra XSS
- **Recuperação de senha** — token por email (SMTP opcional; fallback exibe link na tela)
- **Ranking** — inclui pontos extras via subquery; exclui admins; desempate hierárquico em 8 níveis (total pontos → placares exatos → resultado+gol → só resultado → gols certos → 1 gol certo → palpites pontuados → nome alfabético); card de regras no topo com tabela `Critério / Pontos / O que conta`; colunas: `Palpites` (total dinâmico de palpites feitos pelo participante, cresce com novos palpites), `🎯 Qualidade dos acertos` (6 sub-colunas: Exatos, Res+Gol, Só Res, 1 Gol, Gols, Pont.) seguindo a cascata do SQL, `Média`, `Aproveit.`, `Pontos`; barra visual proporcional ao líder no total; banner com 🏆 Líder + ✅ Mais palpites pontuados + 🎯 Mais placares exatos + 📊 Média geral
- **Perfil do participante** — cards horizontais compactos (Palpites, Acertos, Pontos, Aproveit., Média/palpite, Pts disp.); palpites por rodada com resultado real × palpite × pontos

## Pontuação — Jogos

Os pontos aumentam conforme a fase avança (configurável pelo admin em `/admin/pontuacao-fases`).

| Fase | Placar exato | Empate | Resultado + 1 gol | Só resultado | 1 gol certo | + Prór.+Pên. |
|---|---|---|---|---|---|---|
| Grupos | 20 | 14 | 14 | 8 | 3 | — |
| 16 avos | 25 | 18 | 18 | 10 | 4 | 5 |
| Oitavas | 30 | 20 | 20 | 12 | 5 | 6 |
| Quartas | 40 | 28 | 28 | 16 | 6 | 8 |
| Semi | 50 | 35 | 35 | 20 | 8 | 10 |
| 3º lugar | 65 | 45 | 45 | 25 | 9 | 12 |
| Final | 80 | 50 | 50 | 30 | 10 | 15 |

Progressão dos saltos de placar exato: `+5, +5, +10, +10, +15, +15` — cresce até chegar ao campeão.
3º lugar fica entre Semi e Final, mantendo a lógica anterior de aumento fase a fase.

A coluna **+ Prór.+Pên.** é o bônus por acertar **quem classificou** na prorrogação/pênaltis (só mata-mata). Vale a metade do "Só resultado" da fase, é calculado automaticamente como `Math.floor(pts_resultado / 2)` e **só se aplica quando os 90 min terminaram empatados**. Se o jogo for decidido nos 90 min, o bônus não se aplica — mesmo que o usuário tenha marcado um palpite de classificado.

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
- SQLite 5 (dev) / PostgreSQL 16 no **Neon** (produção, free tier permanente — `us-west-2.aws.neon.tech`)
- bcryptjs, express-session, connect-flash, nodemailer
- @sentry/node (produção), express-rate-limit (healthz), Sentry error tracking
- CSS puro responsivo (verde/amarelo/azul)
- Bandeiras via flagcdn.com

## Segurança

- **CSRF token** validado em todos os POST/PUT/PATCH/DELETE
- **CSP** (Content-Security-Policy) restritivo — bloqueia scripts/iframes externos
- **Rate limit** em `/healthz` (60 req/min/IP) e em login/cadastro/recuperação
- **SESSION_SECRET** obrigatório em produção (validação no startup; recusa valor padrão)
- **Health check proativo** em `/healthz`: detecta placar automático parado >25 min e jogos finalizados sem pontos calculados
- **Sentry** em produção (silencia ruído: `/healthz`, `/favicon`, `/admin`)

## Testes

```bash
node tests/pontuacao.test.js          # 24 testes de pontuação
node tests/comprehensive.test.js      # 12 testes: backup, placar-auto, import, comparação
npm test                              # roda ambos
```

## Rodar local

```bash
npm install
npm start             # setup + seed automático, http://localhost:3000
```

Admin local: `npm run criar-admin` (usuário: `admin@teste.com` / `admin123`)

> O `setup.js` executa automaticamente no `npm start`: cria schema, popula seed (104 jogos + mata-mata) e atualiza horários. Não precisa rodar `npm run seed` separadamente.

## Deploy

1. Push do código para o GitHub
2. Render cria web service (auto-deploy ativado)
3. Banco: **Neon** (Postgres 16 serverless, free tier permanente) — connection string configurada manualmente em Render Dashboard → Environment → `DATABASE_URL`. O `render.yaml` não provisiona mais o banco automaticamente (foi descontinuado o Render Postgres)
4. Variáveis obrigatórias: `DATABASE_URL` (Neon), `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_SENHA`

> **Status atual (28/06/2026):** Produção roda no **Neon** (host `ep-red-brook-a64zto1n-pooler.us-west-2.aws.neon.tech`, marcador `neon-producao-2026-06-28`). Render Postgres foi descontinuado — a conexão antiga (`dpg-...`) foi cortada. Veja [`docs/MIGRACAO_RENDER_NEON.md`](docs/MIGRACAO_RENDER_NEON.md) para o histórico e procedimentos de rollback.

## Variáveis de ambiente

`DATABASE_URL`, `SESSION_SECRET`, `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA`, `BASE_URL`, `DIAGNOSTIC_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SENTRY_DSN` (opcional — error tracking)

## Estrutura do projeto

```
database/
  db.js          — adaptador dual SQLite/PostgreSQL (conversão ? para $N); força TZ=UTC para evitar shift de +3h em TIMESTAMPTZ
  session-store.js — persistência de sessão no banco (evita perda ao reiniciar)
  schema.js      — CREATE TABLE com sintaxe condicional + migrações
  seed.js        — grupos, seleções e 104 jogos em BRT
  setup.js       — schema + seed + mata-mata + admin via env vars (executado em todo deploy)
  criar-admin.js — script manual de criação de admin

routes/
  auth.js        — cadastro aberto (bloqueado após prazo dos extras), login (email/username/nome), logout
  palpites.js    — palpites por jogo, trava 2 min antes, idempotência via ON CONFLICT, flash message com placar ("BRA 2×0 JAP salvo!"), valida server-side de classificado em mata-mata
  extras.js      — palpites extras independentes, save individual e em lote, revelação pós-prazo
  dashboard.js   — cards, próximos jogos, top 5 (admin entra), banner com contagem regressiva, pontuação por fase
  resumo.js      — stats detalhadas, pontos por rodada, racha, histórico
  config.js      — alterar nome (sincroniza com username)
  classificacao.js — classificação dos grupos + link oficial FIFA
  jogos.js       — listagem pública dos 104 jogos + rota /jogos/db-info para diagnóstico do banco conectado
  ranking.js     — ranking com pontos extras, desempate, admin entra normalmente
  senha.js       — reset de senha com token + email
  admin.js       — resultados, recalcular, placar automático, usuários, criar participante, extras, config, pontuação por fase, pontos bônus

services/
  classificacao.js     — cálculo de classificação dos grupos
  mata-mata.js         — lógica de geração dos confrontos eliminatórios
  palpite-config.js    — constantes de configuração de palpites (PALPITE_MARGEM_MS)
  placar-automatico.js — integração com API worldcup26.ir (busca resultados a cada 16 min, recalcula pontos, avanço automático de vencedores)
  pontuacao.js         — cálculo de pontos (grupos e mata-mata com bônus)

middleware/
  auth.js        — verificarAutenticado, verificarAdmin, jaLogado
  csp.js         — CSP e headers de segurança (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
  csrf.js        — geração e validação de token CSRF em todos os POST/PUT/PATCH/DELETE

views/
  partials/      — header.ejs (nav), footer.ejs, flash.ejs
  home.ejs       — landing page com regras
  login.ejs      — formulário de login (email/username/nome)
  cadastro.ejs   — cadastro aberto
  dashboard.ejs  — painel do participante
  palpites.ejs   — formulários por jogo com salvamento individual e botão "Salvar todos" por agrupamento
  palpites-extras.ejs — formulários por categoria com grid, busca, bandeiras, progresso, preview pts
  jogos-palpites.ejs — palpites públicos de um jogo (3 níveis, agrupado por pontos)
  jogo-palpites.ejs  — palpites de um jogo na área de palpites (mesma view)
  palpites-usuario.ejs — detalhe dos palpites de um participante
  jogos.ejs      — tabela de jogos públicas
  ranking.ejs    — ranking com posições
  resumo.ejs     — estatísticas, rodadas, racha, histórico
  config.ejs     — alterar nome
  classificacao.ejs — grupos e classificação (com link FIFA)
  admin.ejs, admin-jogos.ejs, admin-usuarios.ejs, admin-extras.ejs, admin-pontuacao-fases.ejs, admin-mata-mata.ejs, admin-placar-automatico.ejs, admin-premios.ejs, admin-link-login.ejs
  esqueci-senha.ejs, redefinir-senha.ejs
  404.ejs, 500.ejs

raiz/
  server.js      — entry point (trust proxy, session, rotas, dbMarker)
  logger.js      — logs estruturados em JSON (substitui console.log/error)
  Dockerfile     — build containerizado
  .dockerignore  — arquivos ignorados no build Docker
  .editorconfig  — padrões de editor (indentação, charset, etc.)
  .eslintrc.json — configuração de lint (ESLint)
  .prettierrc    — configuração de formatação (Prettier)
  render.yaml    — Blueprint do Render (não provisiona mais Render Postgres; DATABASE_URL manual)
  .env.example, .node-version, package.json
  .github/workflows/test.yml — CI: testes automáticos em push/PR

scripts/
  avancar-vencedores.js — avança vencedores de todas as fases mata-mata finalizadas
  check-db.js           — exibe palpites do banco
  check-jogos.js        — verifica jogos e palpites
  daily-snapshot.js     — backup de todas as tabelas com rotação (30 últimos) — Render ou Neon
  compare-dbs.js        — compara contagens entre Render e Neon (dry-run, --sync, --force)
  sync-render-to-neon.js — espelha Render → Neon (dump + comparação + import automático)
  fix-palpites-futuro.js — substitui palpites não-finalizados do Neon pelos do Render
  import-neon.js        — reimporta o espelho a partir de `data/render-dump.json`
  import-render-dump.js  — import full do dump Render para outro banco
  import-snapshot.js    — importa um snapshot JSON (Render ou Neon)
  import-palpites-only.js — import focado só em palpites e palpites_extras
  dump-db-json.js       — dump manual em JSON (legado, prefira `daily-snapshot.js`)
  promover-admin.js     — promove usuário a admin via argumento
  reset-palpites.js     — limpa palpites e resultados
  test-mata-mata-e2e.js — teste end-to-end da lógica de mata-mata
  verificar-horarios.js — verifica horários dos jogos

public/
  css/style.css    — CSS responsivo (tema verde/amarelo/azul)
  js/toast.js      — toast/snackbar (substitui alert())
  icon-192.svg     — ícone PWA 192×192
  icon-512.svg     — ícone PWA 512×512
  manifest.json    — manifesto PWA
  sw.js            — service worker

tests/
  comprehensive.test.js — testes completos (backup, placar-auto, import, etc.)
  pontuacao.test.js     — testes de pontuação

docs/
  MIGRACAO_RENDER_NEON.md — histórico da migração Render → Neon
```

## Regras de negócio

- Admin (is_admin=1) acessa `/palpites` e `/palpites-extras`, dá palpites, e **participa do ranking** normalmente — sem filtro de exclusão nas queries de ranking.
- Admin é submetido **às mesmas regras de visibilidade** dos participantes comuns: em `/jogos/:id/palpites` e `/palpites/jogo/:id` o admin só vê os palpites dos outros **após o fechamento** (🔒 antes, 👀 sem pontos após fechar, completo após resultado). Não há bypass de admin.
- Palpites travam 2 min antes do horário BRT de cada jogo (frontend + backend)
- Pontuação automática ao admin marcar jogo como finalizado; botão de recalcular disponível; placar automático via API worldcup26.ir a cada 16 min
- Admin pode recalcular pontos, resetar palpites (individual/massa), resetar senha, promover/rebaixar, excluir usuários
- Cadastro aberto — qualquer pessoa pode criar conta livremente (até o fechamento dos palpites extras)
- Admin pode conceder pontos bônus a participantes tardios (último colocado -1 da rodada de ingresso; cadastro encerra após fechamento dos extras)
- Admin pode editar data/hora e estádio de qualquer jogo via botão "🕐 Horário/Estádio" em `/admin/jogos` — útil para correções pontuais sem deploy
- Pontuação-base por fase configurável pelo admin em `/admin/pontuacao-fases`; o bônus por classificado é sempre calculado automaticamente como metade inteira de "Só resultado"
- Aproveitamento percentual exibido no ranking e perfil do usuário
- Resultados dos extras no ranking só aparecem após admin definir em `/admin/extras`
- Desempate no ranking: cascata de 8 critérios — total de pontos → placares exatos → resultado+gol → só resultado → gols certos → 1 gol certo → palpites pontuados → nome (alfabético)
- Banner do próximo jogo no dashboard: 3 estados — **fechado** (vermelho claro, "🔒 JOGO FECHADO"), **urgente** ≤ 2h (gradiente amarelo→laranja, "⚠️ PALPITE FECHANDO" em CAIXA ALTA com ícone pulsante, box-shadow amarelo) e **aberto** (amarelo claro, "⚽ PRÓXIMO JOGO")
- Cards de palpites em layout grid 3 colunas: padding reduzido, metadata (data, estádio, contagem, countdown) consolidada em footer único com border-top dashed. Em qualquer viewport (até 360px de largura), o layout se mantém **horizontal** com `grid-template-columns: minmax(80px, 1fr) auto minmax(80px, 1fr)` — nomes de times que excedem 80px quebram em 2 linhas em vez de sumir
- Touch targets mobile: inputs de placar com mínimo 44×44px, botões `btn-sm` com mínimo 36×36px, links de nav com mínimo 36×36px (Apple HIG / Material Design)
- iOS Safari: `font-size: 16px` em inputs/selects evita zoom automático ao focar
- Landscape em celular: media query `(max-height:500px) and (max-width:900px)` esconde subtítulo do logo e comprime nav para caber em altura baixa
- Trust proxy: `app.set('trust proxy', 1)` para sessão funcionar atrás do proxy HTTPS do Render
- Sessão: cookie-based, secure em produção, sameSite lax, 30 dias
- Todos os horários armazenados em BRT (-03:00)
- **TZ=UTC no db.js**: o driver node-pg parseia TIMESTAMPTZ usando o fuso local do processo. Para evitar shift de +3h (Render roda em America/Sao_Paulo), o `process.env.TZ` é forçado a 'UTC' antes do `require('pg')`. As views convertem para BRT com `toLocaleString({ timeZone: 'America/Sao_Paulo' })`.

## Observabilidade e PWA

### PWA (Progressive Web App)

O site é instalável no celular como app nativo:
- **`/manifest.json`** — nome, ícones SVG (192×192 e 512×512), atalhos para Palpites/Ranking/Jogos
- **`/sw.js`** — service worker com estratégia híbrida:
  - Assets estáticos (CSS/SVG/JS/imagens): cache-first
  - HTML/navegação: network-first com fallback pro cache
  - APIs, login, admin: nunca cacheia
- **`/icon-192.svg`** e **`/icon-512.svg`** — ícone ⚽ verde Brasil
- **Registro automático** via `<script>` no `footer.ejs`

Para usar offline no celular: abrir o site no Chrome/Safari → "Adicionar à tela inicial".

### Health check

```bash
curl https://bolao-copa-2026-zjoi.onrender.com/healthz
```

Retorna JSON:
```json
{
  "status": "ok",
  "uptime_segundos": 1234,
  "db": {
    "conectado": true,
    "marcador": "neon-producao-2026-06-28",
    "latencia_ms": 42
  },
  "contagens": { "usuarios": 11, "jogos": 104, "palpites": 717, "jogos_finalizados": 28 },
  "versao_node": "v18.x",
  "timestamp": "2026-06-28T..."
}
```

Retorna `503` se banco estiver offline (Render pode usar isso para restartar o serviço).

### Sentry (error tracking)

**Importante**: Sentry só é ativado em produção (`NODE_ENV=production`) E se `SENTRY_DSN` estiver definido. Em dev local é zero overhead.

- `tracesSampleRate: 0.1` em produção (10% das transações)
- Filtra `/healthz`, `/favicon` e `/admin` para evitar ruído
- `requestHandler` middleware captura contexto da request
- `errorHandler` middleware (após as rotas) captura erros não tratados

Para ativar:
1. Criar conta em https://sentry.io (free tier 5k eventos/mês)
2. Criar projeto Node.js
3. Copiar o DSN
4. Adicionar `SENTRY_DSN=...` nas env vars do Render

### Segurança (defesa em profundidade)

Headers HTTP setados via middleware em `server.js`:
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://flagcdn.com; ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```
- **CSP**: bloqueia scripts não autorizados (defesa contra XSS via injeção)
- **X-Frame-Options**: impede embed em iframe (defesa contra clickjacking)
- **X-Content-Type-Options**: força MIME correto
- **Referrer-Policy**: limita info de origem enviada a terceiros

### Logs estruturados (`logger.js`)

Substituiu `console.log/error` (e `console.error`) por logger que emite JSON em todas as rotas e services. Buscas úteis no Render:
```
level:error                              # todos os erros
msg:"unhandled error" AND url:/palpites   # erros específicos em palpites
level:warn AND msg:CSRF                  # tentativas CSRF inválidas
```

### Toast/snackbar (`public/js/toast.js`)

Substitui `alert()` por notificações modernas:
```javascript
toast('Palpite salvo!', 'success');          // ✅ verde, some em 4s
toast('Erro ao salvar', 'error', 6000);      // ❌ vermelho, 6s
toast('Atenção', 'warning');                 // ⚠️ amarelo
toast('Info genérica');                       // ℹ️ azul
```
Aparece canto inferior central, com botão × para fechar manualmente. Mobile UX muito melhor que `alert()` nativo.

### Confirmação de exclusão (`views/admin-usuarios.ejs`)

Modal exige **digitar o nome** do usuário para habilitar o botão Excluir. Enter confirma, Esc cancela. Substitui o antigo `confirm()` de 1-clique que podia causar exclusões acidentais.

## Scripts de manutenção

```bash
# Backup diário de todas as tabelas (Render ou Neon)
DATABASE_URL=postgresql://... node scripts/daily-snapshot.js

# Espelhar Render → Neon preservando os jogos finalizados (substitui
# apenas palpites de jogos não-finalizados pelos do Render)
DATABASE_URL=postgresql://...neon... node scripts/fix-palpites-futuro.js --dry-run
DATABASE_URL=postgresql://...neon... node scripts/fix-palpites-futuro.js

# Sincronização automática Render → Neon (dump + comparação + import).
# Lê DATABASE_URL_RENDER e DATABASE_URL_NEON do .env.
node scripts/sync-render-to-neon.js --dry-run   # só compara
node scripts/sync-render-to-neon.js --force     # sincroniza sem perguntar

# Comparar contagens Render vs Neon (sem modificar nada)
node scripts/compare-dbs.js

# Import full do dump Render para outro banco (limpa e reinsere
# usuarios, palpites, palpites_extras, resultados_extras, fase_pontuacao,
# config, pontos_bonus). NÃO mexe em jogos/selecoes/grupos.
DATABASE_URL=postgresql://...neon... node scripts/import-render-dump.js

# Import focado só em palpites e palpites_extras (clean and reinsert)
DATABASE_URL=postgresql://...neon... node scripts/import-palpites-only.js

# Importar um snapshot JSON específico (Render ou Neon)
DATABASE_URL=postgresql://... node scripts/import-snapshot.js data/snapshots/snapshot-2026-06-28-031633.json
```

> O script `sync-render-to-neon.js` requer `DATABASE_URL_RENDER` e `DATABASE_URL_NEON` no `.env` (já configurados por padrão). Os outros scripts leem apenas `DATABASE_URL` e operam sobre o banco apontado por ela.

Para agendar o `daily-snapshot.js` no Windows, criar tarefa no Task Scheduler que roda `node scripts\daily-snapshot.js` em `C:\Users\NoteFnde\Downloads\projetos\bolao` com `DATABASE_URL` configurada. Snapshots vão para `data/snapshots/snapshot-YYYY-MM-DD-HHMMSS.json` com **rotação automática** mantendo os últimos 30.

## Migração entre bancos

> ✅ **Migração Render → Neon concluída em 28/06/2026.** Produção roda no Neon. Render Postgres foi descontinuado, mas os scripts de sincronização permanecem para manter um mirror atualizado (útil para auditoria e rollback).

**Arquitetura atual:**
- **Produção:** Neon (`ep-red-brook-...pooler.us-west-2.aws.neon.tech`), marcador `neon-producao-2026-06-28`
- **Mirror (opcional):** Render Postgres (`dpg-...`), marcador `render-producao-...`. Mantido sincronizado via `sync-render-to-neon.js` — pode ser descontinuado quando não for mais útil.

**Trocar de banco (ex.: Neon → outro provedor):**
1. Dump fresco: `DATABASE_URL=<atual> node scripts/daily-snapshot.js`
2. Importar no destino: `DATABASE_URL=<novo> node scripts/import-render-dump.js` (ou `import-snapshot.js`)
3. Trocar `DATABASE_URL` no Render Dashboard → Environment
4. Verificar `/jogos/db-info` para confirmar conexão e ver contagens

Para evitar confusão quando há mais de um banco em uso, cada banco recebe um `db_marker` único na tabela `config` (chave `db_marker`), exibido no rodapé do site. Exemplo:

```sql
-- No Neon (produção atual)
INSERT INTO config (chave, valor) VALUES ('db_marker', 'neon-producao-2026-06-28');
-- No Render (mirror)
INSERT INTO config (chave, valor) VALUES ('db_marker', 'render-mirror-2026-06-28');
```
