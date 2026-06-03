/* =============================================================
   api.js — Cliente da API REST (/api/estoque)
   Usado quando há servidor/online. Se o servidor não responder,
   o app continua funcionando offline pelo IndexedDB (storage.js).
   ============================================================= */
(function () {
  "use strict";
  const CE = (window.CE = window.CE || {});

  // Base da API: detecta automaticamente a subpasta onde o app está.
  // Pode ser sobrescrita definindo window.CE_API_BASE antes deste script.
  function detectBase() {
    if (typeof window.CE_API_BASE === "string") {
      return window.CE_API_BASE.replace(/\/$/, "");
    }
    let dir = window.location.pathname.replace(/\/[^/]*$/, "");
    return dir.replace(/\/$/, "");
  }

  const BASE = detectBase();
  // Chama o index.php DIRETAMENTE via ?route=, sem depender de rewrite.
  // Assim, qualquer .htaccess de outro projeto (ex.: a loja) não interfere.
  const ENDPOINT = BASE + "/api/index.php";

  // monta a URL: ENDPOINT?route=<rota>&<extras>
  function buildUrl(route, extraQS) {
    const qs = new URLSearchParams();
    qs.set("route", route);
    if (extraQS) {
      for (const [k, v] of Object.entries(extraQS)) {
        if (v !== undefined && v !== null && v !== "") qs.set(k, v);
      }
    }
    return ENDPOINT + "?" + qs.toString();
  }

  async function req(method, route, body, extraQS) {
    const opt = {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    };
    if (body) opt.body = JSON.stringify(body);
    const res = await fetch(buildUrl(route, extraQS), opt);
    if (res.status === 401) {
      // sessão expirou/ausente: marca offline e avisa o app para pedir login
      Api._online = false;
      try {
        window.dispatchEvent(new CustomEvent("ce:unauthorized"));
      } catch (e) {}
      throw new Error("HTTP 401");
    }
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  const Api = {
    _online: false,

    async ping() {
      try {
        const res = await fetch(buildUrl("health"), {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) { this._online = false; return false; }
        const j = await res.json().catch(() => null);
        // online só conta como "utilizável" se estiver autenticado,
        // pois as rotas de dados exigem login
        this._online = !!(j && j.ok && j.auth);
      } catch {
        this._online = false;
      }
      return this._online;
    },
    isOnline() {
      return this._online;
    },

    async listar() {
      const j = await req("GET", "estoque");
      return j.registros || [];
    },
    async salvar(dados) {
      const j = await req("POST", "estoque", dados);
      return j.registro;
    },
    async editar(id, dados) {
      const j = await req("PUT", "estoque/" + encodeURIComponent(id), dados);
      return j.registro;
    },
    async excluir(id) {
      await req("DELETE", "estoque/" + encodeURIComponent(id));
      return true;
    },
    async buscarPorRua(rua) {
      const j = await req("GET", "estoque/rua/" + encodeURIComponent(rua));
      return j.registros || [];
    },
    async buscarPorPeriodo(inicio, fim) {
      const j = await req("GET", "estoque/periodo", null, { inicio, fim });
      return j.registros || [];
    },
  };

  CE.Api = Api;
})();
