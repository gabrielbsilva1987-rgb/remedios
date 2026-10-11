import { CONFIG } from "./config.js";

/* ============================ Constantes e utilidades ============================ */
const TZ = "America/Sao_Paulo";
const PERIODOS = [
  { id: "manha", nome: "Manhã", emoji: "🌅" },
  { id: "tarde", nome: "Tarde", emoji: "☀️" },
  { id: "noite", nome: "Noite", emoji: "🌙" },
];
const NOME_P = Object.fromEntries(PERIODOS.map((p) => [p.id, p.nome]));
const MOMENTOS = { jejum: "Em jejum", depois: "Depois de comer", dormir: "Antes de dormir", outro: "Outro horário" };
const CFG_PADRAO = {
  horarios: { manha: "08:00", tarde: "14:00", noite: "20:00" },
  atraso_min: 30,
  pa_sis_max: 160, pa_sis_min: 90, pa_dia_max: 100,
  glic_max: 250, glic_min: 70,
};
const CONFIGURADO = !!CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes("COLE_AQUI");

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function partesSP(d = new Date()) {
  const o = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(d).forEach((p) => (o[p.type] = p.value));
  if (o.hour === "24") o.hour = "00";
  return o;
}
const diaSP = (d = new Date()) => { const o = partesSP(d); return `${o.year}-${o.month}-${o.day}`; };
const hoje = () => diaSP();
const minAgora = () => { const o = partesSP(); return +o.hour * 60 + +o.minute; };
const hm2min = (s) => { const [h, m] = String(s || "00:00").split(":").map(Number); return h * 60 + (m || 0); };
const fmtHora = (s) => { const [h, m] = String(s).split(":"); return `${+h}:${m}`; };
const horaDe = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
function addDias(str, n) { const d = new Date(str + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const dataLonga = () => new Date().toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const dataCurta = (str) => { const [y, m, d] = str.split("-"); return `${d}/${m}`; };
const diaSemana = (str) => new Date(str + "T12:00:00Z").toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("ver");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("ver"), 2600);
}
function lerLocal(k, padrao) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } }
function gravarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

/* ============================ Camada de dados ============================ */
// Duas implementações com a mesma interface: Supabase (real) e Local (demonstração).

function apiSupabase(sb) {
  const ok = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async meds() { return ok(await sb.from("medicamentos").select("*").eq("ativo", true).order("ordem").order("id")); },
    async salvarMed(m) {
      if (m.id) { const { id, ...r } = m; ok(await sb.from("medicamentos").update(r).eq("id", id)); }
      else ok(await sb.from("medicamentos").insert(m));
    },
    async excluirMed(id) { ok(await sb.from("medicamentos").update({ ativo: false }).eq("id", id)); },
    async cfg() { const d = ok(await sb.from("config").select("dados").eq("id", 1).maybeSingle()); return { ...CFG_PADRAO, ...(d?.dados || {}) }; },
    async salvarCfg(c) { ok(await sb.from("config").upsert({ id: 1, dados: c })); },
    async doses(de, ate) { return ok(await sb.from("doses").select("*").gte("data", de).lte("data", ate)); },
    async marcar(lista) { ok(await sb.from("doses").upsert(lista, { onConflict: "data,medicamento_id", ignoreDuplicates: true })); },
    async desmarcar(data, medId) { ok(await sb.from("doses").delete().eq("data", data).eq("medicamento_id", medId)); },
    async addMedicao(m) { ok(await sb.from("medicoes").insert(m)); },
    async medicoes(de, ate) {
      return ok(await sb.from("medicoes").select("*").gte("criado_em", `${de}T00:00:00-03:00`).lt("criado_em", `${addDias(ate, 1)}T00:00:00-03:00`).order("criado_em"));
    },
    async excluirMedicao(id) { ok(await sb.from("medicoes").delete().eq("id", id)); },
    async salvarSub(sub, papel) {
      const j = sub.toJSON();
      ok(await sb.from("push_subs").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, papel }, { onConflict: "endpoint" }));
    },
    async teste(papel) { ok(await sb.from("fila").insert({ papel, titulo: "🔔 Teste de notificação", corpo: "Tudo certo! As notificações estão funcionando neste celular." })); },
  };
}

