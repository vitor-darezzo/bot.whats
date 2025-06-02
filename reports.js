// reports.js
const { SecureDatabase, VENDEDORES } = require('./database');
const { subDays, format, eachDayOfInterval } = require('date-fns');

class ReportGenerator {
  constructor() {
    this.db = new SecureDatabase();
  }

  async getSalesReport(startDate, endDate) {
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    let allLogs = [];

    for (const day of days) {
      const logDate = day.toISOString().split('T')[0];
      const dailyLogs = await this.db.getLogsByDateString(logDate);
      allLogs = [...allLogs, ...dailyLogs];
    }

    const linkLogs = allLogs.filter(log => log.type === 'link_sent');

    return {
      period: `${format(startDate, 'dd/MM/yyyy')} - ${format(endDate, 'dd/MM/yyyy')}`,
      total: linkLogs.length,
      byCategory: {
        vendas: this._countByOption(linkLogs, 'vendas'),
        pedidos: this._countByOption(linkLogs, 'pedidos'),
        sac: this._countByOption(linkLogs, 'sac')
      },
      hourlyDistribution: this._getHourlyStats(linkLogs),
      dailyTrends: this._getDailyTrends(allLogs, startDate, endDate)
    };
  }

  _countByOption(logs, category) {
    const result = {};
    Object.keys(VENDEDORES[category]).forEach(option => {
      const item = VENDEDORES[category][option];
      result[item.nome] = logs.filter(l =>
        l.category === category && l.option === option
      ).length;
    });
    return result;
  }

  _getHourlyStats(logs) {
    const hours = Array(24).fill(0);
    logs.forEach(log => {
      const hour = new Date(log.timestamp).getHours();
      hours[hour]++;
    });

    const max = Math.max(...hours);
    const min = Math.min(...hours.filter(h => h > 0));

    return {
      distribution: hours,
      peakHour: { hour: hours.indexOf(max), count: max },
      lowHour: { hour: hours.indexOf(min), count: min }
    };
  }

  _getDailyTrends(logs, startDate, endDate) {
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const dailyCounts = {};

    days.forEach(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      dailyCounts[dayStr] = logs.filter(l =>
        l.timestamp.startsWith(dayStr)
      ).length;
    });

    const counts = Object.values(dailyCounts);
    const max = Math.max(...counts);
    const min = Math.min(...counts.filter(c => c > 0));

    return {
      dailyCounts,
      busiestDay: {
        date: Object.keys(dailyCounts).find(k => dailyCounts[k] === max),
        count: max
      },
      quietestDay: {
        date: Object.keys(dailyCounts).find(k => dailyCounts[k] === min),
        count: min
      }
    };
  }
}

module.exports = ReportGenerator;

