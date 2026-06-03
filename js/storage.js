/* =============================================================
   CONTROLE DE ESTOQUE — storage.js
   Camada de serviço de dados (IndexedDB + backup LocalStorage)

   Esta camada isola TODO o acesso a dados. Para integrar com um
   backend futuro (Spring Boot / PostgreSQL / Supabase / Firebase),
   basta reimplementar os métodos públicos abaixo para chamar a API
   REST — a interface (Promises) permanece idêntica e o restante do
   frontend NÃO precisa ser alterado.

   API pública:
     init()                         -> Promise<void>
     create(registro)               -> Promise<registro>
     update(id, dados)              -> Promise<registro>
     remove(id)                     -> Promise<void>
     getAll()                       -> Promise<registro[]>
     getById(id)                    -> Promise<registro|null>
     query(filtros)                 -> Promise<registro[]>
     clearAll()                     -> Promise<void>
     bulkImport(registros, opts)    -> Promise<{inseridos, ignorados}>
   ============================================================= */
(function () {
  "use strict";

  const CE = (window.CE = window.CE || {});
  const { Utils } = CE;

  const DB_NAME = "controle_estoque_db";
  const DB_VERSION = 1;
  const STORE = "registros";
  const BACKUP_KEY = "ce_backup_registros";
  const PREFS_KEY = "ce_prefs";

  let _db = null;

  const Storage = {
    /* ---------- Inicialização ---------- */
    init() {
      return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
          console.warn("IndexedDB indisponível — usando apenas LocalStorage.");
          return resolve();
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const os = db.createObjectStore(STORE, {
              keyPath: "id",
            });
            os.createIndex("data", "data", { unique: false });
            os.createIndex("turno", "turno", { unique: false });
            os.createIndex("rua", "rua", { unique: false });
            os.createIndex("operador", "operador", { unique: false });
            os.createIndex("data_turno", ["data", "turno"], { unique: false });
          }
        };
        req.onsuccess = (e) => {
          _db = e.target.result;
          resolve();
        };
        req.onerror = (e) => {
          console.error("Erro ao abrir IndexedDB", e);
          reject(e);
        };
      });
    },

    _tx(mode = "readonly") {
      const tx = _db.transaction(STORE, mode);
      return tx.objectStore(STORE);
    },

    /* ---------- Backup em LocalStorage ---------- */
    async _backup() {
      try {
        const all = await this.getAll();
        localStorage.setItem(BACKUP_KEY, JSON.stringify(all));
      } catch (err) {
        console.warn("Falha no backup LocalStorage", err);
      }
    },

    getBackup() {
      try {
        return JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
      } catch {
        return [];
      }
    },

    /* ---------- CRUD ---------- */
    create(registro) {
      return new Promise((resolve, reject) => {
        const rec = this._normalize(registro);
        rec.id = rec.id || Utils.uid();
        rec.createdAt = rec.createdAt || Utils.timestamp();
        rec.updatedAt = rec.createdAt;

        if (!_db) {
          const all = this.getBackup();
          all.push(rec);
          localStorage.setItem(BACKUP_KEY, JSON.stringify(all));
          return resolve(rec);
        }
        const store = this._tx("readwrite");
        const r = store.add(rec);
        r.onsuccess = () => {
          this._backup();
          resolve(rec);
        };
        r.onerror = (e) => reject(e);
      });
    },

    update(id, dados) {
      return new Promise(async (resolve, reject) => {
        const existing = await this.getById(id);
        if (!existing) return reject(new Error("Registro não encontrado"));
        const merged = this._normalize({ ...existing, ...dados, id });
        merged.createdAt = existing.createdAt;
        merged.updatedAt = Utils.timestamp();

        if (!_db) {
          const all = this.getBackup().map((r) => (r.id === id ? merged : r));
          localStorage.setItem(BACKUP_KEY, JSON.stringify(all));
          return resolve(merged);
        }
        const store = this._tx("readwrite");
        const r = store.put(merged);
        r.onsuccess = () => {
          this._backup();
          resolve(merged);
        };
        r.onerror = (e) => reject(e);
      });
    },

    remove(id) {
      return new Promise((resolve, reject) => {
        if (!_db) {
          const all = this.getBackup().filter((r) => r.id !== id);
          localStorage.setItem(BACKUP_KEY, JSON.stringify(all));
          return resolve();
        }
        const store = this._tx("readwrite");
        const r = store.delete(id);
        r.onsuccess = () => {
          this._backup();
          resolve();
        };
        r.onerror = (e) => reject(e);
      });
    },

    getById(id) {
      return new Promise((resolve, reject) => {
        if (!_db) {
          return resolve(this.getBackup().find((r) => r.id === id) || null);
        }
        const r = this._tx().get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = (e) => reject(e);
      });
    },

    getAll() {
      return new Promise((resolve, reject) => {
        if (!_db) return resolve(this.getBackup());
        const r = this._tx().getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = (e) => reject(e);
      });
    },

    clearAll() {
      return new Promise((resolve, reject) => {
        localStorage.removeItem(BACKUP_KEY);
        if (!_db) return resolve();
        const r = this._tx("readwrite").clear();
        r.onsuccess = () => resolve();
        r.onerror = (e) => reject(e);
      });
    },

    /* ---------- Consultas filtradas ---------- */
    async query(filtros = {}) {
      let all = await this.getAll();
      const f = filtros;
      if (f.rua) {
        const rua = f.rua.toUpperCase().trim();
        all = all.filter((r) => (r.rua || "").toUpperCase() === rua);
      }
      if (f.ruaContains) {
        const q = f.ruaContains.toUpperCase().trim();
        all = all.filter((r) => (r.rua || "").toUpperCase().includes(q));
      }
      if (f.operador) all = all.filter((r) => r.operador === f.operador);
      if (f.turno) all = all.filter((r) => r.turno === f.turno);
      if (f.data) all = all.filter((r) => r.data === f.data);
      if (f.dataInicial) all = all.filter((r) => r.data >= f.dataInicial);
      if (f.dataFinal) all = all.filter((r) => r.data <= f.dataFinal);
      if (f.texto) {
        const q = f.texto.toLowerCase().trim();
        all = all.filter((r) =>
          [r.rua, r.produto, r.operador, r.data, r.lider]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );
      }
      // ordena mais recente primeiro
      all.sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || "")
      );
      return all;
    },

    /* ---------- Importação em lote ---------- */
    async bulkImport(registros, { evitarDuplicados = true } = {}) {
      const existentes = await this.getAll();
      const chaves = new Set(
        existentes.map((r) => this._dupKey(r))
      );
      let inseridos = 0,
        ignorados = 0;
      for (const reg of registros) {
        const rec = this._normalize(reg);
        const key = this._dupKey(rec);
        if (evitarDuplicados && chaves.has(key)) {
          ignorados++;
          continue;
        }
        rec.id = rec.id || Utils.uid();
        rec.createdAt = rec.createdAt || rec.dataHora || Utils.timestamp();
        rec.updatedAt = Utils.timestamp();
        await this.create(rec);
        chaves.add(key);
        inseridos++;
      }
      return { inseridos, ignorados };
    },

    _dupKey(r) {
      return [
        r.data,
        r.turno,
        (r.rua || "").toUpperCase(),
        (r.produto || "").toUpperCase(),
        r.operador,
        r.quantidadeSistema,
        r.quantidadeFisica,
      ].join("|");
    },

    /* ---------- Normalização de registro ---------- */
    _normalize(r) {
      const sistema = Number(r.quantidadeSistema) || 0;
      const fisico = Number(r.quantidadeFisica) || 0;
      const now = new Date();
      return {
        id: r.id || null,
        rua: Utils.sanitize(r.rua).toUpperCase(),
        produto: Utils.sanitize(r.produto),
        quantidadeSistema: sistema,
        quantidadeFisica: fisico,
        diferenca: fisico - sistema,
        operador: Utils.sanitize(r.operador),
        lider: Utils.sanitize(r.lider) || "lider/supervisor",
        observacao: fisico - sistema !== 0 ? Utils.sanitize(r.observacao || "") : "",
        data: r.data || Utils.toISODate(now),
        turno: r.turno || Utils.getTurno(now),
        dataHora: r.dataHora || Utils.timestamp(now),
        createdAt: r.createdAt || null,
        updatedAt: r.updatedAt || null,
      };
    },

    /* ---------- Preferências (tema etc.) ---------- */
    getPrefs() {
      try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      } catch {
        return {};
      }
    },
    setPref(key, value) {
      const p = this.getPrefs();
      p[key] = value;
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    },
  };

  /* =============================================================
     Integração com a API REST (Node.js + JSON no servidor).
     Estratégia híbrida offline-first:
       • Online  -> servidor é a fonte da verdade. Escritas vão para
                    a API e o IndexedDB é atualizado como cache.
       • Offline -> usa o IndexedDB local normalmente (PWA).
     Mantém a MESMA interface pública — app.js não muda.
     ============================================================= */
  const _local = {
    create: Storage.create.bind(Storage),
    update: Storage.update.bind(Storage),
    remove: Storage.remove.bind(Storage),
    clearAll: Storage.clearAll.bind(Storage),
  };

  // substitui registros locais pelo conjunto vindo do servidor
  Storage._replaceLocal = async function (registros) {
    await _local.clearAll();
    for (const r of registros) {
      // preserva id/datas vindos do servidor
      await _local.create(r);
    }
  };

  // tenta sincronizar a partir do servidor (chamado no init)
  Storage.syncFromServer = async function () {
    const Api = CE.Api;
    if (!Api) return false;
    const online = await Api.ping();
    if (!online) return false;
    try {
      const remotos = await Api.listar();
      await this._replaceLocal(remotos);
      return true;
    } catch (e) {
      console.warn("Sync inicial falhou; usando dados locais.", e);
      return false;
    }
  };

  // sobrescreve create/update/remove para espelhar no servidor quando online
  Storage.create = async function (registro) {
    const Api = CE.Api;
    if (Api && Api.isOnline()) {
      try {
        const salvo = await Api.salvar(registro);
        await _local.create(salvo); // cache local com id do servidor
        return salvo;
      } catch (e) {
        console.warn("Falha ao salvar no servidor; salvando local.", e);
      }
    }
    return _local.create(registro);
  };

  Storage.update = async function (id, dados) {
    const Api = CE.Api;
    if (Api && Api.isOnline()) {
      try {
        const salvo = await Api.editar(id, dados);
        await _local.update(id, salvo);
        return salvo;
      } catch (e) {
        console.warn("Falha ao editar no servidor; editando local.", e);
      }
    }
    return _local.update(id, dados);
  };

  Storage.remove = async function (id) {
    const Api = CE.Api;
    if (Api && Api.isOnline()) {
      try {
        await Api.excluir(id);
      } catch (e) {
        console.warn("Falha ao excluir no servidor; excluindo local.", e);
      }
    }
    return _local.remove(id);
  };

  CE.Storage = Storage;
})();
