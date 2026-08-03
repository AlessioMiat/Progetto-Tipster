// Grafica recap pubblico "stile DennyBet": template fisso (personaggio +
// "GIORNATA CHIUSA IN VERDE" + box vincita totale in alto, piede in basso) con
// in mezzo le card delle giocate vinte generate DAI DATI (niente screenshot).
// Fasce: alto 0..577, basso 1090..1254 (linee verdi del template); il centro
// e' dinamico e si allunga in base al numero di giocate.
//
// Card in euro (1 unita' = 100€, budget 10.000€). Se la card ha "campionato"
// esce in stile schedina (lega piccola + squadre); senza campionato (combo/
// Tridente) mostra solo l'etichetta in "evento". Numero dispari di card ->
// l'ultima va a tutta larghezza. Il totale vero copre il "983,00€" fisso.
//
// Niente emoji nei testi disegnati (i font emoji possono mancare sui server
// Linux di Netlify): il template le contiene gia' come immagine.
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const TEMPLATE_BASE64 = require("./template-base64");
const FONT_BASE64 = require("./font-base64");

// I server Netlify (AWS Lambda) non hanno font installati: senza, il testo
// SVG renderizzato da sharp esce come quadratini (□). Qui, all'avvio, scrivo
// il font DejaVu Sans e un fonts.conf su /tmp e configuro fontconfig perche'
// "sans-serif" usi quel font. Va fatto PRIMA del primo render sharp.
(function setupFont() {
  try {
    const dir = "/tmp/isola-fonts";
    fs.mkdirSync(dir, { recursive: true });
    const fontPath = path.join(dir, "DejaVuSans.ttf");
    if (!fs.existsSync(fontPath)) fs.writeFileSync(fontPath, Buffer.from(FONT_BASE64, "base64"));
    const confPath = path.join(dir, "fonts.conf");
    fs.writeFileSync(confPath,
      `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>` +
      `<dir>${dir}</dir><cachedir>/tmp/fc-cache</cachedir>` +
      `<match target="pattern"><test name="family"><string>sans-serif</string></test>` +
      `<edit name="family" mode="assign" binding="strong"><string>DejaVu Sans</string></edit></match>` +
      `<match target="pattern"><test name="family"><string>serif</string></test>` +
      `<edit name="family" mode="assign" binding="strong"><string>DejaVu Sans</string></edit></match>` +
      `</fontconfig>`);
    process.env.FONTCONFIG_FILE = confPath;
    process.env.FONTCONFIG_PATH = dir;
  } catch (e) {
    console.error("setup font fallito:", e && e.message);
  }
})();

const EURO_PER_UNITA = 100;
const W = 1254;
const TOP_END = 577;
const BOT_START = 1090;
const PAD = 40;
const COL_GAP = 24;
const ROW_GAP = 24;
const CARD_W = Math.round((W - PAD * 2 - COL_GAP) / 2);
const CARD_H = 210;
const MID_TOP_PAD = 34;
const MID_BOT_PAD = 34;
const VERDE = "rgb(138,204,34)";

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function labelTip(t) { const m = { RaddoppioAI: "RADDOPPIO AI", QuoteBoostate: "QUOTE BOOSTATE" }; return (m[t] || t).toUpperCase(); }
function eur(n, dec) {
  const fixed = Number(n).toFixed(dec);
  let [ip, dp] = fixed.split(".");
  ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (dec > 0 ? `${ip},${dp}` : ip) + " €";
}

