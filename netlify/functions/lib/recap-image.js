// Compone l'immagine brandizzata del recap pubblico: titolo "X su Y vinte" +
// "Bilancio di ieri" a sinistra, logo+wordmark "L'ISOLA / Canale privato" a
// destra sulla stessa riga, sottotitolo tipologie, griglia a 1-2 colonne di
// card (screenshot + tipologia + badge), riga statistiche, footer con
// invito. Renderizzato come SVG (testo/forme) + gli screenshot reali
// incollati sopra con sharp (niente servizi esterni).
//
// Griglia invece di una colonna unica (13/07/2026, dopo un confronto diretto
// con la demo originale): una singola colonna a piena larghezza, con card
// alte quanto lo screenshot reale, diventava troppo lunga da scorrere ed
// era meno leggibile in anteprima. Con 2 colonne bilanciate per altezza
// l'immagine resta compatta, e ogni screenshot mantiene comunque le sue
// proporzioni reali (mai tagliato).
//
// Niente emoji nei testi disegnati dentro l'immagine: i server Linux di
// Netlify potrebbero non avere font emoji a colori installati e il glifo
// uscirebbe vuoto/rotto. Le emoji nel testo del MESSAGGIO restano invece
// sicure, perche' le disegna il client Telegram, non sharp.
//
// Testi secondari sempre almeno "semi-bold" (mai il peso di default, troppo
// sottile/poco leggibile su sfondo scuro) — feedback diretto di Alessio.
const sharp = require("sharp");
const LOGO_BASE64 = require("./logo-base64");

const W = 1080;
const PAD = 40;
const LOGO_D = 100;
const HEADER_ROW_H = 120;
const SUBTITLE_H = 40;
const COL_GAP = 20;
const TILE_GAP = 20;
const LABEL_H = 48;
const STATS_H = 100;
const FOOTER_H = 90;

function escXml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function elencoTipologie(vinte) {
  const uniche = [...new Set(vinte.map(v => v.tipologia))];
  if (uniche.length === 1) return uniche[0];
  return uniche.slice(0, -1).join(", ") + " e " + uniche[uniche.length - 1];
}

// Riga header: titolo "X su Y vinte" + "Bilancio di ieri" a sinistra,
// logo+wordmark "L'ISOLA" / "Canale privato" a destra.
function headerRowSvg(vinte, totaleGiocate) {
  const logoCx = W - PAD - LOGO_D / 2;
  const logoCy = PAD + 50;
  const wordmarkX = logoCx - LOGO_D / 2 - 20;
  return `
    <text x="${PAD}" y="${PAD + 52}" font-family="sans-serif" font-size="56" font-weight="800" letter-spacing="-1" xml:space="preserve"><tspan fill="#17c964">${vinte.length}</tspan><tspan fill="#f5ecd8"> su ${totaleGiocate} </tspan><tspan fill="#e0aa3e">vinte</tspan></text>
    <text x="${PAD}" y="${PAD + 84}" font-family="sans-serif" font-size="15" font-weight="700" letter-spacing="1.5" fill="#b3a186">BILANCIO DI IERI</text>
    <circle cx="${logoCx}" cy="${logoCy}" r="${LOGO_D / 2 + 3}" fill="none" stroke="#e0aa3e" stroke-width="2"/>
    <text x="${wordmarkX}" y="${logoCy - 6}" text-anchor="end" font-family="sans-serif" font-size="24" font-weight="800" letter-spacing="1" fill="#e0aa3e">L'ISOLA</text>
    <text x="${wordmarkX}" y="${logoCy + 18}" text-anchor="end" font-family="sans-serif" font-size="14" font-weight="700" letter-spacing="1.5" fill="#7a6b52">CANALE PRIVATO</text>
  `;
}

function subtitleSvg(vinte, subtitleTop) {
  const tipologie = elencoTipologie(vinte);
  return `<text x="${PAD}" y="${subtitleTop}" font-family="sans-serif" font-size="18" font-weight="600" fill="#b3a186">${escXml(tipologie)} portate a casa</text>`;
}

