/* =============================================================
   CONTROLE DE ESTOQUE — utils.js
   Funções utilitárias: data, hora, turno, formatação, segurança
   ============================================================= */
(function () {
  "use strict";

  const CE = (window.CE = window.CE || {});

  const Utils = {
    /* ---- Data / Hora ---- */
    pad(n) {
      return String(n).padStart(2, "0");
    },

    // Objeto Date -> "YYYY-MM-DD"
    toISODate(d = new Date()) {
      return `${d.getFullYear()}-${this.pad(d.getMonth() + 1)}-${this.pad(d.getDate())}`;
    },

    // "YYYY-MM-DD" -> "DD/MM/YYYY"
    formatDateBR(iso) {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    },

    // Date -> "HH:mm:ss"
    formatTime(d = new Date()) {
      return `${this.pad(d.getHours())}:${this.pad(d.getMinutes())}:${this.pad(d.getSeconds())}`;
    },

    // Date -> "YYYY-MM-DD HH:mm:ss"
    timestamp(d = new Date()) {
      return `${this.toISODate(d)} ${this.formatTime(d)}`;
    },

    // "YYYY-MM-DD HH:mm:ss" -> "DD/MM/YYYY HH:mm"
    formatTimestampBR(ts) {
      if (!ts) return "";
      const [date, time = ""] = ts.split(" ");
      const hm = time.split(":").slice(0, 2).join(":");
      return `${this.formatDateBR(date)} ${hm}`.trim();
    },

    /* ---- Turno automático ----
       06:00–13:59 = MANHA | 14:00–21:59 = TARDE | 22:00–05:59 = NOITE */
    getTurno(d = new Date()) {
      const h = d.getHours();
      if (h >= 6 && h < 14) return "MANHA";
      if (h >= 14 && h < 22) return "TARDE";
      return "NOITE";
    },

    turnoLabel(t) {
      return { MANHA: "Manhã", TARDE: "Tarde", NOITE: "Noite" }[t] || t;
    },

    /* ---- Diferença ---- */
    calcDiferenca(fisico, sistema) {
      return Number(fisico) - Number(sistema);
    },

    // classe semântica para a diferença
    diffClass(diff) {
      if (diff > 0) return "diff-pos";
      if (diff < 0) return "diff-neg";
      return "diff-zero";
    },

    diffText(diff) {
      if (diff > 0) return `+${diff}`;
      return String(diff);
    },

    /* ---- Segurança: sanitização de texto ---- */
    sanitize(str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/[<>]/g, "") // remove tags básicas
        .trim();
    },

    // escapa para inserção segura em innerHTML
    escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str === null || str === undefined ? "" : String(str);
      return div.innerHTML;
    },

    /* ---- Misc ---- */
    uid() {
      return (
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      ).toUpperCase();
    },

    download(filename, content, mime = "application/json") {
      const blob =
        content instanceof Blob ? content : new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    },

    debounce(fn, wait = 250) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    // nome do arquivo JSON padrão: AAAA-MM-DD_TURNO.json
    jsonFileName(data, turno) {
      return `${data}_${turno}.json`;
    },
  };

  CE.Utils = Utils;
})();