function apiLocal() {
  const L = (k) => lerLocal("demo_" + k, null);
  const G = (k, v) => gravarLocal("demo_" + k, v);
  if (!L("meds")) {
    const seed = [
      ["Forxiga", "10 mg", "manha"], ["Benicar", "40 mg", "manha"], ["Bioartic", "", "manha"], ["Cúrcuma longa", "", "manha"],
      ["Aria", "10 mg", "tarde"], ["Trezor (Rosuvastatina)", "10 mg", "tarde"], ["Concor", "2,5 mg", "tarde"], ["Alopurinol", "300 mg", "tarde"],
      ["Aspirina Prevent", "100 mg", "noite"], ["Celestone", "0,5 mg", "noite"], ["Vesomni", "6 mg / 0,4 mg", "noite"], ["Glifage XR", "500 mg", "noite"],
    ];
    G("meds", seed.map(([nome, dose, periodo], i) => ({ id: i + 1, nome, dose, periodo, ativo: true, ordem: i })));
    G("doses", []); G("medicoes", []); G("cfg", CFG_PADRAO);
  }
  const nid = (arr) => arr.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  return {
    async meds() { return L("meds").filter((m) => m.ativo).sort((a, b) => a.ordem - b.ordem || a.id - b.id); },
    async salvarMed(m) {
      const a = L("meds");
      if (m.id) Object.assign(a.find((x) => x.id === m.id), m); else a.push({ ...m, id: nid(a), ativo: true });
      G("meds", a);
    },
    async excluirMed(id) { const a = L("meds"); a.find((x) => x.id === id).ativo = false; G("meds", a); },
    async cfg() { return { ...CFG_PADRAO, ...(L("cfg") || {}) }; },
    async salvarCfg(c) { G("cfg", c); },
    async doses(de, ate) { return L("doses").filter((d) => d.data >= de && d.data <= ate); },
    async marcar(lista) {
      const a = L("doses");
      for (const d of lista) if (!a.some((x) => x.data === d.data && x.medicamento_id === d.medicamento_id)) a.push({ ...d, id: nid(a), tomado_em: new Date().toISOString() });
      G("doses", a);
    },
    async desmarcar(data, medId) { G("doses", L("doses").filter((x) => !(x.data === data && x.medicamento_id === medId))); },
    async addMedicao(m) { const a = L("medicoes"); a.push({ ...m, id: nid(a), criado_em: new Date().toISOString() }); G("medicoes", a); },
    async medicoes(de, ate) { return L("medicoes").filter((m) => { const d = diaSP(new Date(m.criado_em)); return d >= de && d <= ate; }); },
    async excluirMedicao(id) { G("medicoes", L("medicoes").filter((x) => x.id !== id)); },
    async salvarSub() { throw new Error("No modo demonstração as notificações não funcionam. Configure o Supabase."); },
    async teste() { throw new Error("No modo demonstração as notificações não funcionam."); },
  };
}

/* ============================ Estado ============================ */
const S = {
  sb: null,
  api: null,
  papel: lerLocal("papel", null), // "pai" | "filho"
  aba: "hoje",
  meds: [],
  cfg: CFG_PADRAO,
  dosesHoje: [],
  medicoesHoje: [],
  aberto: null,
  relDias: 7,
  rel: null,
  modal: null,
  telaAjustesPai: false,
};

/* ============================ Inicialização ============================ */
async function iniciar() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  if (CONFIGURADO) {
    try {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      S.sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      S.api = apiSupabase(S.sb);
      const { data } = await S.sb.auth.getSession();
      if (!data.session) return telaLogin();
      // O papel (pai/filho) vem do banco, de acordo com o usuário que entrou
      const { data: perfil, error: ePerfil } = await S.sb.from("perfis").select("papel").eq("user_id", data.session.user.id).maybeSingle();
      if (ePerfil) throw ePerfil;
      if (!perfil) return telaSemPerfil(data.session.user.email);
      S.papel = perfil.papel;
      S.email = data.session.user.email;
      gravarLocal("papel", S.papel);
    } catch (e) {
      return telaErro("Não consegui conectar ao servidor. Verifique a internet e tente de novo.", e);
    }
  } else {
    S.api = apiLocal();
  }
  if (!S.papel) return telaPapel();
  await recarregar();
  setInterval(() => { if (!S.modal && document.visibilityState === "visible") recarregar(true); }, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !S.modal) recarregar(true); });
}

async function recarregar(silencioso = false) {
  try {
    const h = hoje();
    const [meds, cfg, doses, medicoes] = await Promise.all([S.api.meds(), S.api.cfg(), S.api.doses(h, h), S.api.medicoes(h, h)]);
    Object.assign(S, { meds, cfg, dosesHoje: doses, medicoesHoje: medicoes });
    if (S.papel === "filho" && S.aba === "relatorios") await carregarRelatorio();
    render();
  } catch (e) {
    if (!silencioso) telaErro("Não consegui carregar os dados.", e);
  }
}

/* ============================ Telas iniciais ============================ */
function telaErro(msg, e) {
  console.error(e);
  $("#app").innerHTML = `<div class="logo">⚠️</div><div class="cartao centro"><h3>${esc(msg)}</h3><p class="sub">${esc(e?.message || "")}</p>
    <button class="btn primario" onclick="location.reload()">Tentar de novo</button></div>`;
}

function telaLogin() {
  $("#app").innerHTML = `
    <div class="logo">💊</div>
    <h1 class="centro" style="margin:0 0 6px">Remédios</h1>
    <p class="centro sub">Entre com o seu e-mail e a sua senha.<br>Isso só é pedido uma vez neste celular.</p>
    <form id="fLogin" class="cartao mt">
      <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label>
      <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
      <button class="btn primario" type="submit">Entrar</button>
    </form>`;
  $("#fLogin").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const btn = ev.target.querySelector("button");
    btn.disabled = true; btn.textContent = "Entrando…";
    const { error } = await S.sb.auth.signInWithPassword({ email: f.get("email").trim(), password: f.get("senha") });
    if (error) { btn.disabled = false; btn.textContent = "Entrar"; return toast("E-mail ou senha incorretos"); }
    iniciar();
  };
}

function telaSemPerfil(email) {
  $("#app").innerHTML = `<div class="logo">🔒</div><div class="cartao centro"><h3>Usuário sem perfil</h3>
    <p class="sub">O usuário ${esc(email)} ainda não foi definido como Pai ou Filho no banco de dados (Guia, passo 3).</p>
    <button class="btn" id="bSair">Sair</button></div>`;
  $("#bSair").onclick = async () => { await S.sb.auth.signOut(); localStorage.removeItem("papel"); location.reload(); };
}

function telaPapel() {
  $("#app").innerHTML = `
    <div class="logo">💊</div>
    <h1 class="centro" style="margin:0 0 6px">De quem é este celular?</h1>
    <p class="centro sub">Isso define o que aparece na tela e quais avisos este celular recebe.</p>
    <div class="escolha">
      <button class="btn" data-papel="pai">👴 Do Pai<small>Lembretes e botão "Tomei"</small></button>
      <button class="btn" data-papel="filho">👨 Do Filho<small>Acompanhar, relatórios e ajustes</small></button>
    </div>`;
  document.querySelectorAll("[data-papel]").forEach((b) => (b.onclick = async () => {
    S.papel = b.dataset.papel; gravarLocal("papel", S.papel);
    await recarregar();
  }));
}

