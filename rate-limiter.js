class RateLimiter {
    constructor({ limit = 10, interval = 60000 }) {
      this.limit = limit;
      this.interval = interval;
      this.hits = new Map();
    }
  
    check(id) {
      const now = Date.now();
      const info = this.hits.get(id) || { count: 0, lastHit: 0 };
  
      // Reset se o intervalo expirou
      if (now - info.lastHit > this.interval) {
        info.count = 0;
      }
  
      info.count++;
      info.lastHit = now;
      this.hits.set(id, info);
  
      return info.count <= this.limit;
    }
  }
  
  module.exports = new RateLimiter({ limit: 10 }); // 10 mensagens por minuto
  