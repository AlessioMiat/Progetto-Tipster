// Macchina a stati del recap pubblico giornaliero — versione "dai dati"
// (niente screenshot, 2 agosto 2026). Flusso:
//   1. primo messaggio privato di Alessio nella giornata -> il bot calcola le
//      giocate vinte del giorno piu' recente con vittorie e gli manda un TESTO
//      GIA' PRECOMPILATO (didascalia) da modificare;
//   2. Alessio modifica e rimanda -> quel testo diventa la didascalia;
//   3. il bot genera la grafica DennyBet dai dati + didascalia -> anteprima;
//   4. Alessio risponde OK -> pubblica nel canale pubblico DennyBet
//      (ANNULLA scarta, qualsiasi altro testo = correzione).
const { leggiFileJson, scriviFileJson } = require("./github-files");
const { generaImmagineRecap } = require("./recap-image");
const { chiamaApi, inviaFoto } = require("./telegram");
const { entitiesToHtml, escapeHtml } = require("./entities");

const RECAP_PATH = "automazioni/recap-stato.json";
const ALESSIO_CHAT_ID = 628218072;
const DATA_INIZIO = "2026-08-01";
// Canale pubblico DennyBet: fallback all'id noto se la env var manca su Netlify.
const CHAT_PUBBLICO = process.env.TELEGRAM_CHAT_ID_PUBBLICO || "-1002381477114";

function elencoTipologie(vinte) {
  const nomi = { RaddoppioAI: "Raddoppio AI", QuoteBoostate: "Quote Boostate" };
  const uniche = [...new Set(vinte.map(v => nomi[v.tipologia] || v.tipologia))];
  if (uniche.length === 1) return uniche[0];
  return uniche.slice(0, -1).join(", ") + " e " + uniche[uniche.length - 1];
}

// Giorno piu' recente con almeno una vinta -> le sue giocate vinte + contesto.
async function ottieniVinte() {
  const { data } = await leggiFileJson(process.env.GITHUB_FILE_PATH);
  const core = data.giocate.filter(g => g.tipologia !== "Paracadute");
  const dateVinte = core.filter(g => g.esito === "vinta").map(g => g.data);
  if (dateVinte.length === 0) return null;
  const targetDate = dateVinte.sort().slice(-1)[0];
  const diGiorno = core.filter(g => g.data === targetDate);
  const vinte = diGiorno.filter(g => g.esito === "vinta");
  const profitUnita = diGiorno.reduce((t, g) => {
    if (g.esito === "vinta") return t + g.stake * (g.quota - 1);
    if (g.esito === "persa") return t - g.stake;
    return t;
  }, 0);
  return { targetDate, vinte, totaleGiocate: diGiorno.length, profitUnita };
}

// Testo didascalia gia' precompilato: Alessio lo modifica e lo rimanda.
function testoPrecompilato(vinte, totaleGiocate, profitUnita) {
  const tip = elencoTipologie(vinte);
  const seg = profitUnita >= 0 ? "+" : "";
  return (
    `<b>🤩 ${vinte.length} su ${totaleGiocate} nel privato 🏝️</b>\n` +
    `<i>${escapeHtml(tip)}</i> <i>in</i> <b>CASSA ✅</b>\n\n` +
    `✍️ Scrivi qui la tua frase\n\n` +
    `<i>👉🏻 Qui guardi 👀 nel privato</i> <b>VINCI 🤑</b>\n` +
    `📈 Giornata da ${seg}${profitUnita.toFixed(1)} unità\n` +
    `Scrivi a @Denny_Bet`
  );
}

async function componiRecap(stato) {
  const buffer = await generaImmagineRecap(stato.vinte);
  return { buffer, caption: stato.testoFinale };
}

async function inviaAnteprima(stato) {
  const { buffer, caption } = await componiRecap(stato);
  await inviaFoto(ALESSIO_CHAT_ID, buffer, caption + "\n\n— ANTEPRIMA — rispondi OK per pubblicare, ANNULLA per annullare, o mandami un testo nuovo per correggere.", "HTML");
}

async function gestisciMessaggioPrivato(message) {
  const oggi = new Date().toISOString().slice(0, 10);
  if (oggi < DATA_INIZIO) return;

  const { data: stato, sha } = await leggiFileJson(RECAP_PATH);

  // Nuova giornata: il primo messaggio avvia il recap.
  if (stato.data !== oggi) {
    const dati = await ottieniVinte();
    if (!dati) {
      await scriviFileJson(RECAP_PATH, { data: oggi, fase: "nessuna_vinta", risolto: true, vinte: [], totaleGiocate: 0, testoFinale: "" }, sha, `bot: recap ${oggi} - nessuna vinta`);
      await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Nessuna giocata vinta da promuovere al momento." });
      return;
    }
    const testo = testoPrecompilato(dati.vinte, dati.totaleGiocate, dati.profitUnita);
    const nuovo = { data: oggi, fase: "attesa_testo", risolto: false, vinte: dati.vinte, totaleGiocate: dati.totaleGiocate, testoFinale: "" };
    await scriviFileJson(RECAP_PATH, nuovo, sha, `bot: recap ${oggi} - avviato (${dati.targetDate})`);
    await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Ecco il testo già pronto per il recap — modificalo come vuoi e rimandamelo. Poi ti mostro la grafica." });
    await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: testo, parse_mode: "HTML" });
    return;
  }

  if (stato.fase === "attesa_testo") {
    if (!message.text) {
      await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Aspetto il testo del post (scrivimelo come messaggio normale)." });
      return;
    }
    stato.testoFinale = entitiesToHtml(message.text, message.entities || []);
    stato.fase = "anteprima";
    await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - testo ricevuto`);
    await inviaAnteprima(stato);
    return;
  }

  if (stato.fase === "anteprima") {
    const testo = (message.text || "").trim().toLowerCase();
    if (testo === "ok" || testo === "pubblica") {
      const { buffer, caption } = await componiRecap(stato);
      await inviaFoto(CHAT_PUBBLICO, buffer, caption, "HTML");
      stato.fase = "pubblicato";
      stato.risolto = true;
      await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - pubblicato`);
      await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Pubblicato nel canale pubblico ✅" });
    } else if (testo === "annulla") {
      stato.fase = "annullato";
      stato.risolto = true;
      await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - annullato`);
      await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Ok, annullato per oggi." });
    } else if (message.text) {
      stato.testoFinale = entitiesToHtml(message.text, message.entities || []);
      await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - testo corretto`);
      await inviaAnteprima(stato);
    }
    return;
  }
  // fase conclusa (pubblicato/annullato/nessuna_vinta): nessuna azione
}

module.exports = { gestisciMessaggioPrivato };