/* ============================ Lógica dos períodos ============================ */
function estadoPeriodo(pid) {
  const meds = S.meds.filter((m) => m.periodo === pid);
  const doses = S.dosesHoje.filter((d) => d.periodo === pid);
  const tomados = meds.filter((m) => doses.some((d) => d.medicamento_id === m.id));
  const hora = S.cfg.horarios[pid];
  const agora = minAgora(), t = hm2min(hora);
  let st;
  if (!meds.length) st = "vazio";
  else if (tomados.length === meds.length) st = "ok";
  else if (agora >= t + (+S.cfg.atraso_min || 30)) st = "atrasado";
  else if (agora >= t - 60) st = "agora";
  else st = "depois";
  const ultima = doses.map((d) => d.tomado_em).sort().pop();
  return { meds, doses, tomados, hora, st, ultima };
}
function periodoFoco() {
  const ests = PERIODOS.map((p) => ({ p, e: estadoPeriodo(p.id) })).filter((x) => x.e.st !== "vazio");
  return (ests.find((x) => x.e.st === "atrasado") || ests.find((x) => x.e.st === "agora") || ests.find((x) => x.e.st === "depois"))?.p.id || null;
}
const SELO = { ok: ["ok", "✅ Tomou"], atrasado: ["atrasado", "⏰ Atrasado"], agora: ["agora", "Agora"], depois: ["depois", "Mais tarde"] };

/* ============================ Render ============================ */
function render() {
  if (!S.papel) return telaPapel();
  const html = S.papel === "pai" ? (S.telaAjustesPai ? viewAjustes(true) : viewPai()) : viewFilho();
  $("#app").innerHTML = html + (S.modal ? viewModal() : "");
  ligarEventos();
}

