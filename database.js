const fs = require('fs');
const path = require('path');
const { encrypt, decrypt } = require('./crypto-utils');
const crypto = require('crypto');

const SECURE_DIR = path.join(__dirname, 'secure_logs');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

class SecureDatabase {
  constructor() {
    if (!fs.existsSync(SECURE_DIR)) {
      fs.mkdirSync(SECURE_DIR, { mode: 0o700 });
    }
    this.securityLog = path.join(SECURE_DIR, 'security.log');
  }

  async logInteraction(data) {
    try {
      const date = new Date();
      const logDate = date.toISOString().split('T')[0];
      const logFile = path.join(SECURE_DIR, `logs_${logDate}.enc`);

      let logs = [];
      if (fs.existsSync(logFile)) {
        const encrypted = fs.readFileSync(logFile, 'utf-8');
        logs = JSON.parse(decrypt(encrypted));
      }

      logs.push({
        timestamp: date.toISOString(),
        phone: data.phone ? data.phone.slice(-4) : 'unknown',
        ...data
      });

      fs.writeFileSync(logFile, encrypt(JSON.stringify(logs)), { mode: 0o600 });
    } catch (error) {
      console.error('Erro ao registrar interação:', error);
      this.logSecurityEvent({
        type: 'log_error',
        error: error.message,
        stack: error.stack
      });
    }
  }

  logSecurityEvent(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event
    };
    fs.appendFileSync(this.securityLog, JSON.stringify(logEntry) + '\n', { mode: 0o600 });
  }

  async getLogsByDateString(dateString) {
    const logFile = path.join(SECURE_DIR, `logs_${dateString}.enc`);
    if (!fs.existsSync(logFile)) return [];

    try {
      const encrypted = fs.readFileSync(logFile, 'utf-8');
      return JSON.parse(decrypt(encrypted));
    } catch (error) {
      this.logSecurityEvent({
        type: 'decrypt_error',
        error: error.message,
        file: logFile
      });
      return [];
    }
  }

  async generateDailyReport(date = new Date()) {
    const logDate = date.toISOString().split('T')[0];
    return this.getLogsByDateString(logDate);
  }

  async generateMonthlyReport(year, month) {
    const logs = [];

    for (let day = 1; day <= 31; day++) {
      const dia = String(day).padStart(2, '0');
      const mes = String(month).padStart(2, '0');
      const dateStr = `${year}-${mes}-${dia}`;
      const dayLogs = await this.getLogsByDateString(dateStr);
      logs.push(...dayLogs);
    }

    return logs;
  }

  async generateReportByDates(datesArray = []) {
    const logs = [];

    for (const dateStr of datesArray) {
      const dayLogs = await this.getLogsByDateString(dateStr);
      logs.push(...dayLogs);
    }

    return logs;
  }

  validateLinkSignature(link, signature) {
    const expected = crypto.createHmac('sha256', process.env.LINK_SECRET)
      .update(link)
      .digest('hex');
    return expected === signature;
  }
}

// Mapeamento dos vendedores/canais
const VENDEDORES = {
  vendas: {
    '1': { nome: 'vendedor1', tipo: 'Vendas' },
    '2': { nome: 'vendedor2', tipo: 'Vendas' },
    '3': { nome: 'vendedor3', tipo: 'Vendas' },
    '4': { nome: 'vendedor4', tipo: 'Vendas' }
  },
  pedidos: {
    '1': { nome: 'Posição de Pedido', tipo: 'Logística' }
  },
  sac: {
    '1': { nome: 'Mercado Livre', tipo: 'SAC' },
    '2': { nome: 'Site/Vendedores', tipo: 'SAC' },
    '3': { nome: 'Marketplace', tipo: 'SAC' }
  }
};

module.exports = { SecureDatabase, VENDEDORES };
