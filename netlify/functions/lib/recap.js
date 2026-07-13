// Macchina a stati del recap giornaliero per il canale pubblico: dalle
// giocate vinte ieri (giocate.json) al messaggio pubblicato su DennyBet,
// passando per screenshot, testo personale di Alessio e anteprima con OK.
const { leggiFileJson, scriviFileJson } = require("./github-files");
const { generaImmagineRecap } = require("./recap-image");
const { chiamaApi, inviaFoto, scaricaFile } = require("./telegram");
const { entitiesToHtml, escapeHtml } = require("./entities");

const RECAP_PATH = "automazioni/recap-stato.json";
const ALESSIO_CHAT_ID = 628218072;

function isoIeri(oggi) {
  const d = new Date(oggi + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function elencoTipologie(vinte) {
  const uniche = [...new Set(vinte.map(v => v.tipologia))];
  if (uniche.length === 1) return uniche[0];
  return uniche.slice(0, -1).join(", ") + " e " + uniche[uniche.length - 1];
}

async function ottieniGiocateIeri(oggi) {
  const { data } = await leggiFileJson(process.env.GITHUB_FILE_PATH);
  const ieri = isoIeri(oggi);
  const diIeri = data.giocate.filter(g => g.data === ieri && g.tipologia !== "Paracadute");
  const vinte = diIeri.filter(g => g.esito === "vinta");
  const profittoUnita = diIeri.reduce((tot, g) => {
    if (g.esito === "vinta") return tot + g.stake * (g.quota - 1);
    if (g.esito === "persa") return tot - g.stake;
    return tot;
  }, 0);
  const winRatePct = diIeri.length ? Math.round((vinte.length / diIeri.length) * 100) : 0;
  return { totaleGiocate: diIeri.length, vinte, profittoUnita, winRatePct };
}

function messaggioElenco(vinte, totaleGiocate) {
  const righe = vinte.map(
    (v, i) => `${i + 1}. ${v.evento} — ${v.tipologia}: ${v.selezione || ""} (quota ${v.quota})`
  );
  return (
    `Ieri: ${vinte.length} su ${totaleGiocate} vinte 🔥\n\n` +
    righe.join("\n") +
    `\n\nMandami gli screenshot in questo ordine (uno alla volta), poi il tuo testo per il post.`
  );
}

function costruisciCaption(stato) {
  const tipologie = elencoTipologie(stato.vinte);
  return (
    `<b>🤩 ${stato.vinte.length} Su ${stato.totaleGiocate} Nel Privato 🏝️</b>\n` +
    `<i>${escapeHtml(tipologie)}</i> <i>In</i> <b>CASSA ✅</b>\n` +
    `${stato.testoPersonale}\n\n` +
    `<i>👉🏻Qui Guardi 👀 nel privato</i> <b>VINCI 🤑</b>\n` +
    `✍️ Scrivi a @Denny_Bet`
  );
}

async function componiRecap(stato) {
  const screenshotBuffers = [];
  for (const fileId of stato.screenshotRicevuti) {
    screenshotBuffers.push(await scaricaFile(fileId));
  }
  const buffer = await generaImmagineRecap(stato.vinte, screenshotBuffers, {
    totaleGiocate: stato.totaleGiocate,
    winRatePct: stato.winRatePct,
    profittoUnita: stato.profittoUnita
  });
  return { buffer, caption: costruisciCaption(stato) };
}

async function inviaAnteprima(stato) {
  const { buffer, caption } = await componiRecap(stato);
  await inviaFoto(
    ALESSIO_CHAT_ID,
    buffer,
    caption + "\n\n— ANTEPRIMA — rispondi OK per pubblicare, ANNULLA per annullare, oppure mandami un testo nuovo per correggere.",
    "HTML"
  );
}

async function pubblica(stato) {
  const { buffer, caption } = await componiRecap(stato);
  await inviaFoto(process.env.TELEGRAM_CHAT_ID_PUBBLICO, buffer, caption, "HTML");
}

async function gestisciMessaggioPrivato(message) {
  const oggi = new Date().toISOString().slice(0, 10);
  const { data: stato, sha } = await leggiFileJson(RECAP_PATH);

  if (stato.data !== oggi) {
    const { totaleGiocate, vinte, profittoUnita, winRatePct } = await ottieniGiocateIeri(oggi);
    if (vinte.length === 0) {
      const nuovo = { data: oggi, fase: "nessuna_vinta", risolto: true, vinte: [], totaleGiocate, profittoUnita, winRatePct, screenshotRicevuti: [], testoPersonale: "" };
      await scriviFileJson(RECAP_PATH, nuovo, sha, `bot: recap ${oggi} - nessuna vinta`);
      await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Nessuna giocata vinta ieri — niente da promuovere oggi." });
      return;
    }
    const nuovo = { data: oggi, fase: "raccolta_screenshot", risolto: false, vinte, totaleGiocate, profittoUnita, winRatePct, screenshotRicevuti: [], testoPersonale: "" };
    await scriviFileJson(RECAP_PATH, nuovo, sha, `bot: recap ${oggi} - avviato`);
    await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: messaggioElenco(vinte, totaleGiocate) });
    return;
  }

  if (stato.fase === "raccolta_screenshot") {
    const foto = message.photo;
    if (foto && foto.length) {
      const fileId = foto[foto.length - 1].file_id;
      stato.screenshotRicevuti.push(fileId);
      if (stato.screenshotRicevuti.length < stato.vinte.length) {
        await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - screenshot ${stato.screenshotRicevuti.length}`);
        await chiamaApi("sendMessage", {
          chat_id: ALESSIO_CHAT_ID,
          text: `Ricevuto ${stato.screenshotRicevuti.length} di ${stato.vinte.length}. Mandami il prossimo.`
        });
      } else {
        stato.fase = "raccolta_testo";
        await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - screenshot completi`);
        await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Ricevuti tutti gli screenshot. Ora mandami il tuo testo per il post." });
      }
    } else {
      await chiamaApi("sendMessage", {
        chat_id: ALESSIO_CHAT_ID,
        text: `Aspetto ancora ${stato.vinte.length - stato.screenshotRicevuti.length} screenshot (siamo a ${stato.screenshotRicevuti.length}/${stato.vinte.length}).`
      });
    }
    return;
  }

  if (stato.fase === "raccolta_testo") {
    if (message.text) {
      stato.testoPersonale = entitiesToHtml(message.text, message.entities || []);
      stato.fase = "anteprima";
      await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - testo ricevuto`);
      await inviaAnteprima(stato);
    } else {
      await chiamaApi("sendMessage", { chat_id: ALESSIO_CHAT_ID, text: "Aspetto il testo (scrivimelo come messaggio normale)." });
    }
    return;
  }

  if (stato.fase === "anteprima") {
    const testo = (message.text || "").trim().toLowerCase();
    if (testo === "ok" || testo === "pubblica") {
      await pubblica(stato);
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
      stato.testoPersonale = entitiesToHtml(message.text, message.entities || []);
      await scriviFileJson(RECAP_PATH, stato, sha, `bot: recap ${oggi} - testo corretto`);
      await inviaAnteprima(stato);
    }
    return;
  }
  // fase gia' conclusa (pubblicato/annullato/nessuna_vinta): nessuna azione
}

module.exports = { gestisciMessaggioPrivato };