function faixaNotificacoes() {
  if (!CONFIGURADO) {
    return `<div class="faixa demo"><b>Modo demonstração</b>Os dados ficam só neste celular e não há notificações. Para usar de verdade, siga o guia de instalação.</div>`;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  if (ios && !instalado) {
    return `<div class="faixa aviso"><b>Instale o app para receber avisos</b>No Safari, toque em <b style="display:inline">Compartilhar</b> (quadrado com seta ↑) e depois em <b style="display:inline">Adicionar à Tela de Início</b>. Depois abra pelo ícone novo.</div>`;
  }
  if (!("Notification" in window) || !("PushManager" in window)) {
    return `<div class="faixa aviso"><b>Este navegador não recebe notificações</b>Use o Safari no iPhone (iOS 16.4 ou mais novo) e abra pelo ícone da Tela de Início.</div>`;
  }
  if (Notification.permission === "denied") {
    return `<div class="faixa aviso"><b>As notificações estão bloqueadas</b>Vá em Ajustes do iPhone → Notificações → Remédios e ative "Permitir Notificações".</div>`;
  }
  if (Notification.permission !== "granted" || !lerLocal("push_ok", false)) {
    return `<div class="faixa info"><b>Ative os lembretes</b>${S.papel === "pai" ? "Assim o celular avisa na hora de cada remédio, mesmo bloqueado." : "Assim você é avisado quando seu pai tomar, atrasar ou medir."}
      <button class="btn primario" data-a="ativarPush">🔔 Ativar lembretes</button></div>`;
  }
  return "";
}

/* ---------- Tela do Pai ---------- */
function viewPai() {
  const foco = S.aberto || periodoFoco();
  let h = `<header class="topo"><div><div class="ola">Olá! 👋</div><div class="data">${esc(dataLonga())}</div></div>
    <button class="icone-btn" data-a="ajustesPai" aria-label="Ajustes">⚙️</button></header>`;
  h += faixaNotificacoes();
  for (const p of PERIODOS) {
    const e = estadoPeriodo(p.id);
    if (e.st === "vazio") continue;
    const aberto = p.id === foco;
    const [cls, txt] = SELO[e.st];
    h += `<section class="periodo ${aberto ? "foco" : ""} ${e.st === "atrasado" ? "atrasado" : ""} ${e.st === "ok" ? "ok" : ""}">
      <button class="p-cab" data-a="abrir" data-p="${p.id}">
        <span class="p-nome">${p.emoji} ${p.nome}</span><span class="p-hora">${fmtHora(e.hora)}</span><span class="selo ${cls}">${txt}</span>
      </button>`;
    if (aberto) {
      h += `<div class="p-corpo"><ul class="meds">` + e.meds.map((m) => {
        const d = e.doses.find((x) => x.medicamento_id === m.id);
        return `<li><button class="med ${d ? "marcado" : ""}" data-a="toggle" data-id="${m.id}" data-p="${p.id}">
          <span class="caixa">${d ? "✓" : ""}</span>
          <span class="m-txt"><span class="m-nome">${esc(m.nome)}</span>${m.dose ? `<span class="m-dose">${esc(m.dose)}</span>` : ""}</span>
          ${d ? `<span class="m-hora">${horaDe(d.tomado_em)}</span>` : ""}</button></li>`;
      }).join("") + `</ul>`;
      if (e.st !== "ok") h += `<button class="btn ok mt" data-a="todos" data-p="${p.id}">✅ TOMEI TODOS</button>`;
      h += `</div>`;
    } else {
      h += `<div class="p-resumo">${e.st === "ok" ? `Tudo tomado${e.ultima ? " às " + horaDe(e.ultima) : ""}` : `${e.tomados.length} de ${e.meds.length} tomados · toque para ver`}</div>`;
    }
    h += `</section>`;
  }
  h += `<div class="dupla">
    <button class="btn" data-a="modal" data-m="pressao"><span>❤️</span><span>Medir pressão</span></button>
    <button class="btn" data-a="modal" data-m="glicemia"><span>🩸</span><span>Medir glicemia</span></button>
  </div>`;
  h += blocoMedicoesHoje();
  return h;
}

function textoMedicao(m) {
  if (m.tipo === "pressao") return `${m.sistolica} × ${m.diastolica}${m.pulso ? ` <span class="sub">· ${m.pulso} bpm</span>` : ""}`;
  return `${m.glicemia} <span class="sub">mg/dL · ${esc(MOMENTOS[m.momento] || "")}</span>`;
}
function foraDaFaixa(m, c = S.cfg) {
  if (m.tipo === "pressao") return m.sistolica >= c.pa_sis_max || m.sistolica <= c.pa_sis_min || m.diastolica >= c.pa_dia_max;
  return m.glicemia >= c.glic_max || m.glicemia <= c.glic_min;
}
function blocoMedicoesHoje(comExcluir = false) {
  if (!S.medicoesHoje.length) return `<h2>Medições de hoje</h2><div class="cartao vazio">Nenhuma medição ainda hoje.</div>`;
  return `<h2>Medições de hoje</h2><div class="cartao"><ul class="lista-med">` +
    [...S.medicoesHoje].reverse().map((m) => `<li><span>${m.tipo === "pressao" ? "❤️ Pressão" : "🩸 Glicemia"}<br><span class="sub">${horaDe(m.criado_em)}</span></span>
      <span class="valor ${foraDaFaixa(m) ? "fora" : ""}">${textoMedicao(m)}${foraDaFaixa(m) ? " ⚠️" : ""}</span>
      ${comExcluir ? `<button class="icone-btn" style="width:40px;height:40px;font-size:18px" data-a="excluirMedicao" data-id="${m.id}" aria-label="Excluir">🗑️</button>` : ""}</li>`).join("") +
    `</ul></div>`;
}

/* ---------- Tela do Filho ---------- */
function viewFilho() {
  let h = "";
  if (S.aba === "hoje") h = viewFilhoHoje();
  else if (S.aba === "relatorios") h = viewRelatorios();
  else h = viewAjustes(false);
  h += `<nav class="abas nao-imprimir">
    <button class="${S.aba === "hoje" ? "ativa" : ""}" data-a="aba" data-v="hoje"><span>📋</span><span>Hoje</span></button>
    <button class="${S.aba === "relatorios" ? "ativa" : ""}" data-a="aba" data-v="relatorios"><span>📊</span><span>Relatórios</span></button>
    <button class="${S.aba === "ajustes" ? "ativa" : ""}" data-a="aba" data-v="ajustes"><span>⚙️</span><span>Ajustes</span></button>
  </nav>`;
  return h;
}

function viewFilhoHoje() {
  let h = `<header class="topo"><div><div class="ola">Hoje do Pai</div><div class="data">${esc(dataLonga())}</div></div>
    <button class="icone-btn" data-a="atualizar" aria-label="Atualizar">🔄</button></header>`;
  h += faixaNotificacoes();
  for (const p of PERIODOS) {
    const e = estadoPeriodo(p.id);
    if (e.st === "vazio") continue;
    const [cls, txt] = SELO[e.st];
    h += `<section class="periodo ${e.st === "atrasado" ? "atrasado" : ""} ${e.st === "ok" ? "ok" : ""}">
      <div class="p-cab"><span class="p-nome">${p.emoji} ${p.nome}</span><span class="p-hora">${fmtHora(e.hora)}</span><span class="selo ${cls}">${txt}</span></div>
      <div class="p-corpo"><ul class="meds">` + e.meds.map((m) => {
        const d = e.doses.find((x) => x.medicamento_id === m.id);
        return `<li><div class="med ${d ? "marcado" : ""}" style="min-height:56px;padding:10px">
          <span class="caixa" style="width:30px;height:30px;font-size:18px;border-radius:9px">${d ? "✓" : ""}</span>
          <span class="m-txt"><span class="m-nome" style="font-size:19px">${esc(m.nome)}</span>${m.dose ? `<span class="m-dose">${esc(m.dose)}</span>` : ""}</span>
          ${d ? `<span class="m-hora">${horaDe(d.tomado_em)}</span>` : `<span class="m-hora pend ${e.st === "atrasado" ? "atr" : ""}">${e.st === "atrasado" ? "não tomou" : "pendente"}</span>`}
        </div></li>`;
      }).join("") + `</ul></div></section>`;
  }
  h += blocoMedicoesHoje(true);
  h += `<p class="sub centro mt">Atualiza sozinho a cada minuto.</p>`;
  return h;
}

/* ---------- Relatórios ---------- */
async function carregarRelatorio() {
  const ate = hoje(), de = addDias(ate, -(S.relDias - 1));
  const [doses, medicoes] = await Promise.all([S.api.doses(de, ate), S.api.medicoes(de, ate)]);
  S.rel = { de, ate, doses, medicoes };
}

function calcAdesao() {
  const { de, ate, doses } = S.rel;
  const dias = [];
  for (let d = ate; d >= de; d = addDias(d, -1)) dias.push(d);
  let esperado = 0, tomado = 0;
  const linhas = dias.map((dia) => {
    const cel = PERIODOS.map((p) => {
      const meds = S.meds.filter((m) => m.periodo === p.id);
      if (!meds.length) return { cls: "c-fut", txt: "–" };
      const passou = dia < ate || minAgora() >= hm2min(S.cfg.horarios[p.id]) + (+S.cfg.atraso_min || 30);
      const n = doses.filter((x) => x.data === dia && x.periodo === p.id).length;
      if (!passou && n < meds.length) return { cls: "c-fut", txt: n ? `${n}/${meds.length}` : "–" };
      esperado += meds.length; tomado += Math.min(n, meds.length);
      if (n >= meds.length) return { cls: "c-ok", txt: "✓" };
      if (n === 0) return { cls: "c-nao", txt: "✗" };
      return { cls: "c-parcial", txt: `${n}/${meds.length}` };
    });
    return { dia, cel };
  });
  return { linhas, pct: esperado ? Math.round((tomado / esperado) * 100) : null };
}

function grafico(series, { limites = [], unidade = "" } = {}) {
  const pts = series.flatMap((s) => s.pontos);
  if (!pts.length) return `<div class="vazio">Sem medições neste período.</div>`;
  const W = 600, H = 240, pl = 44, pr = 12, pt = 12, pb = 30;
  const xs = pts.map((p) => p.x);
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 - x0 < 3600e3) { x0 -= 43200e3; x1 += 43200e3; }
  const ys = [...pts.map((p) => p.y), ...limites.map((l) => l.y)];
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const pad = (y1 - y0) * 0.12 || 10; y0 = Math.max(0, Math.floor((y0 - pad) / 10) * 10); y1 = Math.ceil((y1 + pad) / 10) * 10;
  const X = (x) => pl + ((x - x0) / (x1 - x0)) * (W - pl - pr);
  const Y = (y) => pt + (1 - (y - y0) / (y1 - y0)) * (H - pt - pb);
  const passo = Math.max(10, Math.ceil((y1 - y0) / 5 / 10) * 10);
  let g = "";
  for (let v = Math.ceil(y0 / passo) * passo; v <= y1; v += passo)
    g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e8e5dc"/><text x="${pl - 8}" y="${Y(v) + 5}" text-anchor="end" font-size="14" fill="#6b7571">${v}</text>`;
  for (const l of limites)
    g += `<line x1="${pl}" x2="${W - pr}" y1="${Y(l.y)}" y2="${Y(l.y)}" stroke="#b42318" stroke-dasharray="6 5" stroke-width="1.5" opacity=".55"/>`;
  const fmtX = (x) => new Date(x).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
  g += `<text x="${pl}" y="${H - 8}" font-size="14" fill="#6b7571">${fmtX(x0)}</text><text x="${W - pr}" y="${H - 8}" font-size="14" fill="#6b7571" text-anchor="end">${fmtX(x1)}</text>`;
  for (const s of series) {
    if (!s.pontos.length) continue;
    const d = s.pontos.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join("");
    g += `<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += s.pontos.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${p.fora ? 5.5 : 4}" fill="${p.fora ? "#b42318" : s.cor}" stroke="#fff" stroke-width="1.5"><title>${new Date(p.x).toLocaleString("pt-BR", { timeZone: TZ })}: ${p.y} ${unidade}</title></circle>`).join("");
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

const media = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);

