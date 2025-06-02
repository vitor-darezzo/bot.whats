require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const crypto = require('crypto');
const { format } = require('date-fns');
const db = new (require('./database')).SecureDatabase();
const SessionManager = require('./session-manager');
const { exportReportToExcel } = require('./export-to-excel');
const ReportGenerator = require('./reports');
const reportGenerator = new ReportGenerator();
const { authMiddleware } = require('./auth-middleware');
const rateLimiter = require('./rate-limiter');
const activeSessions = new Map();
const { VENDEDORES } = require('./database');

// 🔄 Estados da sessão
const SESSION_STATES = {
  MENU: 'aguardando_resposta',
  SAC: 'aguardando_sac',
  SAC_OPTION: 'aguardando_opcao_sac',
  RETURN: 'aguardando_retorno'
};

// 🧠 Utilitários
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function extractName(contact) {
  return contact.pushname ? contact.pushname.split(' ')[0] : 'amigo(a)';
}
function getGreetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
function getFarewellByHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Até logo';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

// 🔁 Vendedor rotativo
let vendedorIndex = 0;
function getNextVendedor() {
  vendedorIndex = (vendedorIndex + 1) % 4;
  return (vendedorIndex + 1).toString();
}

// 🔐 Links assinados
function getSignedLink(baseLink) {
  const signature = crypto.createHmac('sha256', process.env.LINK_SECRET).update(baseLink).digest('hex');
  return `${baseLink}?sig=${signature}`;
}

function configurarLinksVendedores() {
  if (!VENDEDORES.vendas['1'].link) {
    VENDEDORES.vendas['1'].link = getSignedLink('https://wa.me/5511987591035');
    VENDEDORES.vendas['2'].link = getSignedLink('https://wa.me/5511970376942');
    VENDEDORES.vendas['3'].link = getSignedLink('https://wa.me/5511941026207');
    VENDEDORES.vendas['4'].link = getSignedLink('https://wa.me/5511970373903');
    VENDEDORES.pedidos['1'].link = getSignedLink('https://wa.me/5511910484602');
    VENDEDORES.sac['1'].link = getSignedLink('https://wa.me/5511987590992');
    VENDEDORES.sac['2'].link = getSignedLink('https://wa.me/551120824441');
    VENDEDORES.sac['3'].link = getSignedLink('https://wa.me/5511912537807');
  }
}

// 🟢 Inicialização do bot
configurarLinksVendedores();
console.log('Iniciando chatbot CIKALA');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'cikala-bot', dataPath: './sessions' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WhatsApp Conectado!'));
client.on('authenticated', session => SessionManager.saveSession('whatsapp-client', session));
client.on('auth_failure', () => SessionManager.clearSession('whatsapp-client'));
client.initialize();

// ✉️ Funções de interação
async function enviarMenuInicial(msg, reset = true) {
  if (reset) activeSessions.set(msg.from, SESSION_STATES.MENU);
  const contact = await msg.getContact();
  const name = extractName(contact);
  const saudacao = getGreetingByHour();

  await delay(1000);
  return client.sendMessage(msg.from, `${saudacao}, ${name}! 🌟\n\nMe chamo Ariel, sou assistente virtual da *CIKALA*. Como posso te ajudar hoje?\n\n1️⃣ *Vendas* - Falar com nosso time comercial\n2️⃣ *Pedidos* - Acompanhar seu pedido\n3️⃣ *SAC* - Falar com setor de atendimento\n\nÉ só digitar o número da opção desejada 😊`);
}

async function logLinkSent(phone, name, category, option, vendedor, link) {
  await db.logInteraction({
    type: 'link_sent',
    phone, name, category, option, vendedor, link,
    timestamp: new Date().toISOString()
  });
}

