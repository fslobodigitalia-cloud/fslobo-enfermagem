// Verifica credenciais SMTP do Resend SEM ENVIAR e-mail: conecta, autentica, valida o remetente e encerra
// (MAIL FROM + RSET + QUIT; nunca chega ao comando DATA). Não imprime a chave.
//
//   node scripts/check-smtp-handshake.mjs --preflight                 # só alcance de rede, sem credencial
//   node scripts/check-smtp-handshake.mjs <remetente@dominio> <arquivo-da-chave>
import tls from "node:tls";
import fs from "node:fs";

const [arg1, keyFile] = process.argv.slice(2);
const preflight = arg1 === "--preflight";
const from = preflight ? null : arg1;
if (!preflight && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from || "") || !keyFile)) { console.error("uso: --preflight | <remetente> <arquivo-da-chave>"); process.exit(2); }
const key = preflight ? null : fs.readFileSync(keyFile, "utf8").trim();

const sock = tls.connect({ host: "smtp.resend.com", port: 465, servername: "smtp.resend.com" });
let buf = ""; const waiters = [];
sock.setEncoding("utf8");
sock.on("data", (d) => { buf += d; flush(); });
sock.on("error", (e) => { console.log("ERRO de rede/TLS:", e.code || e.message); process.exit(1); });
function flush() { // uma resposta SMTP termina na linha "NNN " (com espaço)
  const m = buf.match(/^(\d{3}) [^\n]*\r?\n/m);
  while (waiters.length && /(^|\n)\d{3} [^\n]*\r?\n/.test(buf)) {
    const end = buf.search(/(^|\n)\d{3} [^\n]*\r?\n/); const line = buf.slice(end).match(/(\d{3}) ([^\r\n]*)/);
    buf = ""; waiters.shift()({ code: Number(line[1]), text: line[2] });
  }
  void m;
}
const next = () => new Promise((r) => { waiters.push(r); flush(); });
const send = async (cmd, show) => { sock.write(cmd + "\r\n"); const r = await next(); console.log(`${show}: ${r.code}`); return r; };

const banner = await next(); console.log("conexão TLS na porta 465 + banner:", banner.code);
const ehlo = await send("EHLO fslobo-homolog.local", "EHLO");
if (preflight) { await send("QUIT", "QUIT"); console.log(banner.code === 220 && ehlo.code === 250 ? "PREFLIGHT OK: a rede alcança smtp.resend.com:465" : "PREFLIGHT com resposta inesperada"); sock.end(); process.exit(0); }
const auth = await send("AUTH PLAIN " + Buffer.from(`\0resend\0${key}`).toString("base64"), "AUTH");
console.log(auth.code === 235 ? "credencial ACEITA pelo Resend (235)" : `credencial RECUSADA (${auth.code})`);
if (auth.code === 235) {
  const mf = await send(`MAIL FROM:<${from}>`, "MAIL FROM (remetente)");
  console.log(mf.code === 250 ? "remetente aceito (250)" : `remetente RECUSADO (${mf.code}: ${mf.text.slice(0, 80)})`);
  await send("RSET", "RSET (descarta; nenhum e-mail foi montado)");
}
await send("QUIT", "QUIT");
sock.end();