function viewRelatorios() {
  let h = `<header class="topo"><div><div class="ola">Relatórios</div><div class="data nao-imprimir">Remédios, pressão e glicemia</div></div></header>`;
  h += `<div class="chips">` + [7, 30, 90].map((n) => `<button class="chip ${S.relDias === n ? "ativo" : ""}" data-a="relDias" data-v="${n}">${n} dias</button>`).join("") + `</div>`;
  if (!S.rel) return h + `<div class="cartao vazio">Carregando…</div>`;
  const { de, ate, medicoes } = S.rel;
  h += `<div class="so-impressao"><h2 style="margin:0 0 4px">Relatório de saúde</h2><p class="sub">Período: ${dataCurta(de)} a ${dataCurta(ate)} · gerado em ${new Date().toLocaleString("pt-BR", { timeZone: TZ })}</p></div>`;
  const ad = calcAdesao();
  const pa = medicoes.filter((m) => m.tipo === "pressao");
  const gl = medicoes.filter((m) => m.tipo === "glicemia");
  const fora = medicoes.filter((m) => foraDaFaixa(m)).length;
  h += `<div class="tiles">
    <div class="tile"><div class="rot">Remédios tomados</div><div class="num">${ad.pct ?? "–"}<small>%</small></div></div>
    <div class="tile"><div class="rot">Medições fora da faixa</div><div class="num" style="color:${fora ? "var(--perigo)" : "inherit"}">${fora}</div></div>
    <div class="tile"><div class="rot">Pressão média</div><div class="num">${pa.length ? `${media(pa.map((m) => m.sistolica))}×${media(pa.map((m) => m.diastolica))}` : "–"}</div></div>
    <div class="tile"><div class="rot">Glicemia média</div><div class="num">${media(gl.map((m) => m.glicemia)) ?? "–"}<small>${gl.length ? " mg/dL" : ""}</small></div></div>
  </div>`;
  const pt = (m, y) => ({ x: new Date(m.criado_em).getTime(), y, fora: foraDaFaixa(m) });
  h += `<div class="cartao grafico"><h3>❤️ Pressão (${pa.length} medições)</h3>${grafico([
      { cor: "#c2410c", pontos: pa.map((m) => pt(m, m.sistolica)) },
      { cor: "#2458a6", pontos: pa.map((m) => pt(m, m.diastolica)) },
    ], { limites: [{ y: S.cfg.pa_sis_max }], unidade: "mmHg" })}
    <div class="legenda"><span><i style="background:#c2410c"></i>Máxima</span><span><i style="background:#2458a6"></i>Mínima</span><span><i style="background:#b42318;opacity:.55"></i>Limite de alerta</span></div></div>`;
  h += `<div class="cartao grafico"><h3>🩸 Glicemia (${gl.length} medições)</h3>${grafico([
      { cor: "#0f6e64", pontos: gl.map((m) => pt(m, m.glicemia)) },
    ], { limites: [{ y: S.cfg.glic_max }, { y: S.cfg.glic_min }], unidade: "mg/dL" })}
    <div class="legenda"><span><i style="background:#0f6e64"></i>Glicemia (mg/dL)</span><span><i style="background:#b42318;opacity:.55"></i>Limites de alerta</span></div></div>`;
  h += `<div class="cartao"><h3>💊 Remédios por dia</h3><table class="adesao"><thead><tr><th>Dia</th>${PERIODOS.map((p) => `<th>${p.nome}</th>`).join("")}</tr></thead><tbody>` +
    ad.linhas.map((l) => `<tr><td>${diaSemana(l.dia)} ${dataCurta(l.dia)}</td>${l.cel.map((c) => `<td class="${c.cls}">${c.txt}</td>`).join("")}</tr>`).join("") +
    `</tbody></table><p class="sub mt">✓ todos · n/m parcial · ✗ não tomou</p></div>`;
  if (medicoes.length) {
    h += `<div class="cartao"><h3>Todas as medições</h3><table class="adesao"><thead><tr><th>Quando</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>` +
      [...medicoes].reverse().map((m) => `<tr><td>${new Date(m.criado_em).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
        <td>${m.tipo === "pressao" ? "Pressão" : "Glicemia"}</td><td class="${foraDaFaixa(m) ? "c-nao" : ""}">${m.tipo === "pressao" ? `${m.sistolica}×${m.diastolica}` : `${m.glicemia} (${esc(MOMENTOS[m.momento] || "")})`}</td></tr>`).join("") +
      `</tbody></table></div>`;
  }
  h += `<button class="btn primario nao-imprimir" data-a="imprimir">📄 Gerar PDF / Imprimir</button>
    <p class="sub centro nao-imprimir mt">No iPhone: toque em Gerar PDF → Compartilhar (↑) → Salvar em Arquivos ou enviar pelo WhatsApp.</p>`;
  return h;
}

