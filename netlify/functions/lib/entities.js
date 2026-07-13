// Converte testo + entities di Telegram (grassetto/corsivo scelti da Alessio
// scrivendo col tastierino della app) in HTML, cosi' il bot puo' rimandare lo
// stesso messaggio con la stessa formattazione (parse_mode: "HTML").
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function entitiesToHtml(text, entities = []) {
  const rilevanti = entities.filter(e => e.type === "bold" || e.type === "italic");
  const punti = new Set([0, text.length]);
  rilevanti.forEach(e => {
    punti.add(e.offset);
    punti.add(e.offset + e.length);
  });
  const bordi = [...punti].sort((a, b) => a - b);

  let html = "";
  for (let i = 0; i < bordi.length - 1; i++) {
    const inizio = bordi[i];
    const fine = bordi[i + 1];
    if (inizio >= fine) continue;
    let segmento = escapeHtml(text.slice(inizio, fine));
    const attive = rilevanti.filter(e => e.offset <= inizio && e.offset + e.length >= fine);
    for (const e of attive) {
      segmento = e.type === "bold" ? `<b>${segmento}</b>` : `<i>${segmento}</i>`;
    }
    html += segmento;
  }
  return html;
}

module.exports = { entitiesToHtml, escapeHtml };