async function handleMainMenu(msg, text, name, phone) {
  if (!['1', '2', '3'].includes(text)) {
    return client.sendMessage(msg.from, `Oi ${name}, por favor, escolha uma opção digitando 1️⃣, 2️⃣ ou 3️⃣. 😊\nPara selecionar o setor desejado`);
  }

  if (text === '1') {
    const id = getNextVendedor();
    const vendedor = VENDEDORES.vendas[id];
    await client.sendMessage(msg.from, `${name}, fico muito feliz pelo seu contato! Para falar com o atendente acesse o link: ${vendedor.link}`);
    await logLinkSent(phone, name, 'vendas', id, vendedor.nome, vendedor.link);
    activeSessions.set(msg.from, SESSION_STATES.RETURN);
    return client.sendMessage(msg.from, `Posso te ajudar em algo mais? Digite *Sim* para retornar o menu inicial ou *Não* para encerrar o contato.`);
  }

  if (text === '2') {
    const pedido = VENDEDORES.pedidos['1'];
    await client.sendMessage(msg.from, `${name}, fico muito feliz pelo seu contato! Para falar com o atendente acesse o link: ${pedido.link}`);
    await logLinkSent(phone, name, 'pedidos', '1', pedido.nome, pedido.link);
    activeSessions.set(msg.from, SESSION_STATES.RETURN);
    return client.sendMessage(msg.from, `Posso te ajudar em algo mais? Digite *Sim* para retornar o menu inicial ou *Não* para encerrar o contato`);
  }

  if (text === '3') {
    activeSessions.set(msg.from, SESSION_STATES.SAC);
    return client.sendMessage(msg.from, `Qual setor de atendimento deseja contato?:\n1️⃣ SAC Pedido Mercado Livre\n2️⃣ SAC Site/Vendedores\n3️⃣ SAC Marketplace\n0️⃣ Menu Inicial`);
  }
}

async function handleSacMenu(msg, text, name, phone) {
  if (text === '0') return enviarMenuInicial(msg);
  const canal = VENDEDORES.sac[text];
  if (!canal) return client.sendMessage(msg.from, `Opção inválida, ${name}.`);
  await client.sendMessage(msg.from, `${name}, acesse: ${canal.link}`);
  await logLinkSent(phone, name, 'sac', text, canal.nome, canal.link);
  activeSessions.set(msg.from, SESSION_STATES.SAC_OPTION);
  return client.sendMessage(msg.from, `1️⃣ Voltar ao SAC\n2️⃣ Menu principal`);
}

async function handleSacOptions(msg, text, name) {
  if (text === '1') {
    activeSessions.set(msg.from, SESSION_STATES.SAC);
    return client.sendMessage(msg.from, `Qual opção de atendimento ao cliente (SAC) deseja?\n1️⃣ SAC Mercado Livre\n2️⃣ SAC Site/Vendedores\n3️⃣ SAC Marketplace\n0️⃣ Menu`);
  }
  if (text === '2') return enviarMenuInicial(msg);
  return client.sendMessage(msg.from, `Digite apenas 1 ou 2, por favor.`);
}

async function handleReturnOption(msg, text, name) {
  if (/^sim$/i.test(text)) return enviarMenuInicial(msg);
  if (/^n[aã]o$/i.test(text)) {
    activeSessions.delete(msg.from);
    return client.sendMessage(msg.from, `${getFarewellByHour()}, ${name}! 🌟\nA *CIKALA* agradece seu contato.`);
  }
  return client.sendMessage(msg.from, `Olá ${name}, responda apenas com *Sim* ou *Não*.`);
}

