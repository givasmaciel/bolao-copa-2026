# Migração Render Postgres → Neon

> **Quando fazer:** antes do Render Postgres expirar (~90 dias após criação). Verifique em `https://dashboard.render.com` → serviço `bolao-db` → "Info" → "Expires at".

> **Quando NÃO fazer:** durante a fase de grupos ou mata-mata com jogos finalizados chegando, para evitar inconsistências entre dumps. O ideal é migrar em janela de manutenção (madrugada).

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Criar o projeto Neon](#3-criar-o-projeto-neon)
4. [Obter a connection string](#4-obter-a-connection-string)
5. [Dump do Render Postgres atual](#5-dump-do-render-postgres-atual)
6. [Importar no Neon](#6-importar-no-neon)
7. [Atualizar `DATABASE_URL` no Render](#7-atualizar-database_url-no-render)
8. [Atualizar `db_marker` no Neon](#8-atualizar-db_marker-no-neon)
9. [Verificar migração](#9-verificar-migração)
10. [Limpeza e rollback](#10-limpeza-e-rollback)

---

## 1. Visão geral

A migração copia todos os dados do Render Postgres para um projeto Neon novo e aponta o serviço Render para o Neon. Não há downtime significativo — apenas alguns segundos enquanto o Render faz redeploy.

**Dados copiados** (10 tabelas):
- `usuarios`, `grupos`, `selecoes`, `jogos` (dados-base + 104 jogos)
- `palpites`, `palpites_extras`, `resultados_extras` (palpites + extras)
- `fase_pontuacao`, `config`, `pontos_bonus` (configurações + bônus)

**Não copiado** (re-criado automaticamente pelo `setup.js`):
- Nada — todas as tabelas estão no dump.

---

## 2. Pré-requisitos

- Acesso ao dashboard do Render: https://dashboard.render.com
- Acesso ao GitHub (para forçar redeploy se necessário)
- Node.js 18+ instalado localmente
- Acesso ao Neon: criar conta em https://console.neon.tech (pode logar com GitHub)

---

## 3. Criar o projeto Neon

1. Acesse https://console.neon.tech e faça login
2. Clique em **"Create Project"**
3. Configurações:
   - **Name:** `bolao-copa-2026`
   - **Region:** `AWS / US East (Ohio)` ou `US West (Oregon)` — escolha o mesmo do Render para menor latência (Render Oregon)
   - **Postgres version:** 16 (igual ao Render)
   - **Plan:** Free
4. Clique em **"Create Project"**

> ⚠️ **Atenção:** o plano Free do Neon tem limite de armazenamento de 0.5 GB e "scale to zero" (para após 5 min de inatividade, reconexão em ~1s).

---

## 4. Obter a connection string

1. No painel do projeto Neon, clique em **"Connection Details"** (ou "Dashboard")
2. Selecione o **branch** `main` e o **database** `neondb` (default)
3. Copie a **Connection string** — algo como:
   ```
   postgresql://neondb_owner:XXXXXXXXXXXX@ep-xxxxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
4. **Salve essa string em local seguro** (password manager). Vai ser usada em vários passos.

> O Neon **exige SSL** (`?sslmode=require`). O `db.js` do projeto já está configurado para isso (não precisa mudar código).

---

## 5. Dump do Render Postgres atual

Em **sua máquina local**, no diretório do projeto:

### Opção A — Script `daily-snapshot.js` (recomendado)

```bash
# 1. Pegue a DATABASE_URL do Render Postgres atual
#    Render dashboard → bolao-db → "Info" → "Connections" → "External Connection String"
#    Exemplo: postgresql://bolao_user:XXXX@dpg-d8k9g01kh4rs73bbrbpg-a.oregon-postgres.render.com/bolao_db_xxxx

# 2. Rode o snapshot:
DATABASE_URL="postgresql://bolao_user:XXXX@dpg-...render.com/bolao_db_xxxx" \
  node scripts/daily-snapshot.js
```

Isso gera `data/snapshots/snapshot-YYYY-MM-DD-HHMMSS.json`.

### Opção B — `dump-db-json.js` (legado, mesmo efeito)

```bash
DATABASE_URL="postgresql://..." node scripts/dump-db-json.js
# gera data/render-dump.json (formato do import-render-dump.js)
```

### Conferindo o dump

```bash
# Veja quantas linhas em cada tabela
node -e "
const d = require('./data/snapshots/snapshot-XXXX.json');
for (const t of Object.keys(d.dados)) {
  console.log(t.padEnd(25), d.dados[t].length);
}
"
```

Saída esperada (jun/2026):
```
usuarios                  11
grupos                    12
selecoes                  48
jogos                    104
palpites                 505
palpites_extras          ...
resultados_extras        ...
fase_pontuacao            7
config                   ...
pontos_bonus             ...
```

---

## 6. Importar no Neon

### Opção A — `import-render-dump.js` (recomendado se usou Opção B no passo 5)

```bash
DATABASE_URL="postgresql://neondb_owner:XXXX@ep-xxx.aws.neon.tech/neondb?sslmode=require" \
  node scripts/import-render-dump.js
```

> ⚠️ Esse script **limpa as tabelas antes de inserir**. Como o Neon está vazio, isso é seguro.

### Opção B — Importar do snapshot JSON (se usou Opção A no passo 5)

Crie um pequeno script de import do snapshot. Exemplo:

```javascript
// scripts/import-snapshot.js (a criar)
const fs = require('fs');
const path = require('path');
const { run } = require('../database/db');

const SNAP = process.argv[2];
if (!SNAP) { console.error('uso: node scripts/import-snapshot.js <path-snapshot>'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const TABELAS = ['usuarios', 'grupos', 'selecoes', 'jogos', 'palpites', 'palpites_extras', 'resultados_extras', 'fase_pontuacao', 'config', 'pontos_bonus'];

(async () => {
  for (const tabela of TABELAS) {
    const linhas = data.dados[tabela] || [];
    if (linhas.length === 0) { console.log(`${tabela}: 0 linhas, pulando`); continue; }
    await run(`DELETE FROM ${tabela}`);
    const cols = Object.keys(linhas[0]);
    const placeholders = cols.map(() => '?').join(',');
    let count = 0;
    for (const row of linhas) {
      const values = cols.map(c => row[c] === undefined ? null : row[c]);
      await run(`INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${placeholders})`, values);
      count++;
    }
    console.log(`${tabela}: ${count} linhas importadas`);
  }
})().catch(e => { console.error(e); process.exit(1); });
```

> Se preferir, posso adicionar esse script ao repositório em outra oportunidade.

---

## 7. Atualizar `DATABASE_URL` no Render

1. Acesse https://dashboard.render.com → serviço **`bolao_copa_2026`**
2. Vá em **"Environment"** no menu lateral
3. Localize a variável `DATABASE_URL` (atualmente aponta para `dpg-...`)
4. Clique em **"Edit"** ao lado da variável
5. Substitua pelo valor novo (a connection string do Neon):
   ```
   postgresql://neondb_owner:XXXX@ep-xxx.aws.neon.tech/neondb?sslmode=require
   ```
6. Clique em **"Save Changes"**
7. O Render detecta a mudança e dispara um **novo deploy automaticamente** (~2 min)

> **Alternativa:** se preferir evitar redeploy, force um redeploy manual em **"Manual Deploy" → "Deploy latest commit"**.

---

## 8. Atualizar `db_marker` no Neon

Após o deploy bem-sucedido (e o site estar respondendo do Neon), atualize o `db_marker` para refletir o novo ambiente:

```bash
# Conectar no Neon e atualizar:
DATABASE_URL="postgresql://neondb_owner:XXXX@ep-xxx.aws.neon.tech/neondb?sslmode=require" \
  node -e "
const { get, run } = require('./database/db');
(async () => {
  const r = await get(\"SELECT valor FROM config WHERE chave='db_marker'\");
  if (r) {
    await run(\"UPDATE config SET valor = ? WHERE chave='db_marker'\", ['neon-producao-' + new Date().toISOString().slice(0,10)]);
    console.log('db_marker atualizado para neon-producao-' + new Date().toISOString().slice(0,10));
  }
})();
"
```

Isso faz com que `/jogos/db-info` mostre `marcador: neon-producao-YYYY-MM-DD` em vez de `render-producao-...`.

---

## 9. Verificar migração

Após o deploy, faça 4 checagens:

### 9.1 Endpoint de saúde

```bash
curl -s https://bolao-copa-2026-zjoi.onrender.com/healthz
```

Esperado:
```json
{
  "status": "ok",
  "db": { "conectado": true, "marcador": "neon-producao-YYYY-MM-DD", "latencia_ms": <numero> },
  "contagens": { "usuarios": "11", "jogos": "104", "palpites": "505", ... },
  ...
}
```

**Compare as contagens** com o `/healthz` antes da migração — devem ser iguais.

### 9.2 Endpoint de diagnóstico

```bash
curl -s https://bolao-copa-2026-zjoi.onrender.com/jogos/db-info
```

Esperado:
- `host: ep-xxxxxx.<region>.aws.neon.tech` (formato Neon)
- `marcador: neon-producao-YYYY-MM-DD`

### 9.3 UI funcionando

Abra https://bolao-copa-2026-zjoi.onrender.com/ e:
1. Faça login
2. Acesse `/dashboard` — deve mostrar top 5, próximo jogo, palpites pendentes
3. Acesse `/ranking` — deve mostrar a tabela completa com todos os participantes
4. Acesse `/resumo` — deve mostrar suas estatísticas (sem erro)

### 9.4 Rodapé

No rodapé do site deve aparecer o `db_marker`:
```
🗄️ DB: neon-producao-YYYY-MM-DD
```

---

## 10. Limpeza e rollback

### Limpeza pós-migração

Após 1-2 semanas de operação estável no Neon:

1. **Render dashboard → `bolao-db`** (banco de dados provisionado pelo blueprint)
   - Clique em **"Settings"** → **"Delete Database"**
   - Confirme a exclusão
2. **Remova o blueprint `databases` do `render.yaml`** se não for usar mais o Render Postgres:
   ```yaml
   services:
     - type: web
       name: bolao-copa-2026
       ...
       envVars:
         - key: DATABASE_URL
           sync: false  # agora configurada manualmente com Neon
   ```
   E faça `git push` para deploy.

### Rollback (se algo der errado)

Se o site ficar fora do ar após a migração:

1. **Render dashboard → `bolao_copa_2026` → Environment**
2. Edite `DATABASE_URL` de volta para o valor antigo (Render Postgres)
3. Salve — Render faz redeploy
4. Site volta ao normal em ~2 min

O Render Postgres **não é destruído** durante a migração, então o rollback é instantâneo.

> ⚠️ **Atenção:** se você apagar o Render Postgres (passo de limpeza) antes de confirmar que o Neon está estável, o rollback não será possível.

---

## Resumo rápido

```bash
# 1. Criar projeto no Neon
# 2. Copiar connection string do Neon

# 3. Dump do Render
DATABASE_URL="postgresql://bolao_user:XXXX@dpg-...render.com/bolao_db_xxxx" \
  node scripts/daily-snapshot.js

# 4. Import no Neon
DATABASE_URL="postgresql://neondb_owner:XXXX@ep-xxx.aws.neon.tech/neondb?sslmode=require" \
  node scripts/import-render-dump.js

# 5. Render dashboard → Environment → DATABASE_URL → trocar para a string do Neon

# 6. Atualizar db_marker
DATABASE_URL="postgresql://...neon..." \
  node -e "...UPDATE config..."

# 7. Verificar
curl https://bolao-copa-2026-zjoi.onrender.com/healthz
curl https://bolao-copa-2026-zjoi.onrender.com/jogos/db-info

# 8. (1-2 semanas depois) Deletar Render Postgres
```

---

## Troubleshooting

**Erro: `self signed certificate` ao conectar no Neon**
- Certifique-se de que a connection string termina com `?sslmode=require` ou `?sslmode=verify-full`.
- O `db.js` já passa `sslmode=require` automaticamente.

**Erro: `relation "usuarios" does not exist` ao importar**
- Significa que o schema não foi criado. Rode o setup no Neon:
  ```bash
  DATABASE_URL="postgresql://...neon..." node database/setup.js
  ```
  (só roda as migrações se as tabelas não existirem)

**Contagens não batem após importar**
- Rode o dump de novo e compare com o import. Pode ter havido erro em uma linha específica.
- Verifique `data/snapshots/` para ver se algum snapshot anterior tem contagens próximas — talvez houve perda.

**Site demora para carregar após migrar**
- Cold start do Neon (scale to zero): primeira requisição pode levar ~1-2s.
- A partir da segunda, fica normal.

**Quero testar o Neon sem afetar produção**
- Crie um projeto Neon separado, importe o dump, e use uma cópia do `server.js` apontando para esse Neon (em outra porta). Quando estiver OK, faça a migração real.
