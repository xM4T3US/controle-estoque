/* =============================================================
   js/auth.js — cliente de autenticação (sessão por cookie).
   Conversa com api/index.php?route=login|logout|me
   Usa o mesmo detector de subpasta do api.js.
   ============================================================= */
(function () {
  "use strict";
  const CE = (window.CE = window.CE || {});

  function detectBase() {
    if (typeof window.CE_API_BASE === "string") {
      return window.CE_API_BASE.replace(/\/$/, "");
    }
    let dir = window.location.pathname.replace(/\/[^/]*$/, "");
    return dir.replace(/\/$/, "");
  }
  const ENDPOINT = detectBase() + "/api/index.php";
  function url(route) {
    return ENDPOINT + "?route=" + encodeURIComponent(route);
  }

  const Auth = {
    _authed: false,
    _configured: true,

    isAuthed() {
      return this._authed;
    },
    isConfigured() {
      return this._configured;
    },

    /** Consulta o estado no servidor. Retorna {online, auth, configurado}. */
    async status() {
      try {
        const res = await fetch(url("me"), {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!res.ok) return { online: true, auth: false, configurado: true };
        const j = await res.json();
        this._authed = !!j.auth;
        this._configured = j.configurado !== false;
        return { online: true, auth: this._authed, configurado: this._configured };
      } catch (e) {
        // sem rede: não dá para confirmar; deixa o app decidir pelo cache
        return { online: false, auth: false, configurado: true };
      }
    },

    /** Faz login. Retorna {ok, erro?, configurado?}. */
    async login(senha) {
      try {
        const res = await fetch(url("login"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ senha }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && j.auth) {
          this._authed = true;
          try { localStorage.setItem("ce_authed", "1"); } catch (e) {}
          return { ok: true };
        }
        if (res.status === 409 || j.configurado === false) {
          this._configured = false;
          return { ok: false, configurado: false, erro: j.erro };
        }
        return { ok: false, erro: j.erro || "Senha incorreta." };
      } catch (e) {
        return { ok: false, erro: "Sem conexão com o servidor." };
      }
    },

    async logout() {
      try {
        await fetch(url("logout"), {
          method: "POST",
          credentials: "same-origin",
        });
      } catch (e) {}
      this._authed = false;
      try { localStorage.removeItem("ce_authed"); } catch (e) {}
    },

    /** Houve login válido neste aparelho alguma vez? (para modo offline) */
    hadSession() {
      try {
        return localStorage.getItem("ce_authed") === "1";
      } catch (e) {
        return false;
      }
    },
  };

  CE.Auth = Auth;
})();