/* ---------- Ajustes ---------- */
function viewAjustes(doPai) {
  const c = S.cfg;
  let h = `<header class="topo"><div><div class="ola">Ajustes</div></div>${doPai ? `<button class="icone-btn" data-a="voltarPai" aria-label="Voltar">✕</button>` : ""}</header>`;
  h += faixaNotificacoes();
  if (CONFIGURADO && typeof Notification !== "undefined" && Notification.permission === "granted" && lerLocal("push_ok", false))
    h += `<button class="btn mt" data-a="testarPush">🔔 Enviar notificação de teste</button>`;

  if (S.papel === "pai" && CONFIGURADO) {
    h += `<h2>Remédios</h2><div class="cartao sub">A lista de remédios e os horários são ajustados pelo celular do filho.</div>`;
    h += `<h2>Este celular</h2><div class="cartao"><p style="margin-top:0">Conectado como <b>Pai 👴</b>${S.email ? `<br><span class="sub">${esc(S.email)}</span>` : ""}</p>
      <button class="btn pequeno perigo" data-a="sair">Sair da conta</button></div>`;
    return h;
  }

  h += `<h2>Horários dos remédios</h2><div class="cartao"><div class="grade3">` +
    PERIODOS.map((p) => `<label class="campo"><span>${p.emoji} ${p.nome}</span><input type="time" data-cfg-hora="${p.id}" value="${esc(c.horarios[p.id])}"></label>`).join("") +
    `</div><label class="campo"><span>Avisar o filho se atrasar (minutos)</span><input type="number" inputmode="numeric" data-cfg="atraso_min" value="${c.atraso_min}"></label>
    <button class="btn primario pequeno" data-a="salvarCfg">Salvar horários</button></div>`;

  h += `<h2>Medicamentos</h2>`;
  for (const p of PERIODOS) {
    const meds = S.meds.filter((m) => m.periodo === p.id);
    h += `<div class="cartao"><h3>${p.emoji} ${p.nome}</h3><ul class="lista-med">` +
      (meds.map((m) => `<li><span><b>${esc(m.nome)}</b> <span class="sub">${esc(m.dose)}</span></span>
        <button class="icone-btn" style="width:44px;height:44px;font-size:18px" data-a="editarMed" data-id="${m.id}" aria-label="Editar">✏️</button></li>`).join("") || `<li class="vazio">Nenhum</li>`) +
      `</ul><button class="btn pequeno mt" data-a="novoMed" data-p="${p.id}">＋ Adicionar remédio</button></div>`;
  }

  h += `<h2>Limites para alerta</h2><div class="cartao"><p class="sub" style="margin-top:0">O filho recebe ⚠️ quando uma medição passar destes valores. Combine os números com o médico.</p>
    <div class="grade3">
      <label class="campo"><span>Máxima ≥</span><input type="number" inputmode="numeric" data-cfg="pa_sis_max" value="${c.pa_sis_max}"></label>
      <label class="campo"><span>Máxima ≤</span><input type="number" inputmode="numeric" data-cfg="pa_sis_min" value="${c.pa_sis_min}"></label>
      <label class="campo"><span>Mínima ≥</span><input type="number" inputmode="numeric" data-cfg="pa_dia_max" value="${c.pa_dia_max}"></label>
    </div><div class="grade2">
      <label class="campo"><span>Glicemia ≥</span><input type="number" inputmode="numeric" data-cfg="glic_max" value="${c.glic_max}"></label>
      <label class="campo"><span>Glicemia ≤</span><input type="number" inputmode="numeric" data-cfg="glic_min" value="${c.glic_min}"></label>
    </div><button class="btn primario pequeno" data-a="salvarCfg">Salvar limites</button></div>`;

  h += `<h2>Este celular</h2><div class="cartao">
    <p style="margin-top:0">${CONFIGURADO ? "Conectado" : "Configurado"} como <b>${S.papel === "pai" ? "Pai 👴" : "Filho 👨"}</b>${S.email ? `<br><span class="sub">${esc(S.email)}</span>` : ""}</p>
    ${CONFIGURADO ? `<button class="btn pequeno perigo" data-a="sair">Sair da conta</button>` : `<button class="btn pequeno" data-a="trocarPapel">Trocar (Pai / Filho) — só no modo demonstração</button>`}
  </div>`;
  return h;
}

