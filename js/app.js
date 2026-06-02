/* =============================================================
   CONTROLE DE ESTOQUE — app.js
   Controlador principal da interface (views, formulário, tabela,
   dashboard, pesquisa/auditoria, modais, importação e PWA)
   ============================================================= */
(function () {
  "use strict";

  const CE = (window.CE = window.CE || {});
  const { Utils, Storage, Reports } = CE;

  const App = {
    editId: null,
    deferredInstall: null,
    cacheRegistros: [],

    async init() {
      await Storage.init();
      this.applyTheme();
      this.startClock();
      this.bindEvents();
      this.fillFormDefaults();
      this.setText("currentYear", new Date().getFullYear());
      await this.refreshAll();
      this.registerSW();
      this.setupInstall();
    },

    /* ================= RELÓGIO / HEADER ================= */
    startClock() {
      const tick = () => {
        const now = new Date();
        const turno = Utils.getTurno(now);
        this.setText("hdrData", Utils.formatDateBR(Utils.toISODate(now)));
        this.setText("hdrHora", Utils.formatTime(now));
        this.setText("hdrTurno", Utils.turnoLabel(turno));
        // Atualiza campos do formulário somente se não estiver editando
        if (!this.editId) {
          this.setVal("f-data", Utils.formatDateBR(Utils.toISODate(now)));
          this.setVal("f-hora", Utils.formatTime(now));
          this.setVal("f-turno", Utils.turnoLabel(turno));
        }
      };
      tick();
      setInterval(tick, 1000);
    },

    fillFormDefaults() {
      this.setVal("f-lider", "Mateus");
      const now = new Date();
      this.setVal("f-data", Utils.formatDateBR(Utils.toISODate(now)));
      this.setVal("f-hora", Utils.formatTime(now));
      this.setVal("f-turno", Utils.turnoLabel(Utils.getTurno(now)));
    },

    /* ================= EVENTOS ================= */
    bindEvents() {
      // Navegação (sidebar)
      document.querySelectorAll("[data-nav]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          this.showView(el.dataset.nav);
          this.closeOffcanvas();
        });
      });

      // Ações da sidebar
      document.querySelectorAll("[data-action]").forEach((el) => {
        el.addEventListener("click", (e) => {
          e.preventDefault();
          this.handleAction(el.dataset.action);
        });
      });

      // Formulário
      const form = document.getElementById("formRegistro");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.salvarRegistro();
      });
      ["f-sistema", "f-fisico"].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener("input", () => this.atualizarPreviewDiff());
      });
      document
        .getElementById("btnCancelarEdicao")
        .addEventListener("click", () => this.cancelarEdicao());

      // Busca global (tempo real)
      const busca = document.getElementById("buscaGlobal");
      busca.addEventListener(
        "input",
        Utils.debounce(() => this.renderTabela(), 200)
      );

      // Exportações da toolbar
      document
        .getElementById("tbExportJson")
        .addEventListener("click", () => Reports.exportAllJSON());
      document
        .getElementById("tbExportCsv")
        .addEventListener("click", () => this.exportarVisivelCSV());
      document
        .getElementById("tbExportPdf")
        .addEventListener("click", () => this.exportarVisivelPDF());

      // Pesquisa por rua
      document
        .getElementById("btnPesquisar")
        .addEventListener("click", () => this.executarPesquisa());

      // Modal editar — busca
      document
        .getElementById("editBusca")
        .addEventListener(
          "input",
          Utils.debounce(() => this.renderListaEditar(), 200)
        );

      // Config
      document
        .getElementById("cfgCsv")
        .addEventListener("click", () => this.exportarTudoCSV());
      document
        .getElementById("cfgPdf")
        .addEventListener("click", () => this.exportarTudoPDF());
      document
        .getElementById("cfgLimpar")
        .addEventListener("click", () => this.limparDados());

      // Importação
      document
        .getElementById("inputImport")
        .addEventListener("change", (e) => this.importarJSON(e));

      // Botão instalar (config)
      document
        .getElementById("btnInstalar")
        .addEventListener("click", () => this.instalarApp());
    },

    handleAction(action) {
      switch (action) {
        case "tema":
          this.toggleTheme();
          break;
        case "exportar-json":
          Reports.exportAllJSON();
          this.toast("Exportação JSON gerada.", "ok");
          this.closeOffcanvas();
          break;
        case "importar":
          document.getElementById("inputImport").click();
          this.closeOffcanvas();
          break;
        case "editar":
          this.abrirModalEditar();
          this.closeOffcanvas();
          break;
        case "config":
          this.abrirModalConfig();
          this.closeOffcanvas();
          break;
      }
    },

    /* ================= VIEWS ================= */
    showView(name) {
      document
        .querySelectorAll(".view")
        .forEach((v) => v.classList.remove("view--active"));
      const el = document.getElementById("view-" + name);
      if (el) el.classList.add("view--active");
      document.querySelectorAll("[data-nav]").forEach((n) => {
        n.classList.toggle("active", n.dataset.nav === name);
      });
      if (name === "dashboard") this.renderDashboard();
      if (name === "historico") this.renderHistorico();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },

    closeOffcanvas() {
      const oc = document.getElementById("sidebar");
      const inst = bootstrap.Offcanvas.getInstance(oc);
      if (inst) inst.hide();
    },

    /* ================= REGISTRO (FORM) ================= */
    atualizarPreviewDiff() {
      const sis = parseInt(document.getElementById("f-sistema").value, 10);
      const fis = parseInt(document.getElementById("f-fisico").value, 10);
      const box = document.getElementById("f-diff-preview");
      if (Number.isNaN(sis) || Number.isNaN(fis)) {
        box.textContent = "—";
        box.className = "diff-badge diff-zero";
        return;
      }
      const diff = fis - sis;
      box.textContent = Utils.diffText(diff);
      box.className = "diff-badge " + Utils.diffClass(diff);
    },

    async salvarRegistro() {
      const rua = document.getElementById("f-rua").value;
      const produto = document.getElementById("f-produto").value;
      const sistema = document.getElementById("f-sistema").value;
      const fisico = document.getElementById("f-fisico").value;
      const operador = document.getElementById("f-operador").value;

      // Validação
      if (!Utils.sanitize(rua)) return this.toast("Informe a RUA.", "err");
      if (!Utils.sanitize(produto))
        return this.toast("Informe o PRODUTO.", "err");
      if (sistema === "" || Number.isNaN(Number(sistema)))
        return this.toast("Quantidade Sistema inválida.", "err");
      if (fisico === "" || Number.isNaN(Number(fisico)))
        return this.toast("Quantidade Física inválida.", "err");
      if (!operador) return this.toast("Selecione o OPERADOR.", "err");

      const dados = {
        rua,
        produto,
        quantidadeSistema: Number(sistema),
        quantidadeFisica: Number(fisico),
        operador,
        lider: "Mateus",
      };

      try {
        if (this.editId) {
          await Storage.update(this.editId, dados);
          this.toast("Registro atualizado com sucesso.", "ok");
          this.cancelarEdicao();
        } else {
          await Storage.create(dados);
          this.toast("Registro salvo com sucesso.", "ok");
          this.resetForm();
        }
        await this.refreshAll();
      } catch (err) {
        console.error(err);
        this.toast("Erro ao salvar registro.", "err");
      }
    },

    resetForm() {
      document.getElementById("f-rua").value = "";
      document.getElementById("f-produto").value = "";
      document.getElementById("f-sistema").value = "";
      document.getElementById("f-fisico").value = "";
      document.getElementById("f-operador").value = "";
      this.atualizarPreviewDiff();
      document.getElementById("f-rua").focus();
    },

    async editarRegistro(id) {
      const r = await Storage.getById(id);
      if (!r) return this.toast("Registro não encontrado.", "err");
      this.editId = id;
      document.getElementById("f-rua").value = r.rua;
      document.getElementById("f-produto").value = r.produto;
      document.getElementById("f-sistema").value = r.quantidadeSistema;
      document.getElementById("f-fisico").value = r.quantidadeFisica;
      document.getElementById("f-operador").value = r.operador;
      document.getElementById("f-data").value = Utils.formatDateBR(r.data);
      document.getElementById("f-turno").value = Utils.turnoLabel(r.turno);
      this.atualizarPreviewDiff();
      document.getElementById("btnSalvar").innerHTML =
        '<i class="bi bi-check2-circle"></i> Atualizar registro';
      document.getElementById("btnCancelarEdicao").classList.remove("d-none");
      document.getElementById("formTitulo").textContent = "Editar conferência";
      this.showView("registro");
      document
        .getElementById("formRegistro")
        .scrollIntoView({ behavior: "smooth" });
    },

    cancelarEdicao() {
      this.editId = null;
      document.getElementById("btnSalvar").innerHTML =
        '<i class="bi bi-save2"></i> Salvar registro';
      document.getElementById("btnCancelarEdicao").classList.add("d-none");
      document.getElementById("formTitulo").textContent = "Nova conferência";
      this.resetForm();
      this.fillFormDefaults();
    },

    async excluirRegistro(id) {
      if (!confirm("Confirma a exclusão deste registro? Esta ação não pode ser desfeita."))
        return;
      await Storage.remove(id);
      this.toast("Registro excluído.", "ok");
      if (this.editId === id) this.cancelarEdicao();
      await this.refreshAll();
    },

    /* ================= TABELA ================= */
    async refreshAll() {
      this.cacheRegistros = await Storage.query({});
      this.renderTabela();
      this.renderDashboard();
    },

    renderTabela() {
      const termo = document.getElementById("buscaGlobal").value.toLowerCase();
      let lista = this.cacheRegistros;
      if (termo) {
        lista = lista.filter((r) =>
          [r.rua, r.produto, r.operador, r.data, r.lider]
            .join(" ")
            .toLowerCase()
            .includes(termo)
        );
      }
      const tbody = document.getElementById("tabelaRegistros");
      this.setText("contadorRegistros", lista.length);

      if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty-row">
          <i class="bi bi-inbox"></i> Nenhum registro encontrado.
        </td></tr>`;
        return;
      }

      tbody.innerHTML = lista
        .map((r) => {
          const diff = r.diferenca;
          return `<tr>
            <td class="cell-rua">${Utils.escapeHtml(r.rua)}</td>
            <td>${Utils.escapeHtml(r.produto)}</td>
            <td class="num">${r.quantidadeSistema}</td>
            <td class="num">${r.quantidadeFisica}</td>
            <td class="num"><span class="diff-badge ${Utils.diffClass(
              diff
            )}">${Utils.diffText(diff)}</span></td>
            <td>${Utils.escapeHtml(r.operador)}</td>
            <td>${Utils.escapeHtml(r.lider)}</td>
            <td class="nowrap">${Utils.formatDateBR(r.data)}</td>
            <td>${Utils.turnoLabel(r.turno)}</td>
            <td class="nowrap acoes">
              <button class="btn-icon" title="Editar" data-edit="${r.id}">
                <i class="bi bi-pencil-square"></i></button>
              <button class="btn-icon danger" title="Excluir" data-del="${r.id}">
                <i class="bi bi-trash3"></i></button>
            </td>
          </tr>`;
        })
        .join("");

      tbody.querySelectorAll("[data-edit]").forEach((b) =>
        b.addEventListener("click", () => this.editarRegistro(b.dataset.edit))
      );
      tbody.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", () => this.excluirRegistro(b.dataset.del))
      );
    },

    exportarVisivelCSV() {
      const termo = document.getElementById("buscaGlobal").value.toLowerCase();
      let lista = this.cacheRegistros;
      if (termo)
        lista = lista.filter((r) =>
          [r.rua, r.produto, r.operador, r.data]
            .join(" ")
            .toLowerCase()
            .includes(termo)
        );
      if (!lista.length) return this.toast("Nada para exportar.", "err");
      Reports.exportCSV(lista);
      this.toast("CSV gerado.", "ok");
    },
    exportarVisivelPDF() {
      const termo = document.getElementById("buscaGlobal").value.toLowerCase();
      let lista = this.cacheRegistros;
      if (termo)
        lista = lista.filter((r) =>
          [r.rua, r.produto, r.operador, r.data]
            .join(" ")
            .toLowerCase()
            .includes(termo)
        );
      if (!lista.length) return this.toast("Nada para exportar.", "err");
      Reports.exportPDF(lista, "Controle de Estoque — Registros");
      this.toast("PDF gerado.", "ok");
    },

    /* ================= DASHBOARD ================= */
    async renderDashboard() {
      const all = this.cacheRegistros.length
        ? this.cacheRegistros
        : await Storage.getAll();
      const hoje = Utils.toISODate();
      const doDia = all.filter((r) => r.data === hoje);
      const produtosDistintos = new Set(doDia.map((r) => r.produto.toUpperCase()))
        .size;
      const divergencias = doDia.filter((r) => r.diferenca !== 0).length;
      const taxa = doDia.length
        ? ((divergencias / doDia.length) * 100).toFixed(1)
        : "0.0";

      this.setText("dashConferencias", doDia.length);
      this.setText("dashProdutos", produtosDistintos);
      this.setText("dashDivergencias", divergencias);
      this.setText("dashTaxa", taxa + "%");

      // Resumo geral (todos os tempos)
      const totalDiv = all.filter((r) => r.diferenca !== 0).length;
      this.setText("dashTotalGeral", all.length);
      this.setText("dashDivGeral", totalDiv);
      this.setText(
        "dashTaxaGeral",
        all.length ? ((totalDiv / all.length) * 100).toFixed(1) + "%" : "0%"
      );
    },

    /* ================= HISTÓRICO ================= */
    async renderHistorico() {
      const all = await Storage.getAll();
      const grupos = Reports.groupByDayTurno(all);
      const chaves = Object.keys(grupos).sort().reverse();
      const cont = document.getElementById("listaHistorico");

      if (!chaves.length) {
        cont.innerHTML = `<div class="empty-card"><i class="bi bi-archive"></i>
          Nenhum arquivo de conferência registrado ainda.</div>`;
        return;
      }

      cont.innerHTML = chaves
        .map((k) => {
          const g = grupos[k];
          const divs = g.registros.filter((r) => r.diferenca !== 0).length;
          return `<div class="hist-card">
            <div class="hist-head">
              <div>
                <span class="hist-date">${Utils.formatDateBR(g.data)}</span>
                <span class="badge-turno turno-${g.turno}">${Utils.turnoLabel(
            g.turno
          )}</span>
              </div>
              <code class="hist-file">${k}.json</code>
            </div>
            <div class="hist-meta">
              <span><i class="bi bi-list-check"></i> ${
                g.registros.length
              } registro(s)</span>
              <span class="${divs ? "txt-danger" : "txt-muted"}">
                <i class="bi bi-exclamation-diamond"></i> ${divs} divergência(s)</span>
              <span><i class="bi bi-person-badge"></i> Líder: ${Utils.escapeHtml(
                g.lider
              )}</span>
            </div>
            <div class="hist-actions">
              <button class="btn btn-sm btn-outline" data-hist-ver="${k}">
                <i class="bi bi-eye"></i> Visualizar</button>
              <button class="btn btn-sm btn-outline" data-hist-json="${k}">
                <i class="bi bi-filetype-json"></i> JSON</button>
              <button class="btn btn-sm btn-outline" data-hist-csv="${k}">
                <i class="bi bi-filetype-csv"></i> CSV</button>
              <button class="btn btn-sm btn-outline danger" data-hist-del="${k}">
                <i class="bi bi-trash3"></i> Excluir</button>
            </div>
            <div class="hist-detail d-none" id="hist-detail-${k}"></div>
          </div>`;
        })
        .join("");

      // Bind ações
      cont.querySelectorAll("[data-hist-ver]").forEach((b) =>
        b.addEventListener("click", () =>
          this.toggleHistDetalhe(b.dataset.histVer, grupos)
        )
      );
      cont.querySelectorAll("[data-hist-json]").forEach((b) =>
        b.addEventListener("click", () => {
          const g = grupos[b.dataset.histJson];
          Reports.exportDayTurno(g.data, g.turno);
        })
      );
      cont.querySelectorAll("[data-hist-csv]").forEach((b) =>
        b.addEventListener("click", () => {
          const g = grupos[b.dataset.histCsv];
          Reports.exportCSV(
            g.registros.map((r) => ({ ...r, data: g.data, turno: g.turno, lider: g.lider })),
            `${b.dataset.histCsv}.csv`
          );
        })
      );
      cont.querySelectorAll("[data-hist-del]").forEach((b) =>
        b.addEventListener("click", () =>
          this.excluirGrupo(b.dataset.histDel, grupos)
        )
      );
    },

    toggleHistDetalhe(chave, grupos) {
      const box = document.getElementById("hist-detail-" + chave);
      if (!box) return;
      if (!box.classList.contains("d-none")) {
        box.classList.add("d-none");
        return;
      }
      const g = grupos[chave];
      box.innerHTML = `<table class="mini-table"><thead><tr>
        <th>Rua</th><th>Produto</th><th>Sis.</th><th>Fís.</th><th>Dif.</th><th>Operador</th>
        </tr></thead><tbody>${g.registros
          .map(
            (r) => `<tr>
            <td>${Utils.escapeHtml(r.rua)}</td>
            <td>${Utils.escapeHtml(r.produto)}</td>
            <td class="num">${r.quantidadeSistema}</td>
            <td class="num">${r.quantidadeFisica}</td>
            <td class="num"><span class="diff-badge ${Utils.diffClass(
              r.diferenca
            )}">${Utils.diffText(r.diferenca)}</span></td>
            <td>${Utils.escapeHtml(r.operador)}</td></tr>`
          )
          .join("")}</tbody></table>`;
      box.classList.remove("d-none");
    },

    async excluirGrupo(chave, grupos) {
      const g = grupos[chave];
      if (
        !confirm(
          `Excluir TODOS os ${g.registros.length} registros de ${Utils.formatDateBR(
            g.data
          )} (${Utils.turnoLabel(g.turno)})?`
        )
      )
        return;
      const alvos = await Storage.query({ data: g.data, turno: g.turno });
      for (const r of alvos) await Storage.remove(r.id);
      this.toast("Arquivo de conferência excluído.", "ok");
      await this.refreshAll();
      this.renderHistorico();
    },

    /* ================= PESQUISAR RUA + AUDITORIA ================= */
    async executarPesquisa() {
      const rua = document.getElementById("p-rua").value;
      if (!Utils.sanitize(rua))
        return this.toast("Informe a RUA para pesquisar.", "err");
      const filtros = {
        rua,
        dataInicial: document.getElementById("p-dataIni").value || undefined,
        dataFinal: document.getElementById("p-dataFim").value || undefined,
        operador: document.getElementById("p-operador").value || undefined,
      };
      const res = await Storage.query(filtros);

      // Resumo
      const divs = res.filter((r) => r.diferenca !== 0);
      const operadores = [...new Set(res.map((r) => r.operador))];
      const ultima = res[0];
      document.getElementById("pesquisaResumo").innerHTML = `
        <div class="resumo-grid">
          <div class="resumo-item"><span>Rua</span><strong>${Utils.escapeHtml(
            rua.toUpperCase()
          )}</strong></div>
          <div class="resumo-item"><span>Total de Conferências</span><strong>${
            res.length
          }</strong></div>
          <div class="resumo-item"><span>Divergências</span><strong class="txt-danger">${
            divs.length
          }</strong></div>
          <div class="resumo-item"><span>Sem Divergência</span><strong class="txt-ok">${
            res.length - divs.length
          }</strong></div>
          <div class="resumo-item"><span>Última Conferência</span><strong>${
            ultima
              ? Utils.formatDateBR(ultima.data) +
                " · " +
                Utils.turnoLabel(ultima.turno)
              : "—"
          }</strong></div>
          <div class="resumo-item"><span>Operadores</span><strong>${
            operadores.length ? operadores.map(Utils.escapeHtml).join(", ") : "—"
          }</strong></div>
        </div>`;

      // Resultados
      const tb = document.getElementById("pesquisaResultados");
      tb.innerHTML = res.length
        ? res
            .map(
              (r) => `<tr>
          <td class="nowrap">${Utils.formatDateBR(r.data)}</td>
          <td>${Utils.turnoLabel(r.turno)}</td>
          <td>${Utils.escapeHtml(r.rua)}</td>
          <td>${Utils.escapeHtml(r.produto)}</td>
          <td class="num">${r.quantidadeSistema}</td>
          <td class="num">${r.quantidadeFisica}</td>
          <td class="num"><span class="diff-badge ${Utils.diffClass(
            r.diferenca
          )}">${Utils.diffText(r.diferenca)}</span></td>
          <td>${Utils.escapeHtml(r.operador)}</td>
          <td>${Utils.escapeHtml(r.lider)}</td></tr>`
            )
            .join("")
        : `<tr><td colspan="9" class="empty-row">Nenhum resultado.</td></tr>`;

      // Histórico de divergências
      const divBox = document.getElementById("pesquisaDivergencias");
      divBox.innerHTML = divs.length
        ? `<table class="mini-table"><thead><tr>
            <th>Data</th><th>Produto</th><th>Sis.</th><th>Fís.</th><th>Dif.</th>
            </tr></thead><tbody>${divs
              .map(
                (r) => `<tr>
              <td>${Utils.formatDateBR(r.data)}</td>
              <td>${Utils.escapeHtml(r.produto)}</td>
              <td class="num">${r.quantidadeSistema}</td>
              <td class="num">${r.quantidadeFisica}</td>
              <td class="num"><span class="diff-badge ${Utils.diffClass(
                r.diferenca
              )}">${Utils.diffText(r.diferenca)}</span></td></tr>`
              )
              .join("")}</tbody></table>`
        : `<p class="txt-muted mb-0"><i class="bi bi-check-circle"></i> Nenhuma divergência registrada para esta rua.</p>`;

      // Auditoria (timeline) — mais recente primeiro
      const audit = document.getElementById("pesquisaAuditoria");
      audit.innerHTML = res.length
        ? res
            .map((r) => {
              const ok = r.diferenca === 0;
              return `<div class="tl-item ${ok ? "tl-ok" : "tl-div"}">
              <div class="tl-dot"></div>
              <div class="tl-body">
                <div class="tl-top">
                  <strong>${Utils.formatDateBR(r.data)} · ${Utils.turnoLabel(
                r.turno
              )}</strong>
                  <span class="diff-badge ${Utils.diffClass(
                    r.diferenca
                  )}">${ok ? "Sem divergência" : Utils.diffText(r.diferenca)}</span>
                </div>
                <div class="tl-sub">${Utils.escapeHtml(
                  r.produto
                )} • Operador: ${Utils.escapeHtml(r.operador)}</div>
              </div></div>`;
            })
            .join("")
        : `<p class="txt-muted">Sem histórico de auditoria.</p>`;

      // habilita export dos resultados
      this._ultimaPesquisa = res;
      document.getElementById("pesquisaExport").classList.toggle(
        "d-none",
        !res.length
      );
    },

    /* ================= MODAL EDITAR ================= */
    abrirModalEditar() {
      const m = new bootstrap.Modal(document.getElementById("modalEditar"));
      m.show();
      this.renderListaEditar();
    },
    async renderListaEditar() {
      const termo = document.getElementById("editBusca").value;
      const lista = await Storage.query(termo ? { texto: termo } : {});
      const cont = document.getElementById("editLista");
      if (!lista.length) {
        cont.innerHTML = `<p class="txt-muted text-center my-3">Nenhum registro.</p>`;
        return;
      }
      cont.innerHTML = lista
        .slice(0, 100)
        .map(
          (r) => `<div class="edit-item">
          <div class="edit-info">
            <strong>${Utils.escapeHtml(r.rua)}</strong> — ${Utils.escapeHtml(
            r.produto
          )}
            <span class="diff-badge ${Utils.diffClass(
              r.diferenca
            )}">${Utils.diffText(r.diferenca)}</span>
            <small class="d-block txt-muted">${Utils.formatDateBR(
              r.data
            )} · ${Utils.turnoLabel(r.turno)} · ${Utils.escapeHtml(
            r.operador
          )}</small>
          </div>
          <div class="edit-btns">
            <button class="btn-icon" data-medit="${r.id}"><i class="bi bi-pencil-square"></i></button>
            <button class="btn-icon danger" data-mdel="${r.id}"><i class="bi bi-trash3"></i></button>
          </div>
        </div>`
        )
        .join("");
      cont.querySelectorAll("[data-medit]").forEach((b) =>
        b.addEventListener("click", () => {
          bootstrap.Modal.getInstance(
            document.getElementById("modalEditar")
          ).hide();
          this.editarRegistro(b.dataset.medit);
        })
      );
      cont.querySelectorAll("[data-mdel]").forEach((b) =>
        b.addEventListener("click", async () => {
          await this.excluirRegistro(b.dataset.mdel);
          this.renderListaEditar();
        })
      );
    },

    /* ================= MODAL CONFIG ================= */
    async abrirModalConfig() {
      const all = await Storage.getAll();
      const backup = Storage.getBackup();
      this.setText("cfgBackupInfo", `${all.length} registro(s) • backup: ${backup.length}`);
      this.setText(
        "cfgThemeState",
        document.documentElement.dataset.theme === "dark" ? "Escuro" : "Claro"
      );
      new bootstrap.Modal(document.getElementById("modalConfig")).show();
    },
    async exportarTudoCSV() {
      const all = await Storage.getAll();
      if (!all.length) return this.toast("Nada para exportar.", "err");
      Reports.exportCSV(all);
      this.toast("CSV completo gerado.", "ok");
    },
    async exportarTudoPDF() {
      const all = await Storage.query({});
      if (!all.length) return this.toast("Nada para exportar.", "err");
      Reports.exportPDF(all, "Controle de Estoque — Completo");
      this.toast("PDF completo gerado.", "ok");
    },
    async limparDados() {
      if (
        !confirm(
          "ATENÇÃO: isso apagará TODOS os registros (IndexedDB e backup). Continuar?"
        )
      )
        return;
      if (!confirm("Tem certeza absoluta? Esta ação é irreversível.")) return;
      await Storage.clearAll();
      await this.refreshAll();
      this.toast("Todos os dados foram apagados.", "ok");
    },

    /* ================= IMPORTAÇÃO ================= */
    async importarJSON(e) {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const registros = this._extrairRegistros(json);
        if (!registros.length) {
          this.toast("Nenhum registro válido encontrado no arquivo.", "err");
        } else {
          const { inseridos, ignorados } = await Storage.bulkImport(registros, {
            evitarDuplicados: true,
          });
          await this.refreshAll();
          this.toast(
            `Importação concluída: ${inseridos} inserido(s), ${ignorados} duplicado(s) ignorado(s).`,
            "ok"
          );
        }
      } catch (err) {
        console.error(err);
        this.toast("Arquivo JSON inválido.", "err");
      } finally {
        e.target.value = "";
      }
    },

    // Aceita: array direto | {registros:[]} | {arquivos:{chave:{registros:[]}}}
    _extrairRegistros(json) {
      let regs = [];
      if (Array.isArray(json)) regs = json;
      else if (Array.isArray(json.registros)) {
        regs = json.registros.map((r) => ({
          ...r,
          data: r.data || json.data,
          turno: r.turno || json.turno,
          lider: r.lider || json.lider,
        }));
      } else if (json.arquivos && typeof json.arquivos === "object") {
        Object.values(json.arquivos).forEach((g) => {
          (g.registros || []).forEach((r) =>
            regs.push({
              ...r,
              data: r.data || g.data,
              turno: r.turno || g.turno,
              lider: r.lider || g.lider,
            })
          );
        });
      }
      return regs;
    },

    /* ================= TEMA ================= */
    applyTheme() {
      const prefs = Storage.getPrefs();
      const theme = prefs.theme || "light";
      document.documentElement.dataset.theme = theme;
    },
    toggleTheme() {
      const cur = document.documentElement.dataset.theme === "dark";
      const novo = cur ? "light" : "dark";
      document.documentElement.dataset.theme = novo;
      Storage.setPref("theme", novo);
      this.setText(
        "cfgThemeState",
        novo === "dark" ? "Escuro" : "Claro"
      );
    },

    /* ================= PWA ================= */
    registerSW() {
      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker
            .register("sw.js")
            .catch((err) => console.warn("SW falhou:", err));
        });
      }
    },
    setupInstall() {
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        this.deferredInstall = e;
        const btn = document.getElementById("btnInstalar");
        if (btn) btn.classList.remove("d-none");
      });
    },
    async instalarApp() {
      if (!this.deferredInstall)
        return this.toast(
          "Use o menu do navegador: 'Adicionar à tela inicial'.",
          "ok"
        );
      this.deferredInstall.prompt();
      await this.deferredInstall.userChoice;
      this.deferredInstall = null;
      document.getElementById("btnInstalar").classList.add("d-none");
    },

    /* ================= HELPERS UI ================= */
    setText(id, v) {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    },
    setVal(id, v) {
      const el = document.getElementById(id);
      if (el) el.value = v;
    },
    toast(msg, tipo = "ok") {
      const cont = document.getElementById("toastContainer");
      const div = document.createElement("div");
      div.className = `ce-toast ce-toast--${tipo}`;
      div.innerHTML = `<i class="bi ${
        tipo === "ok"
          ? "bi-check-circle-fill"
          : tipo === "err"
          ? "bi-x-circle-fill"
          : "bi-info-circle-fill"
      }"></i><span>${Utils.escapeHtml(msg)}</span>`;
      cont.appendChild(div);
      requestAnimationFrame(() => div.classList.add("show"));
      setTimeout(() => {
        div.classList.remove("show");
        setTimeout(() => div.remove(), 300);
      }, 3200);
    },
  };

  CE.App = App;
  document.addEventListener("DOMContentLoaded", () => App.init());

  // exporta para uso nos botões do modal pesquisa export
  window.exportarPesquisa = function (tipo) {
    const res = App._ultimaPesquisa || [];
    if (!res.length) return App.toast("Faça uma pesquisa primeiro.", "err");
    if (tipo === "csv") Reports.exportCSV(res, "pesquisa_rua.csv");
    else Reports.exportPDF(res, "Pesquisa por Rua");
  };
})();
