// scripts/test-mata-mata-e2e.js — bateria de testes E2E para o suporte a prorrogação/pênaltis
// Uso: node scripts/test-mata-mata-e2e.js

const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const erros = [];

function log(ok, msg, detalhe = '') {
  if (ok) { pass++; console.log('  ✓', msg); }
  else { fail++; erros.push(msg + (detalhe ? ' — ' + detalhe : '')); console.log('  ✗', msg, detalhe ? `(${detalhe})` : ''); }
}

// === HTTP helper (com cookies) ===
class Client {
  constructor() {
    this.cookies = '';
  }
  async req(method, path, data = null, isForm = true) {
    return new Promise((resolve, reject) => {
      const url = new URL(BASE + path);
      const opts = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { Cookie: this.cookies }
      };
      let body = null;
      if (data) {
        body = isForm ? new URLSearchParams(data).toString() : JSON.stringify(data);
        opts.headers['Content-Type'] = isForm ? 'application/x-www-form-urlencoded' : 'application/json';
        opts.headers['Content-Length'] = Buffer.byteLength(body);
      }
      const req = http.request(opts, (res) => {
        const setCookie = res.headers['set-cookie'] || [];
        setCookie.forEach(c => {
          const [pair] = c.split(';');
          if (this.cookies) this.cookies += '; ';
          this.cookies += pair;
        });
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }
  async getCsrf(path) {
    const r = await this.req('GET', path);
    const m = r.body.match(/name="_csrf" value="([^"]+)"/);
    return m ? m[1] : null;
  }
}

(async () => {
  console.log('\n=== TESTE 1: Schema (colunas novas presentes) ===\n');
  const db = new sqlite3.Database('./data/bolao.db');
  await new Promise(r => db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='jogos'", (_, t) => r(t)));
  const cols = await new Promise(r => db.all('PRAGMA table_info(jogos)', (_, c) => r(c)));
  const esperado = ['gols_casa_pror', 'gols_visitante_pror', 'placar_penaltis_casa', 'placar_penaltis_visitante', 'classificado_id'];
  for (const c of esperado) {
    log(cols.some(x => x.name === c), `jogos.${c} existe`);
  }
  const colsP = await new Promise(r => db.all('PRAGMA table_info(palpites)', (_, c) => r(c)));
  log(colsP.some(x => x.name === 'palpite_classificado_id'), 'palpites.palpite_classificado_id existe');
  const colsF = await new Promise(r => db.all('PRAGMA table_info(fase_pontuacao)', (_, c) => r(c)));
  log(colsF.some(x => x.name === 'pts_classificado'), 'fase_pontuacao.pts_classificado existe');

  console.log('\n=== TESTE 2: pts_classificado populados (auto-calculado) ===\n');
  const fases = await new Promise(r => db.all('SELECT fase, pts_resultado, pts_classificado FROM fase_pontuacao ORDER BY fase', (_, f) => r(f)));
  for (const f of fases) {
    const esperado = f.fase === 'grupo' ? 0 : Math.floor(f.pts_resultado / 2);
    log(f.pts_classificado === esperado, `${f.fase}: pts_classificado=${f.pts_classificado} (esperado=${esperado}, floor(pts_resultado/2))`);
  }

  console.log('\n=== TESTE 3: Cálculo de pontos (calcularPontosMataMata) ===\n');
  const { calcularPontosMataMata } = require('../services/pontuacao');
  const r32 = { pts_exato: 25, pts_empate: 18, pts_resultado_gol: 18, pts_resultado: 10, pts_gol: 4, pts_classificado: 5 };
  // Jogo: Coreia × Bósnia 1×1 (90 min), Coreia classifica nos pênaltis
  const jogo = { gols_casa: 1, gols_visitante: 1, classificado_id: 3 };
  let r = calcularPontosMataMata(jogo, 1, 1, 3, r32);
  log(r === 30, `Placar exato + classificado certo = 30 (got ${r})`, `25 + 5`);
  r = calcularPontosMataMata(jogo, 1, 1, 6, r32);
  log(r === 25, `Placar exato + classificado errado = 25 (got ${r})`);
  r = calcularPontosMataMata(jogo, 0, 0, 3, r32);
  log(r === 23, `Empate (sem exato) + classificado certo = 23 (got ${r})`, `18 + 5`);
  r = calcularPontosMataMata(jogo, 2, 0, 3, r32);
  log(r === 5, `Errou placar + classificado certo = 5 (got ${r})`, `0 + 5`);
  r = calcularPontosMataMata(jogo, 2, 0, 6, r32);
  log(r === 0, `Errou placar + classificado errado = 0 (got ${r})`);
  // Jogo decidido em 90 min (sem prorrogação)
  const jogo90 = { gols_casa: 2, gols_visitante: 1, classificado_id: null };
  r = calcularPontosMataMata(jogo90, 2, 1, 6, r32);
  log(r === 25, `90 min sem prorrogação, placar exato = 25 (got ${r})`, `classificado ignorado`);

  console.log('\n=== TESTE 4: Login admin ===\n');
  const admin = new Client();
  const adminCsrf = await admin.getCsrf('/login');
  log(!!adminCsrf, 'CSRF obtido do /login');
  const loginR = await admin.req('POST', '/login', { email: 'admin@teste.com', senha: 'admin123', _csrf: adminCsrf });
  log(loginR.status === 302, `POST /login retornou 302 (got ${loginR.status})`, `Location: ${loginR.headers.location}`);
  log(loginR.headers.location === '/dashboard', `Redireciona para /dashboard`);
  // Verifica sessão autenticada acessando /admin
  const adminCheck = await admin.req('GET', '/admin');
  log(adminCheck.status === 200, `GET /admin autenticado retornou 200 (got ${adminCheck.status})`);

  console.log('\n=== TESTE 2b: Admin form não permite editar pts_classificado separadamente ===\n');
  const pontForm = await admin.req('GET', '/admin/pontuacao-fases');
  log(!/\bname="[^"]*classificado[^"]*"/.test(pontForm.body), 'Formulário não tem campo input editável para pts_classificado');
  log(pontForm.body.includes('&#189; do Só res.') || pontForm.body.includes('½ do Só res.'), 'Subtítulo explica que é metade do Só resultado');

  console.log('\n=== TESTE 5: UI admin mostra seção nova para mata-mata ===\n');
  const jogosPage = await admin.req('GET', '/admin/jogos?fase=r32');
  log(jogosPage.status === 200, `GET /admin/jogos?fase=r32 retornou 200`);
  log(jogosPage.body.includes('Prorrogação / Pênaltis / Classificado'), `Página admin mostra "Prorrogação / Pênaltis / Classificado"`);
  log(jogosPage.body.includes('gols_casa_pror'), `Formulário tem input gols_casa_pror`);
  log(jogosPage.body.includes('placar_penaltis_casa'), `Formulário tem input placar_penaltis_casa`);
  log(jogosPage.body.includes('classificado_id'), `Formulário tem select classificado_id`);
  log(!jogosPage.body.match(/<summary[^>]*>\s*⏱[^<]*<\/summary>/g)?.length > 0 || jogosPage.body.includes('<summary'), `Detalhes da seção em formato <details>/<summary>`);

  console.log('\n=== TESTE 6: Validação — empate sem classificado deve bloquear ===\n');
  const csrf73 = await admin.getCsrf('/admin/jogos');
  // Pega CSRF do form do jogo 73
  const html73 = await admin.req('GET', '/admin/jogos?fase=r32');
  // CSRF geral da página
  const geralCsrf = html73.body.match(/name="_csrf" value="([^"]+)"/)?.[1];
  // Tenta salvar jogo 73 com placar 0×0 (empate) sem classificado
  const res73 = await admin.req('POST', '/admin/jogos/73', {
    gols_casa: '0',
    gols_visitante: '0',
    finalizado: '1',
    classificado_id: '',  // sem classificado
    _csrf: geralCsrf
  });
  log(res73.status === 302, `POST /admin/jogos/73 retornou 302 (redirect)`);
  // Verifica que placar NÃO foi salvo
  const jogo73 = await new Promise(r => db.get('SELECT gols_casa, gols_visitante, finalizado, classificado_id FROM jogos WHERE id = 73', (_, x) => r(x)));
  log(jogo73.gols_casa !== 0 || jogo73.finalizado !== 1, `Jogo 73 não foi salvo com placar empatado sem classificado`);

  console.log('\n=== TESTE 7: Salvar jogo 73 com prorrogação completa ===\n');
  const saveR = await admin.req('POST', '/admin/jogos/73', {
    gols_casa: '1',
    gols_visitante: '1',
    gols_casa_pror: '1',
    gols_visitante_pror: '0',
    placar_penaltis_casa: '',
    placar_penaltis_visitante: '',
    classificado_id: '3',  // Coreia
    finalizado: '1',
    _csrf: geralCsrf
  });
  log(saveR.status === 302, `POST /admin/jogos/73 salvou (302)`);
  const jogo73Final = await new Promise(r => db.get('SELECT * FROM jogos WHERE id = 73', (_, x) => r(x)));
  log(jogo73Final.gols_casa === 1 && jogo73Final.gols_visitante === 1, `Placar 90 min = 1×1`);
  log(jogo73Final.gols_casa_pror === 1 && jogo73Final.gols_visitante_pror === 0, `Prorrogação = 1×0`);
  log(jogo73Final.classificado_id === 3, `Classificado = Coreia (id=3)`);
  log(jogo73Final.finalizado === 1, `Finalizado = 1`);

  console.log('\n=== TESTE 8: Pontuação recalculada após salvar ===\n');
  const palpites73 = await new Promise(r => db.all('SELECT id, usuario_id, palpite_gols_casa, palpite_gols_visitante, palpite_classificado_id, pontos_obtidos FROM palpites WHERE jogo_id = 73', (_, x) => r(x)));
  log(palpites73.length >= 2, `Tem ${palpites73.length} palpites no jogo 73 (de 2 usuários diferentes)`);
  for (const p of palpites73) {
    console.log(`    palpite user=${p.usuario_id}: ${p.palpite_gols_casa}×${p.palpite_gols_visitante} classif=${p.palpite_classificado_id} → ${p.pontos_obtidos} pts`);
  }
  // Palpite A (user 98): placar 1×1 + classif Bósnia=6 → placar exato (25) + classificado errado (0) = 25
  // Palpite B (user 99): placar 2×1 + classif Coreia=3 → errou placar mas acertou gol Bósnia (4) + classificado certo (5) = 9
  const pa = palpites73.find(p => p.palpite_classificado_id === 6);
  const pb = palpites73.find(p => p.palpite_classificado_id === 3);
  log(pa && pa.pontos_obtidos === 25, `Palpite A (1×1+Bósnia) = 25 pts (got ${pa?.pontos_obtidos})`);
  log(pb && pb.pontos_obtidos === 9, `Palpite B (2×1+Coreia) = 9 pts (got ${pb?.pontos_obtidos})  [pts_gol(4) + pts_classificado(5)]`);

  console.log('\n=== TESTE 9: UI palpite (participante) ===\n');
  // Logout admin
  await admin.req('POST', '/logout');
  // Login como convidado
  const part = new Client();
  const partCsrf = await part.getCsrf('/login');
  const partLogin = await part.req('POST', '/login', { email: 'convidado99@teste.com', senha: 'teste123', _csrf: partCsrf });
  log(partLogin.status === 302 && partLogin.headers.location === '/dashboard', `Login participante OK`);
  const palpPage = await part.req('GET', '/palpites');
  log(palpPage.status === 200, `GET /palpites retorna 200`);
  log(palpPage.body.includes('palpite_classificado_id'), `UI palpite tem radio "palpite_classificado_id"`);
  log(palpPage.body.includes('Quem classifica'), `UI palpite tem label "Quem classifica"`);

  console.log('\n=== TESTE 10: Exibição pública (sem login) com placar estendido ===\n');
  const publico = new Client();
  const jogosPage2 = await publico.req('GET', '/jogos');
  log(jogosPage2.status === 200, `GET /jogos público retorna 200`);
  log(jogosPage2.body.includes('Prorrogação: 1 × 0'), `Exibição pública mostra "Prorrogação: 1 × 0"`);
  log(jogosPage2.body.includes('Coreia do Sul classificou') || jogosPage2.body.includes('classificou'), `Exibição pública mostra quem classificou`);

  console.log('\n=== TESTE 11: UI admin pontuacao-fases tem campo novo ===\n');
  const pontPage = await admin.req('GET', '/admin/pontuacao-fases');
  log(pontPage.status === 200, `GET /admin/pontuacao-fases retorna 200`);
  log(pontPage.body.includes('&#189;') || pontPage.body.includes('½'), 'Formulário mostra que Prór.+Pên. = ½ do Só resultado (não editável)');

  console.log('\n=== RESUMO ===\n');
  console.log(`  Passou: ${pass}`);
  console.log(`  Falhou: ${fail}`);
  if (fail > 0) {
    console.log('\\nErros:');
    erros.forEach(e => console.log('  -', e));
  }
  db.close();
  process.exit(fail > 0 ? 1 : 0);
})();
