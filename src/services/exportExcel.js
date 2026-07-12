const ExcelJS = require('exceljs');

async function buildWorkbook(sheetName, columns, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns;
  rows.forEach((row) => ws.addRow(row));
  ws.getRow(1).font = { bold: true };
  return wb;
}

async function sendExcel(res, filename, workbook) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { buildWorkbook, sendExcel };