function cardSvg(v, x, y, w) {
  const vintoEur = v.stake * v.quota * EURO_PER_UNITA;
  const puntEur = v.stake * EURO_PER_UNITA;
  const tag = labelTip(v.tipologia);
  const tagW = 26 + tag.length * 10.2;
  const titoloY = v.campionato ? y + 108 : y + 100;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${CARD_H}" rx="18" fill="#f4efe1" stroke="#7ec13a" stroke-width="2"/>
      <rect x="${x + 22}" y="${y + 22}" width="${tagW}" height="34" rx="17" fill="#eaf6dd" stroke="#3ea01e" stroke-width="1.5"/>
      <text x="${x + 22 + tagW / 2}" y="${y + 44}" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="800" letter-spacing="0.5" fill="#2e7d1a">${esc(tag)}</text>
      <g transform="translate(${x + w - 140},${y + 28}) rotate(-9)">
        <rect x="0" y="0" width="116" height="44" rx="8" fill="none" stroke="#4ea812" stroke-width="3"/>
        <text x="58" y="31" text-anchor="middle" font-family="sans-serif" font-size="25" font-weight="800" letter-spacing="2" fill="#4ea812">VINTA</text>
      </g>
      ${v.campionato ? `<text x="${x + 24}" y="${y + 82}" font-family="sans-serif" font-size="15" font-weight="700" letter-spacing="0.5" fill="#9a8f79">${esc(String(v.campionato).toUpperCase())}</text>` : ""}
      <text x="${x + 24}" y="${titoloY}" font-family="sans-serif" font-size="26" font-weight="800" fill="#1a1a1a">${esc(v.evento)}</text>
      <circle cx="${x + 30}" cy="${y + 134}" r="6" fill="#3ea01e"/>
      <text x="${x + 46}" y="${y + 141}" font-family="sans-serif" font-size="19" fill="#333">${esc(v.selezione || "")}</text>
      <text x="${x + w - 24}" y="${y + 141}" text-anchor="end" font-family="sans-serif" font-size="22" font-weight="800" fill="#1a1a1a">${String(v.quota).replace(".", ",")}</text>
      <line x1="${x + 24}" y1="${y + 158}" x2="${x + w - 24}" y2="${y + 158}" stroke="#d9d0bd" stroke-width="1.5"/>
      <text x="${x + 24}" y="${y + 186}" font-family="sans-serif" font-size="18" fill="#7a7263">Puntata: ${eur(puntEur, 0)}</text>
      <rect x="${x + w - 24 - 210}" y="${y + 164}" width="210" height="34" rx="17" fill="#2fa01e"/>
      <text x="${x + w - 24 - 105}" y="${y + 187}" text-anchor="middle" font-family="sans-serif" font-size="18" font-weight="800" fill="#fff">Vinto: ${eur(vintoEur, 2)}</text>
    </g>`;
}

// 2 colonne; se il numero e' dispari l'ultima card e' a tutta larghezza.
function posizioni(n) {
  const full = W - PAD * 2;
  const pos = [];
  for (let i = 0; i < n; i++) {
    const isLastAlone = i === n - 1 && n % 2 === 1;
    const row = Math.floor(i / 2);
    if (isLastAlone) pos.push({ x: PAD, y: MID_TOP_PAD + row * (CARD_H + ROW_GAP), w: full });
    else pos.push({ x: PAD + (i % 2) * (CARD_W + COL_GAP), y: MID_TOP_PAD + row * (CARD_H + ROW_GAP), w: CARD_W });
  }
  return pos;
}

function totaleOverlaySvg(totaleEur) {
  const str = eur(totaleEur, 2);
  const fs = Math.min(52, Math.floor(210 / (str.length * 0.52)));
  return `<svg width="${W}" height="${TOP_END}" xmlns="http://www.w3.org/2000/svg">
    <rect x="976" y="114" width="236" height="72" fill="#030102"/>
    <text x="1094" y="170" text-anchor="middle" font-family="sans-serif" font-size="${fs}" font-weight="800" fill="${VERDE}">${str}</text>
  </svg>`;
}

async function generaImmagineRecap(vinte) {
  const template = Buffer.from(TEMPLATE_BASE64, "base64");
  const meta = await sharp(template).metadata();
  const totaleEur = vinte.reduce((t, v) => t + v.stake * v.quota * EURO_PER_UNITA, 0);

  let topBand = await sharp(template).extract({ left: 0, top: 0, width: W, height: TOP_END }).png().toBuffer();
  topBand = await sharp(topBand).composite([{ input: Buffer.from(totaleOverlaySvg(totaleEur)), top: 0, left: 0 }]).png().toBuffer();
  const botBand = await sharp(template).extract({ left: 0, top: BOT_START, width: W, height: meta.height - BOT_START }).png().toBuffer();
  const topH = TOP_END, botH = meta.height - BOT_START;

  const righe = Math.ceil(vinte.length / 2);
  const midH = MID_TOP_PAD + righe * CARD_H + (righe - 1) * ROW_GAP + MID_BOT_PAD;
  const totalH = topH + midH + botH;

  const pos = posizioni(vinte.length);
  let cards = "";
  vinte.forEach((v, i) => { cards += cardSvg(v, pos[i].x, pos[i].y, pos[i].w); });
  const midBand = await sharp(Buffer.from(`<svg width="${W}" height="${midH}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${midH}" fill="#050505"/>${cards}</svg>`)).png().toBuffer();

  return sharp({ create: { width: W, height: totalH, channels: 4, background: "#050505" } })
    .composite([
      { input: topBand, top: 0, left: 0 },
      { input: midBand, top: topH, left: 0 },
      { input: botBand, top: topH + midH, left: 0 }
    ]).png().toBuffer();
}

module.exports = { generaImmagineRecap, EURO_PER_UNITA, eur };
