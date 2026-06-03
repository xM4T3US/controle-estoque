/* =============================================================
   CONTROLE DE ESTOQUE — reports.js
   Exportação de relatórios: JSON (por dia/turno), CSV e PDF
   ============================================================= */
(function () {
  "use strict";

  const CE = (window.CE = window.CE || {});
  const { Utils, Storage } = CE;

  const Reports = {
    /* Agrupa registros em estrutura { "AAAA-MM-DD_TURNO": {data,turno,lider,registros[]} } */
    groupByDayTurno(registros) {
      const grupos = {};
      for (const r of registros) {
        const chave = Utils.jsonFileName(r.data, r.turno).replace(".json", "");
        if (!grupos[chave]) {
          grupos[chave] = {
            data: r.data,
            turno: r.turno,
            lider: r.lider || "lider/supervisor",
            registros: [],
          };
        }
        grupos[chave].registros.push({
          rua: r.rua,
          produto: r.produto,
          quantidadeSistema: r.quantidadeSistema,
          quantidadeFisica: r.quantidadeFisica,
          diferenca: r.diferenca,
          operador: r.operador,
          observacao: r.observacao || "",
          dataHora: r.dataHora,
        });
      }
      return grupos;
    },

    /* Exporta TODOS os registros num único arquivo JSON consolidado */
    async exportAllJSON() {
      const all = await Storage.getAll();
      const grupos = this.groupByDayTurno(all);
      const payload = {
        exportadoEm: Utils.timestamp(),
        totalRegistros: all.length,
        arquivos: grupos,
      };
      Utils.download(
        `controle_estoque_${Utils.toISODate()}.json`,
        JSON.stringify(payload, null, 2)
      );
    },

    /* Exporta um único dia/turno no formato AAAA-MM-DD_TURNO.json */
    async exportDayTurno(data, turno) {
      const regs = await Storage.query({ data, turno });
      const grupo = this.groupByDayTurno(regs);
      const chave = `${data}_${turno}`;
      const conteudo = grupo[chave] || {
        data,
        turno,
        lider: "lider/supervisor",
        registros: [],
      };
      Utils.download(
        Utils.jsonFileName(data, turno),
        JSON.stringify(conteudo, null, 2)
      );
    },

    /* CSV de uma lista de registros */
    exportCSV(registros, filename = `controle_estoque_${Utils.toISODate()}.csv`) {
      const head = [
        "Data",
        "Turno",
        "Rua",
        "Produto",
        "Qt. Sistema",
        "Qt. Fisico",
        "Diferenca",
        "Operador",
        "Lider",
        "Observacao",
        "DataHora",
      ];
      const rows = registros.map((r) => [
        Utils.formatDateBR(r.data),
        Utils.turnoLabel(r.turno),
        r.rua,
        r.produto,
        r.quantidadeSistema,
        r.quantidadeFisica,
        r.diferenca,
        r.operador,
        r.lider,
        r.observacao || "",
        r.dataHora,
      ]);
      const csv = [head, ...rows]
        .map((row) =>
          row
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(";")
        )
        .join("\r\n");
      // BOM para acentuação correta no Excel
      Utils.download(filename, "\uFEFF" + csv, "text/csv;charset=utf-8");
    },

    /* PDF via jsPDF + autotable (cacheado pelo Service Worker p/ offline).
       Fallback: window.print() caso a lib não esteja disponível. */
    exportPDF(registros, titulo = "Controle de Estoque") {
      const jsPDFns = window.jspdf;
      if (!jsPDFns || !jsPDFns.jsPDF) {
        this._printFallback(registros, titulo);
        return;
      }
      const { jsPDF } = jsPDFns;
      const doc = new jsPDF({ orientation: "landscape" });

      doc.setFontSize(15);
      doc.text(titulo, 14, 15);
      doc.setFontSize(9);
      doc.text(
        `Gerado em ${Utils.formatTimestampBR(Utils.timestamp())}  •  Líder: lider/supervisor  •  ${registros.length} registro(s)`,
        14,
        21
      );

      const body = registros.map((r) => [
        Utils.formatDateBR(r.data),
        Utils.turnoLabel(r.turno),
        r.rua,
        r.produto,
        r.quantidadeSistema,
        r.quantidadeFisica,
        Utils.diffText(r.diferenca),
        r.operador,
        r.observacao || "",
      ]);

      doc.autoTable({
        head: [
          [
            "Data",
            "Turno",
            "Rua",
            "Produto",
            "Sistema",
            "Físico",
            "Dif.",
            "Operador",
            "Observação",
          ],
        ],
        body,
        startY: 26,
        styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 8: { cellWidth: 70 } },
        headStyles: { fillColor: [24, 33, 47] },
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 6) {
            const v = parseInt(d.cell.raw, 10);
            if (v > 0) d.cell.styles.textColor = [21, 128, 61];
            else if (v < 0) d.cell.styles.textColor = [185, 28, 28];
          }
        },
      });

      doc.save(`controle_estoque_${Utils.toISODate()}.pdf`);
    },

    _printFallback(registros, titulo) {
      const win = window.open("", "_blank");
      const rows = registros
        .map(
          (r) => `<tr>
            <td>${Utils.formatDateBR(r.data)}</td>
            <td>${Utils.turnoLabel(r.turno)}</td>
            <td>${Utils.escapeHtml(r.rua)}</td>
            <td>${Utils.escapeHtml(r.produto)}</td>
            <td style="text-align:right">${r.quantidadeSistema}</td>
            <td style="text-align:right">${r.quantidadeFisica}</td>
            <td style="text-align:right;color:${
              r.diferenca > 0 ? "#15803d" : r.diferenca < 0 ? "#b91c1c" : "#555"
            }">${Utils.diffText(r.diferenca)}</td>
            <td>${Utils.escapeHtml(r.operador)}</td>
          </tr>`
        )
        .join("");
      win.document.write(`<!doctype html><html><head><meta charset="utf-8">
        <title>${titulo}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;color:#111}
          h1{font-size:18px;margin:0 0 4px}
          p{font-size:12px;color:#555;margin:0 0 16px}
          table{width:100%;border-collapse:collapse;font-size:11px}
          th,td{border:1px solid #ccc;padding:5px 7px}
          th{background:#18212f;color:#fff;text-align:left}
        </style></head><body>
        <h1>${titulo}</h1>
        <p>Gerado em ${Utils.formatTimestampBR(Utils.timestamp())} • Líder: lider/supervisor • ${registros.length} registro(s)</p>
        <table><thead><tr>
          <th>Data</th><th>Turno</th><th>Rua</th><th>Produto</th>
          <th>Sistema</th><th>Físico</th><th>Dif.</th><th>Operador</th>
        </tr></thead><tbody>${rows}</tbody></table>
        <script>window.onload=function(){window.print();}</script>
        </body></html>`);
      win.document.close();
    },
  };

  CE.Reports = Reports;
})();
