// =====================================================================
// Datas com fuso (Utilities.formatDate do Apps Script usa padrões Java)
// =====================================================================
const formatadores = {};

/** O Apps Script aceita "GMT-3", "GMT-03:00"; o Intl só entende "Etc/GMT+3" (sinal invertido). */
function normalizarFuso(fuso) {
  const m = String(fuso || "").trim().match(/^(?:GMT|UTC)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) { return fuso || "America/Sao_Paulo"; }
  const h = Number(m[2]), min = Number(m[3] || 0);
  if (min === 0) { return h === 0 ? "UTC" : "Etc/GMT" + (m[1] === "-" ? "+" : "-") + h; }
  return "America/Sao_Paulo";
}

function formatador(fuso) {
  fuso = normalizarFuso(fuso);
  if (!formatadores[fuso]) {
    formatadores[fuso] = new Intl.DateTimeFormat("en-US", {
      timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short"
    });
  }
  return formatadores[fuso];
}

const DIAS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function partesNoFuso(data, fuso) {
  const p = {};
  formatador(fuso || "America/Sao_Paulo").formatToParts(data).forEach(x => { p[x.type] = x.value; });
  return {
    ano: Number(p.year), mes: Number(p.month), dia: Number(p.day),
    hora: Number(p.hour) % 24, minuto: Number(p.minute), segundo: Number(p.second),
    diaSemana: DIAS_EN.indexOf(p.weekday), ms: data.getUTCMilliseconds()
  };
}

/** Instante (Date) que corresponde a esse horário de parede no fuso. */
function dataNoFuso(fuso, ano, mes, dia, hora, minuto, segundo) {
  let palpite = Date.UTC(ano, mes - 1, dia, hora || 0, minuto || 0, segundo || 0);
  for (let i = 0; i < 3; i++) {
    const p = partesNoFuso(new Date(palpite), fuso);
    const visto = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
    const desejado = Date.UTC(ano, mes - 1, dia, hora || 0, minuto || 0, segundo || 0);
    if (visto === desejado) { break; }
    palpite += desejado - visto;
  }
  return new Date(palpite);
}

function deslocamento(data, fuso) {
  const p = partesNoFuso(data, fuso);
  return Math.round((Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - Math.floor(data.getTime() / 1000) * 1000) / 60000);
}

const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DIAS_LONGO_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Padrões Java/SimpleDateFormat: yyyy yy MM M MMM MMMM dd d HH H hh h mm m ss s SSS a E EEE EEEE u Z X 'texto' */
function formatarData(data, fuso, padrao) {
  if (!(data instanceof Date)) { data = new Date(data); }
  if (isNaN(data.getTime())) { throw new Error("Exception: Invalid argument: date"); }
  const fz = fuso || "America/Sao_Paulo";
  const p = partesNoFuso(data, fz);
  const z = (n, t) => String(n).padStart(t, "0");
  let out = "";
  const s = String(padrao);
  for (let i = 0; i < s.length;) {
    const ch = s[i];
    if (ch === "'") {
      const fim = s.indexOf("'", i + 1);
      if (fim === i + 1) { out += "'"; i += 2; continue; }
      out += s.slice(i + 1, fim < 0 ? s.length : fim);
      i = fim < 0 ? s.length : fim + 1;
      continue;
    }
    if (!/[A-Za-z]/.test(ch)) { out += ch; i++; continue; }
    let n = 1;
    while (s[i + n] === ch) { n++; }
    i += n;
    switch (ch) {
      case "y": out += n === 2 ? z(p.ano % 100, 2) : z(p.ano, n); break;
      case "Y": out += n === 2 ? z(p.ano % 100, 2) : z(p.ano, n); break;
      case "M": out += n >= 4 ? MESES_EN[p.mes - 1] : n === 3 ? MESES_EN[p.mes - 1].slice(0, 3) : z(p.mes, n); break;
      case "d": out += z(p.dia, n); break;
      case "H": out += z(p.hora, n); break;
      case "k": out += z(p.hora === 0 ? 24 : p.hora, n); break;
      case "h": out += z(p.hora % 12 === 0 ? 12 : p.hora % 12, n); break;
      case "K": out += z(p.hora % 12, n); break;
      case "m": out += z(p.minuto, n); break;
      case "s": out += z(p.segundo, n); break;
      case "S": out += z(p.ms, 3).slice(0, n); break;
      case "a": out += p.hora < 12 ? "AM" : "PM"; break;
      case "E": out += n >= 4 ? DIAS_LONGO_EN[p.diaSemana] : DIAS_EN[p.diaSemana]; break;
      case "u": out += String(p.diaSemana === 0 ? 7 : p.diaSemana); break;
      case "Z": case "X": {
        const off = deslocamento(data, fz);
        const sinal = off < 0 ? "-" : "+";
        const a = Math.abs(off);
        out += sinal + z(Math.floor(a / 60), 2) + (ch === "X" && n >= 3 ? ":" : "") + z(a % 60, 2);
        break;
      }
      case "z": out += fz === "America/Sao_Paulo" ? "BRT" : fz; break;
      default: out += ch.repeat(n);
    }
  }
  return out;
}

module.exports = { formatarData, partesNoFuso, dataNoFuso };
