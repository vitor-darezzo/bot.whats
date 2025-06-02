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

// Vendor data with placeholder values
const VENDEDORES = {
  vendas: {
    '1': { nome: "Vendedor 1", link: "https://wa.me/5599999999999" },
    '2': { nome: "Vendedor 2", link: "https://wa.me/5599999999999" },
    '3': { nome: "Vendedor 3", link: "https://wa.me/5599999999999" },
    '4': { nome: "Vendedor 4", link: "https://wa.me/5599999999999" }
  },
  pedidos: {
    '1': { nome: "Atendente Pedidos", link: "https://wa.me/5599999999999" }
  },
  sac: {
    '1': { nome: "SAC Mercado Livre", link: "https://wa.me/5599999999999" },
    '2': { nome: "SAC Site", link: "https://wa.me/5599999999999" },
    '3': { nome: "SAC Marketplace", link: "https://wa.me/5599999999999" }
  }
};

// Session states
const SESSION_STATES = {
  MENU: 'aguardando_resposta',
  SAC: 'aguardando_sac',
  SAC_OPTION: 'aguardando_opcao_sac',
  RETURN: 'aguardando_retorno'
};

// Utilities
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function extractName(contact) {
  return contact.pushname ? contact.pushname.split(' ')[0] : 'usuário';
}

function getGreetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getFarewellByHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Tenha um bom dia';
  if (h < 18) return 'Tenha uma boa tarde';
  return 'Tenha uma boa noite';
}

// Rotating vendor selection
let vendedorIndex = 0;
function getNextVendedor() {
  vendedorIndex = (vendedorIndex + 1) % 4;
  return (vendedorIndex + 1).toString();
}

// Signed links
function getSignedLink(baseLink) {
  const signature = crypto.createHmac('sha256', process.env.LINK_SECRET).update(baseLink).digest('hex');
  return `${baseLink}?sig=${signature}`;
}

// Bot initialization
console.log('Iniciando chatbot');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'whatsapp-bot', dataPath: './sessions' }),
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

// Interaction functions
async function enviarMenuInicial(msg, reset = true) {
  if (reset) activeSessions.set(msg.from, SESSION_STATES.MENU);
  const contact = await msg.getContact();
  const name = extractName(contact);
  const saudacao = getGreetingByHour();

  await delay(800);
  return client.sendMessage(
    msg.from,
    `${saudacao}, ${name}! 🌟\n\nSou seu assistente virtual. Como posso ajudar?\n\n` +
    `1️⃣ *Vendas* - Falar com nosso time comercial\n` +
    `2️⃣ *Pedidos* - Acompanhar seu pedido\n` +
    `3️⃣ *SAC* - Falar com atendimento\n\n` +
    `Digite o número da opção desejada.`
  );
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
    return client.sendMessage(
      msg.from, 
      `Por favor, escolha uma opção válida (1, 2 ou 3).`
    );
  }

  if (text === '1') {
    const id = getNextVendedor();
    const vendedor = VENDEDORES.vendas[id];
    await client.sendMessage(
      msg.from, 
      `${name}, aqui está o contato do nosso atendente:\n${vendedor.link}`
    );
    await logLinkSent(phone, name, 'vendas', id, vendedor.nome, vendedor.link);
    activeSessions.set(msg.from, SESSION_STATES.RETURN);
    return client.sendMessage(
      msg.from, 
      `Posso ajudar em algo mais? Digite *Sim* para menu ou *Não* para encerrar.`
    );
  }

  if (text === '2') {
    const pedido = VENDEDORES.pedidos['1'];
    await client.sendMessage(
      msg.from, 
      `${name}, aqui está o contato para acompanhamento de pedidos:\n${pedido.link}`
    );
    await logLinkSent(phone, name, 'pedidos', '1', pedido.nome, pedido.link);
    activeSessions.set(msg.from, SESSION_STATES.RETURN);
    return client.sendMessage(
      msg.from, 
      `Posso ajudar em algo mais? Digite *Sim* para menu ou *Não* para encerrar.`
    );
  }

  if (text === '3') {
    activeSessions.set(msg.from, SESSION_STATES.SAC);
    return client.sendMessage(
      msg.from,
      `Selecione o setor de atendimento:\n` +
      `1️⃣ SAC Pedidos\n` +
      `2️⃣ SAC Site\n` +
      `3️⃣ SAC Marketplace\n` +
      `0️⃣ Menu Inicial`
    );
  }
}

