const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function exportReportToExcel(report, filename = 'relatorio.xlsx') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Relatório CIKALA');

  sheet.columns = [
    { header: 'Categoria', key: 'categoria', width: 25 },
    { header: 'Nome', key: 'nome', width: 30 },
    { header: 'Total', key: 'total', width: 15 },
  ];

  const categorias = ['vendas', 'pedidos', 'sac'];

  categorias.forEach((cat) => {
    const dados = report.byCategory[cat];
    for (const nome in dados) {
      sheet.addRow({ categoria: cat, nome, total: dados[nome] });
    }
  });

  const filePath = path.join(__dirname, filename);
  await workbook.xlsx.writeFile(filePath);

  return filePath;
}

module.exports = { exportReportToExcel };