/* ---------- Modais ---------- */
function viewModal() {
  const m = S.modal;
  let corpo = "";
  if (m.tipo === "pressao") {
    corpo = `<h2>❤️ Pressão</h2>
      <div class="lado">
        <label class="campo"><span>Máxima</span><input class="enorme" id="sis" type="number" inputmode="numeric" placeholder="130"></label>
        <span class="x">×</span>
        <label class="campo"><span>Mínima</span><input class="enorme" id="dia" type="number" inputmode="numeric" placeholder="80"></label>
      </div>
      <label class="campo"><span>Batimentos (opcional)</span><input id="pulso" type="number" inputmode="numeric" placeholder="72"></label>
      <p class="sub">Pode digitar do jeito que o médico fala: "13 por 8" vira 130 × 80.</p>`;
  } else if (m.tipo === "glicemia") {
    corpo = `<h2>🩸 Glicemia</h2>
      <label class="campo"><span>Valor (mg/dL)</span><input class="enorme" id="glic" type="number" inputmode="numeric" placeholder="110"></label>
      <div class="campo"><span class="sub">Quando foi medida?</span><div class="chips mt">` +
      Object.entries(MOMENTOS).map(([k, v], i) => `<button class="chip ${(m.momento || "jejum") === k ? "ativo" : ""}" data-a="momento" data-v="${k}">${v}</button>`).join("") +
      `</div></div>`;
  } else if (m.tipo === "med") {
    const med = m.med;
    corpo = `<h2>${med.id ? "Editar remédio" : "Novo remédio"}</h2>
      <label class="campo"><span>Nome</span><input id="mNome" type="text" value="${esc(med.nome || "")}" placeholder="Ex.: Losartana"></label>
      <label class="campo"><span>Dose</span><input id="mDose" type="text" value="${esc(med.dose || "")}" placeholder="Ex.: 50 mg"></label>
      <label class="campo"><span>Período</span><select id="mPer">${PERIODOS.map((p) => `<option value="${p.id}" ${med.periodo === p.id ? "selected" : ""}>${p.nome}</option>`).join("")}</select></label>
      ${med.id ? `<button class="btn pequeno perigo" data-a="excluirMed" data-id="${med.id}">Remover este remédio</button>` : ""}`;
  } else if (m.tipo === "confirmar") {
    corpo = `<h2>${esc(m.titulo)}</h2><p>${esc(m.texto)}</p>`;
  }
  const rotulo = m.tipo === "confirmar" ? m.botao : "Salvar";
  return `<div class="fundo-modal" data-a="fecharFundo"><div class="modal" role="dialog">${corpo}
    <div class="acoes"><button class="btn primario" data-a="salvarModal">${esc(rotulo)}</button><button class="btn" data-a="fechar">Cancelar</button></div></div></div>`;
}