// Logo reale (dashboard/logo.jpeg, incorporato come base64 in logo-base64.js)
// ritagliato in cerchio per il brand-mark dell'header.
async function logoCircolare() {
  const maschera = Buffer.from(
    `<svg width="${LOGO_D}" height="${LOGO_D}"><circle cx="${LOGO_D / 2}" cy="${LOGO_D / 2}" r="${LOGO_D / 2}" fill="#fff"/></svg>`
  );
  return sharp(Buffer.from(LOGO_BASE64, "base64"))
    .resize(LOGO_D, LOGO_D, { fit: "cover" })
    .composite([{ input: maschera, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function statsSvg(stats, statsTop) {
  const cardW = W - PAD * 2;
  const boxW = (cardW - 16 * 2) / 3;
  const boxes = [
    { k: "Giocate", v: String(stats.totaleGiocate) },
    { k: "Win rate", v: `${stats.winRatePct}%` },
    { k: "Profitto", v: `${stats.profittoUnita >= 0 ? "+" : ""}${stats.profittoUnita.toFixed(1)}u` }
  ];
  let out = "";
  boxes.forEach((b, i) => {
    const x = PAD + i * (boxW + 16);
    out += `
      <rect x="${x}" y="${statsTop}" width="${boxW}" height="${STATS_H - 20}" rx="12" fill="#1c150d" stroke="rgba(224,170,62,0.25)" stroke-width="1"/>
      <text x="${x + 20}" y="${statsTop + 30}" font-family="sans-serif" font-size="12" font-weight="700" letter-spacing="1" fill="#9a8b70">${b.k.toUpperCase()}</text>
      <text x="${x + 20}" y="${statsTop + 60}" font-family="sans-serif" font-size="26" font-weight="800" fill="#17c964">${b.v}</text>
    `;
  });
  return out;
}

function footerSvg(totalH) {
  return `
    <line x1="${PAD}" y1="${totalH - FOOTER_H}" x2="${W - PAD}" y2="${totalH - FOOTER_H}" stroke="rgba(245,236,216,0.10)"/>
    <text x="${W / 2}" y="${totalH - FOOTER_H / 2 + 2}" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#e0aa3e">Vuoi le nostre proposte esclusive?</text>
    <text x="${W / 2}" y="${totalH - FOOTER_H / 2 + 26}" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="600" fill="#b3a186">Scrivici per il gruppo privato</text>
  `;
}

function badgeSvg() {
  return `<svg width="96" height="32" xmlns="http://www.w3.org/2000/svg">
    <rect width="96" height="32" rx="16" fill="#0f2b1c" stroke="#17c964" stroke-width="1"/>
    <text x="48" y="21" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="700" fill="#17c964">✓ Vinta</text>
  </svg>`;
}

// Distribuisce gli screenshot in 1 o 2 colonne, bilanciando l'altezza totale
// di ciascuna colonna (masonry semplice), cosi' la griglia resta compatta
// qualunque sia il numero di giocate (1 sola, 2, 3, 4+...).
function impaginaColonne(tileHeights) {
  if (tileHeights.length === 1) return [[0]];
  const colonne = [[], []];
  const altezzeColonne = [0, 0];
  tileHeights.forEach((h, i) => {
    const col = altezzeColonne[0] <= altezzeColonne[1] ? 0 : 1;
    colonne[col].push(i);
    altezzeColonne[col] += h + TILE_GAP;
  });
  return colonne.filter(c => c.length > 0);
}

async function generaImmagineRecap(vinte, screenshotBuffers, stats) {
  const cardW = W - PAD * 2;
  const nColonne = screenshotBuffers.length === 1 ? 1 : 2;
  const colW = nColonne === 1 ? cardW : (cardW - COL_GAP) / 2;

  const metas = await Promise.all(screenshotBuffers.map(b => sharp(b).metadata()));
  const imgHeights = metas.map(m => Math.round((colW * m.height) / m.width));
  const tileHeights = imgHeights.map(h => h + LABEL_H);

  const subtitleTop = PAD + HEADER_ROW_H + 8;
  const tilesTop = subtitleTop + SUBTITLE_H;

  const colonne = impaginaColonne(tileHeights);
  const posizioni = []; // per indice originale: {x, y}
  let altezzaMassimaColonne = 0;
  colonne.forEach((indici, colIdx) => {
    let y = tilesTop;
    const x = PAD + colIdx * (colW + COL_GAP);
    indici.forEach(i => {
      posizioni[i] = { x, y };
      y += tileHeights[i] + TILE_GAP;
    });
    altezzaMassimaColonne = Math.max(altezzaMassimaColonne, y - TILE_GAP);
  });

  const statsTop = altezzaMassimaColonne + 30;
  const totalH = statsTop + STATS_H + FOOTER_H;

  let cards = "";
  vinte.forEach((v, i) => {
    const { x, y } = posizioni[i];
    const labelTop = y + imgHeights[i];
    cards += `
      <rect x="${x}" y="${y}" width="${colW}" height="${tileHeights[i]}" rx="16" fill="#1c150d" stroke="rgba(224,170,62,0.35)" stroke-width="1"/>
      <text x="${x + 18}" y="${labelTop + 32}" font-family="sans-serif" font-size="17" font-weight="800" letter-spacing="1" fill="#f5ecd8">${escXml(v.tipologia.toUpperCase())}</text>
    `;
  });

  const svg = `<svg width="${W}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g1" cx="15%" cy="-5%" r="60%">
        <stop offset="0%" stop-color="#e0aa3e" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#e0aa3e" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${totalH}" fill="#0b0905"/>
    <rect width="${W}" height="${totalH}" fill="url(#g1)"/>
    ${headerRowSvg(vinte, stats.totaleGiocate)}
    ${subtitleSvg(vinte, subtitleTop)}
    ${cards}
    ${statsSvg(stats, statsTop)}
    ${footerSvg(totalH)}
  </svg>`;

  const frameBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  const badgeBuffer = await sharp(Buffer.from(badgeSvg())).png().toBuffer();
  const logoBuffer = await logoCircolare();
  const logoCx = W - PAD - LOGO_D / 2;
  const logoCy = PAD + 50;

  const composite = [{ input: logoBuffer, top: Math.round(logoCy - LOGO_D / 2), left: Math.round(logoCx - LOGO_D / 2) }];
  for (let i = 0; i < vinte.length; i++) {
    const { x, y } = posizioni[i];
    const shot = await sharp(screenshotBuffers[i]).resize(colW, imgHeights[i], { fit: "fill" }).png().toBuffer();
    composite.push({ input: shot, top: y, left: x });
    composite.push({ input: badgeBuffer, top: y + 12, left: x + colW - 12 - 96 });
  }

  return sharp(frameBuffer).composite(composite).png().toBuffer();
}

module.exports = { generaImmagineRecap };
