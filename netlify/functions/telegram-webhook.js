// Bot L'ISOLA — riceve gli aggiornamenti dal canale Telegram e aggiorna
// giocate.json (e lo stato del recap pubblico) direttamente su GitHub, nel
// repo Progetto-Tipster (che fa poi ripubblicare GitHub Pages da solo).
//
// Variabili d'ambiente richieste (da impostare su Netlify, MAI scritte qui):
//   TELEGRAM_BOT_TOKEN        token del bot (da BotFather)
//   TELEGRAM_CHAT_ID          id del canale privato L'ISOLA (numero negativo)
//   TELEGRAM_CHAT_ID_PUBBLICO id del canale pubblico DennyBet
//   GITHUB_TOKEN              Personal Access Token con permesso di scrittura sul repo
//   GITHUB_REPO               es. "AlessioMiat/Progetto-Tipster"
//   GITHUB_BRANCH             es. "main"
//   GITHUB_FILE_PATH          es. "giocate.json"

const { leggiFileJson, scriviFileJson } = require("./lib/github-files");
const { gestisciMessaggioPrivato } = require("./lib/recap");

const TIPOLOGIE_VALIDE = ["Tridente", "Marcatore", "RaddoppioAI", "Live", "QuoteBoostate", "Paracadute"];

// Sticker di risposta che segnano l'esito (file_unique_id, stabile per sticker
// anche se lo si invia da chat diverse). Aggiornati il 13/07/2026 con i due
// sticker definitivi scelti da Alessio per il canale privato (vinta/persa).
const STICKER_VINTA = "AgAD3UAAAt2OoVI";
const STICKER_PERSA = "AgAD3kAAAt2OoVI";

// ID Telegram di Alessio (chat privata col bot) — le sue risposte lì pilotano
// la macchina a stati del recap pubblico giornaliero (vedi lib/recap.js).
const ALESSIO_USER_ID = 628218072;

function estraiCampo(testo, etichetta) {
  const re = new RegExp(etichetta + "\\s*:\\s*(.+)", "i");
  const m = testo.match(re);
  return m ? m[1].trim() : null;
}

function estraiTipologia(testo) {
  return TIPOLOGIE_VALIDE.find(t => testo.includes("#" + t)) || null;
}

function parseGiocataSecca(testo, tipologia) {
  const evento = estraiCampo(testo, "Evento");
  const quotaStr = estraiCampo(testo, "Quota");
  const stakeStr = estraiCampo(testo, "Stake");
  if (!evento || !quotaStr || !stakeStr) return null;
  const codice = estraiCampo(testo, "Codice");
  const nota = estraiCampo(testo, "Nota");
  return {
    evento,
    tipologia,
    selezione: estraiCampo(testo, "Selezione") || "",
    quota: parseFloat(quotaStr.replace(",", ".")),
    stake: parseFloat(stakeStr.replace(",", ".").replace(/u\b/i, "").trim()),
    esito: "in_attesa",
    ...(codice ? { codice } : {}),
    ...(nota ? { nota } : {})
  };
}

function parseParacaduteStep(testo) {
  // Ogni step si pubblica come messaggio a sé (non si conoscono step 2/3 in
  // anticipo) — "Ciclo" collega gli step tra loro, "Step" li ordina.
  const cicloStr = estraiCampo(testo, "Ciclo");
  const stepStr = estraiCampo(testo, "Step");
  const evento = estraiCampo(testo, "Evento");
  const quotaStr = estraiCampo(testo, "Quota");
  if (!cicloStr || !stepStr || !evento || !quotaStr) return null;
  const codice = estraiCampo(testo, "Codice");
  const nota = estraiCampo(testo, "Nota");
  return {
    evento,
    tipologia: "Paracadute",
    selezione: estraiCampo(testo, "Selezione") || "",
    quota: parseFloat(quotaStr.replace(",", ".")),
    ciclo: parseInt(cicloStr, 10),
    step: parseInt(stepStr, 10),
    esito: "in_attesa",
    ...(codice ? { codice } : {}),
    ...(nota ? { nota } : {})
  };
}

async function leggiGiocateJson() {
  return leggiFileJson(process.env.GITHUB_FILE_PATH);
}

async function scriviGiocateJson(data, sha, messaggioCommit) {
  return scriviFileJson(process.env.GITHUB_FILE_PATH, data, sha, messaggioCommit);
}

exports.handler = async event => {
  try {
    const update = JSON.parse(event.body);

    // Messaggio privato di Alessio al bot -> pilota la macchina a stati del
    // recap pubblico giornaliero (elenco vinte, screenshot, testo, anteprima,
    // pubblicazione). Vedi lib/recap.js per il dettaglio dei passaggi.
    const privato = update.message;
    if (privato && privato.chat.type === "private" && privato.from && privato.from.id === ALESSIO_USER_ID) {
      await gestisciMessaggioPrivato(privato);
      return { statusCode: 200, body: "ok" };
    }

    const post = update.channel_post;
    if (!post || String(post.chat.id) !== process.env.TELEGRAM_CHAT_ID) {
      return { statusCode: 200, body: "ignorato" };
    }

    // Caso 1: nuovo post con didascalia strutturata -> nuova giocata "in_attesa"
    if (post.caption) {
      const tipologia = estraiTipologia(post.caption);
      const giocata = tipologia === "Paracadute" ? parseParacaduteStep(post.caption)
        : tipologia ? parseGiocataSecca(post.caption, tipologia)
        : null;
      if (giocata) {
        giocata.data = new Date(post.date * 1000).toISOString().slice(0, 10);
        giocata.telegram_message_id = post.message_id;
        const { data, sha } = await leggiGiocateJson();
        data.giocate.push(giocata);
        await scriviGiocateJson(data, sha, `bot: nuova giocata ${tipologia} ${giocata.data}`);
      }
      return { statusCode: 200, body: "ok" };
    }

    // Caso 2: risposta a un post -> sticker vinta/persa dedicati segnano l'esito.
    // Qualunque altro sticker o testo (commenti, contesto) viene ignorato.
    if (post.reply_to_message && post.sticker) {
      const id = post.sticker.file_unique_id;
      const esito = id === STICKER_VINTA ? "vinta" : id === STICKER_PERSA ? "persa" : null;
      if (esito) {
        const refId = post.reply_to_message.message_id;
        const { data, sha } = await leggiGiocateJson();
        const giocata = data.giocate.find(g => g.telegram_message_id === refId);
        if (giocata) {
          giocata.esito = esito;
          await scriviGiocateJson(data, sha, `bot: esito ${esito} (msg ${refId})`);
        }
      }
    }

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "error" };
  }
};