/* ============================ Ações ============================ */
const ACOES = {
  async abrir(el) { const atual = S.aberto || periodoFoco(); S.aberto = atual === el.dataset.p ? "__nenhum" : el.dataset.p; render(); },
  async toggle(el) {
    const id = +el.dataset.id, p = el.dataset.p, h = hoje();
    const ja = S.dosesHoje.find((d) => d.medicamento_id === id);
    if (ja) {
      S.modal = { tipo: "confirmar", titulo: "Desmarcar?", texto: "Este remédio vai voltar a aparecer como não tomado.", botao: "Desmarcar", acao: async () => { await S.api.desmarcar(h, id); } };
      return render();
    }
    await S.api.marcar([{ data: h, periodo: p, medicamento_id: id }]);
    await recarregar(true);
    if (estadoPeriodo(p).st === "ok") { toast("Muito bem! Tudo tomado ✅"); S.aberto = null; render(); }
  },
  async todos(el) {
    const p = el.dataset.p, h = hoje();
    const faltam = estadoPeriodo(p).meds.filter((m) => !S.dosesHoje.some((d) => d.medicamento_id === m.id));
    await S.api.marcar(faltam.map((m) => ({ data: h, periodo: p, medicamento_id: m.id })));
    S.aberto = null;
    await recarregar(true);
    toast("Muito bem! Tudo tomado ✅");
  },
  modal(el) { S.modal = { tipo: el.dataset.m, momento: "jejum" }; render(); setTimeout(() => $(".modal input")?.focus(), 50); },
  momento(el) { S.modal.momento = el.dataset.v; document.querySelectorAll("[data-a=momento]").forEach((b) => b.classList.toggle("ativo", b === el)); },
  fechar() { S.modal = null; render(); },
  fecharFundo(el, ev) { if (ev.target === el) ACOES.fechar(); },
  async salvarModal() {
    const m = S.modal;
    if (m.tipo === "pressao") {
      let sis = +$("#sis").value, dia = +$("#dia").value; const pulso = +$("#pulso").value || null;
      if (sis && sis < 30) sis *= 10;
      if (dia && dia < 20) dia *= 10;
      if (!sis || !dia || sis < 50 || sis > 280 || dia < 30 || dia > 180) return toast("Confira os números da pressão");
      await S.api.addMedicao({ tipo: "pressao", sistolica: sis, diastolica: dia, pulso });
      toast(`Pressão ${sis} × ${dia} salva ✅`);
    } else if (m.tipo === "glicemia") {
      const g = +$("#glic").value;
      if (!g || g < 20 || g > 700) return toast("Confira o valor da glicemia");
      await S.api.addMedicao({ tipo: "glicemia", glicemia: g, momento: m.momento || "jejum" });
      toast(`Glicemia ${g} salva ✅`);
    } else if (m.tipo === "med") {
      const nome = $("#mNome").value.trim();
      if (!nome) return toast("Escreva o nome do remédio");
      const dados = { nome, dose: $("#mDose").value.trim(), periodo: $("#mPer").value };
      if (m.med.id) dados.id = m.med.id; else dados.ordem = S.meds.length + 100;
      await S.api.salvarMed(dados);
      toast("Remédio salvo ✅");
    } else if (m.tipo === "confirmar") {
      await m.acao();
    }
    S.modal = null;
    await recarregar();
  },
  ajustesPai() { S.telaAjustesPai = true; render(); window.scrollTo(0, 0); },
  voltarPai() { S.telaAjustesPai = false; render(); window.scrollTo(0, 0); },
  async aba(el) { S.aba = el.dataset.v; render(); window.scrollTo(0, 0); if (S.aba === "relatorios") { await carregarRelatorio(); render(); } },
  async atualizar() { await recarregar(); toast("Atualizado"); },
  async relDias(el) { S.relDias = +el.dataset.v; S.rel = null; render(); await carregarRelatorio(); render(); },
  imprimir() { window.print(); },
  async salvarCfg() {
    const c = structuredClone(S.cfg);
    document.querySelectorAll("[data-cfg-hora]").forEach((i) => { if (i.value) c.horarios[i.dataset.cfgHora] = i.value; });
    document.querySelectorAll("[data-cfg]").forEach((i) => { if (i.value !== "") c[i.dataset.cfg] = +i.value; });
    await S.api.salvarCfg(c);
    S.cfg = c;
    toast("Ajustes salvos ✅");
    render();
  },
  editarMed(el) { S.modal = { tipo: "med", med: { ...S.meds.find((m) => m.id === +el.dataset.id) } }; render(); },
  novoMed(el) { S.modal = { tipo: "med", med: { periodo: el.dataset.p } }; render(); setTimeout(() => $("#mNome")?.focus(), 50); },
  excluirMed(el) {
    const id = +el.dataset.id;
    S.modal = { tipo: "confirmar", titulo: "Remover remédio?", texto: "Ele sai da lista. O histórico de quando foi tomado continua guardado.", botao: "Remover", acao: () => S.api.excluirMed(id) };
    render();
  },
  excluirMedicao(el) {
    const id = +el.dataset.id;
    S.modal = { tipo: "confirmar", titulo: "Apagar medição?", texto: "Use isto só se a medição foi registrada errado.", botao: "Apagar", acao: () => S.api.excluirMedicao(id) };
    render();
  },
  trocarPapel() {
    S.modal = { tipo: "confirmar", titulo: "Trocar o dono deste celular?", texto: "Você vai escolher de novo entre Pai e Filho. Depois, ative os lembretes outra vez.", botao: "Trocar",
      acao: async () => { localStorage.removeItem("papel"); localStorage.removeItem("push_ok"); S.papel = null; S.telaAjustesPai = false; S.aba = "hoje"; } };
    render();
  },
  sair() {
    S.modal = { tipo: "confirmar", titulo: "Sair da conta?", texto: "Será preciso digitar o e-mail e a senha de novo neste celular.", botao: "Sair",
      acao: async () => { await S.sb.auth.signOut(); localStorage.removeItem("push_ok"); location.reload(); } };
    render();
  },
  async ativarPush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { render(); return toast("Notificações não permitidas"); }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONFIG.VAPID_PUBLIC_KEY) });
      await S.api.salvarSub(sub, S.papel);
      gravarLocal("push_ok", true);
      toast("Lembretes ativados 🔔");
      render();
    } catch (e) {
      console.error(e);
      toast("Não deu para ativar: " + (e.message || e));
    }
  },
  async testarPush() {
    try {
      // Garante que a inscrição está salva (caso o iPhone a tenha renovado)
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await S.api.salvarSub(sub, S.papel);
      await S.api.teste(S.papel);
      toast("Teste enviado! Chega em até 1 minuto 🔔");
    } catch (e) { toast("Erro: " + (e.message || e)); }
  },
};

function b64ToU8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function ligarEventos() {
  document.querySelectorAll("[data-a]").forEach((el) => {
    el.onclick = async (ev) => {
      const a = el.dataset.a;
      if (a !== "fecharFundo") ev.stopPropagation();
      if (!ACOES[a]) return;
      if (el.tagName === "BUTTON" && a !== "momento" && a !== "fecharFundo") el.disabled = true;
      try { await ACOES[a](el, ev); }
      catch (e) { console.error(e); toast("Algo deu errado. Tente de novo."); }
      finally { if (el.isConnected) el.disabled = false; }
    };
  });
}

iniciar();
