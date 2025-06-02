const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { encrypt, decrypt } = require('./crypto-utils');

// Caminho para o banco de dados SQLite
const databasePath = path.join(__dirname, 'sessions.db');

class SessionManager {
  constructor() {
    this.db = new sqlite3.Database(databasePath, (err) => {
      if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
      } else {
        this.initDatabase();
      }
    });
  }

  initDatabase() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `, (err) => {
      if (err) console.error('Erro ao criar tabela:', err);
    });
  }

  saveSession(id, sessionData) {
    if (!sessionData) {
      console.error(`❌ Sessão inválida: nada foi recebido para o ID "${id}".`);
      return;
    }

    try {
      const json = JSON.stringify(sessionData);
      const encrypted = encrypt(json);

      this.db.run(
        'INSERT OR REPLACE INTO sessions (id, data) VALUES (?, ?)',
        [id, encrypted],
        (err) => {
          if (err) console.error('Erro ao salvar sessão no banco de dados:', err);
        }
      );
    } catch (e) {
      console.error('❌ Erro ao salvar sessão:', e);
    }
  }

  getSession(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT data FROM sessions WHERE id = ?',
        [id],
        (err, row) => {
          if (err) return reject(err);
          resolve(row ? JSON.parse(decrypt(row.data)) : null);
        }
      );
    });
  }

  clearSession(id) {
    this.db.run('DELETE FROM sessions WHERE id = ?', [id]);
  }
}

module.exports = new SessionManager();