async function handleSacMenu(msg, text, name, phone) {
  if (text === '0') return enviarMenuInicial(msg);
  const canal = VENDEDORES.sac[text];
  if (!canal) return client.sendMessage(msg.from, `Opção inválida.`);
  
  await client.sendMessage(msg.from, `${name}, acesse: ${canal.link}`);
  await logLinkSent(phone, name, 'sac', text, canal.nome, canal.link);
  activeSessions.set(msg.from, SESSION_STATES.SAC_OPTION);
  return client.sendMessage(
    msg.from,
    `1️⃣ Voltar ao SAC\n` +
    `2️⃣ Menu principal`
  );
}

async function handleSacOptions(msg, text, name) {
  if (text === '1') {
    activeSessions.set(msg.from, SESSION_STATES.SAC);
    return client.sendMessage(
      msg.from,
      `Selecione o setor de atendimento:\n` +
      `1️⃣ SAC Pedidos\n` +
      `2️⃣ SAC Site\n` +
      `3️⃣ SAC Marketplace\n` +
      `0️⃣ Menu`
    );
  }
  if (text === '2') return enviarMenuInicial(msg);
  return client.sendMessage(msg.from, `Por favor, digite 1 ou 2.`);
}

async function handleReturnOption(msg, text, name) {
  if (/^sim$/i.test(text)) return enviarMenuInicial(msg);
  if (/^n[aã]o$/i.test(text)) {
    activeSessions.delete(msg.from);
    return client.sendMessage(
      msg.from, 
      `${getFarewellByHour()}, ${name}!`
    );
  }
  return client.sendMessage(msg.from, `Responda com *Sim* ou *Não*.`);
}

// Admin commands
async function handleAdminCommand(msg, command) {
  const chatId = msg.from;
  const user = msg._data?.notifyName || 'Admin';
  const parts = command.trim().split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case '!ping':
      return client.sendMessage(chatId, `🏓 Pong! Bot online.`);
    case '!reiniciar':
      await client.sendMessage(chatId, `♻️ Reiniciando...`);
      process.exit(0);
    case '!limpar':
      activeSessions.clear();
      return client.sendMessage(chatId, `🧹 Sessões limpas.`);
    case '!exportar':
      if (args.length !== 2) return client.sendMessage(chatId, `❗ Uso: *!exportar ANO MÊS*`);
      try {
        const year = parseInt(args[0]), month = parseInt(args[1]);
        const report = await reportGenerator.getSalesReport(new Date(year, month - 1, 1), new Date(year, month, 0));
        const filePath = await exportReportToExcel(report, `relatorio-${year}-${month}.xlsx`);
        return client.sendMessage(chatId, `📤 Relatório exportado:\n${filePath}`);
      } catch (err) {
        return client.sendMessage(chatId, `❌ Erro: ${err.message}`);
      }
    case '!relatorio':
      if (args.length === 0) return client.sendMessage(chatId, `❗ Uso:\n!relatorio hoje\n!relatorio mês ANO MÊS`);
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
  let text = `📊 *Relatório* (${report.period})\n\n`;
  text += `🔢 Total: ${report.total}\n\n🛍️ *Vendas*\n`;
  Object.entries(report.byCategory.vendas).forEach(([nome, q]) => text += `• ${nome}: ${q}\n`);
  text += `\n📦 *Pedidos*: ${Object.values(report.byCategory.pedidos)[0]}\n\n🛠️ *SAC*\n`;
  Object.entries(report.byCategory.sac).forEach(([nome, q]) => text += `• ${nome}: ${q}\n`);
  text += `\n⏰ Pico: ${report.hourlyDistribution.peakHour.hour}h`;
  return text;
}

// Message handling
client.on('message', authMiddleware(async (msg) => {
  try {
    const contact = await msg.getContact();
    const name = extractName(contact);
    const phone = msg.from.replace('@c.us', '');
    const text = msg.body.trim();
    const session = activeSessions.get(msg.from);

    await db.logInteraction({ type: 'message_received', phone, name, message: text });

    // Handle admin commands
    if (msg.from === process.env.ADMIN_NUMBER && text.startsWith('!')) {
      return handleAdminCommand(msg, text);
    }

    // Handle session states
    if (!session) {
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
    console.error('Erro:', error);
    await db.logSecurityEvent({ 
      type: 'error', 
      error: error.message, 
      stack: error.stack 
    });
  }
}));

process.on('unhandledRejection', (error) => {
  console.error('Erro não tratado:', error);
  db.logSecurityEvent({ 
    type: 'unhandled_rejection', 
    error: error.message, 
    stack: error.stack 
  });
});