// 🛠️ Comandos de administrador
async function handleAdminCommand(msg, command) {
  const chatId = msg.from;
  const user = msg._data?.notifyName || 'Admin';
  const parts = command.trim().split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case '!ping':
      return client.sendMessage(chatId, `🏓 Pong! Bot online, ${user}.`);
    case '!reiniciar':
      await client.sendMessage(chatId, `♻️ Reiniciando bot...`);
      process.exit(0);
    case '!limpar':
      activeSessions.clear();
      return client.sendMessage(chatId, `🧹 Sessões limpas com sucesso.`);
    case '!exportar':
      if (args.length !== 2) return client.sendMessage(chatId, `❗ Use: *!exportar 2025 04*`);
      try {
        const year = parseInt(args[0]), month = parseInt(args[1]);
        const report = await reportGenerator.getSalesReport(new Date(year, month - 1, 1), new Date(year, month, 0));
        const filePath = await exportReportToExcel(report, `relatorio-${year}-${month}.xlsx`);
        return client.sendMessage(chatId, `📤 Relatório exportado com sucesso!\nSalvo em: ${filePath}`);
      } catch (err) {
        return client.sendMessage(chatId, `❌ Erro: ${err.message}`);
      }
    case '!relatorio':
      if (args.length === 0) return client.sendMessage(chatId, `❗ Use:\n!relatorio hoje\n!relatorio mês 2025 04`);
      try {
        let report;
        if (args[0] === 'hoje') {
          const today = new Date();
          report = await reportGenerator.getSalesReport(today, today);
        } else if (args[0] === 'mês' && args.length === 3) {
          const [_, year, month] = args;
          report = await reportGenerator.getSalesReport(new Date(year, month - 1, 1), new Date(year, month, 0));
        }
        const texto = formatReport(report);
        return client.sendMessage(chatId, texto);
      } catch (err) {
        return client.sendMessage(chatId, `❌ Erro: ${err.message}`);
      }
    default:
      return client.sendMessage(chatId, `❓ Comando desconhecido: *${cmd}*`);
  }
}

function formatReport(report) {
  let text = `📊 *Relatório Cikala* (${report.period})\n\n`;
  text += `🔢 Total de interações: ${report.total}\n\n🛍️ *Vendas*\n`;
  Object.entries(report.byCategory.vendas).forEach(([nome, q]) => text += `• ${nome}: ${q}\n`);
  text += `\n📦 *Pedidos*: ${Object.values(report.byCategory.pedidos)[0]}\n\n🛠️ *SAC*\n`;
  Object.entries(report.byCategory.sac).forEach(([nome, q]) => text += `• ${nome}: ${q}\n`);
  text += `\n⏰ Pico de Atividade: ${report.hourlyDistribution.peakHour.hour}h\n📅 Dia mais movimentado: ${format(new Date(report.dailyTrends.busiestDay.date), 'dd/MM')}`;
  return text;
}

// 📩 Manipulação de mensagens
client.on('message', authMiddleware(async (msg) => {
  try {
    const contact = await msg.getContact();
    const name = extractName(contact);
    const phone = msg.from.replace('@c.us', '');
    const text = msg.body.trim();
    const session = activeSessions.get(msg.from);

    await db.logInteraction({ type: 'message_received', phone, name, message: text });

    if (msg.from === process.env.ADMIN_NUMBER && text.startsWith('!')) {
      return handleAdminCommand(msg, text);
    }

     // Verificar se a mensagem é uma resposta esperada
     if (session && session !== SESSION_STATES.MENU && ['1', '2', '3', 'sim', 'não', 'nao'].includes(text.toLowerCase())) {
      // Processar normalmente
    } else if (!session) {
      return enviarMenuInicial(msg);
    }

    switch (session) {
      case SESSION_STATES.MENU:
        return handleMainMenu(msg, text, name, phone);
      case SESSION_STATES.SAC:
        return handleSacMenu(msg, text, name, phone);
      case SESSION_STATES.SAC_OPTION:
        return handleSacOptions(msg, text, name);
      case SESSION_STATES.RETURN:
        return handleReturnOption(msg, text, name);
      default:
        return enviarMenuInicial(msg);
    }
  } catch (error) {
    console.error('Erro de execução:', error);
    await db.logSecurityEvent({ type: 'error', error: error.message, stack: error.stack });
  }
}));

process.on('unhandledRejection', (error) => {
  console.error('Erro não tratado:', error);
  db.logSecurityEvent({ type: 'unhandled_rejection', error: error.message, stack: error.stack });
});
