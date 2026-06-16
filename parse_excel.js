const XLSX = require('./node_modules/xlsx');
const workbook = XLSX.readFile('ROL  JUNIO 2026.xlsx');
console.log('Sheets:', workbook.SheetNames);
workbook.SheetNames.forEach(sheetName => {
  console.log('\n=== Sheet:', sheetName, '===');
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  data.slice(0, 40).forEach((row, i) => {
    if (row.some(cell => cell !== '')) {
      console.log('Row', i, ':', JSON.stringify(row));
    }
  });
});
