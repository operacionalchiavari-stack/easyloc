// Public assets use .js so static servers serve modules with a JavaScript MIME type.
const fs = require('node:fs');
const path = require('node:path');
const source = path.dirname(require.resolve('pdfjs-dist/package.json'));
const target = path.resolve(__dirname, '../js/vendor/pdfjs');
fs.mkdirSync(target, { recursive: true });
for (const name of ['pdf', 'pdf.worker']) {
  fs.copyFileSync(path.join(source, 'build', `${name}.min.mjs`), path.join(target, `${name}.js`));
}
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true });
}
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE'));
fs.writeFileSync(path.join(target, 'version.json'), JSON.stringify({ version: require('pdfjs-dist/package.json').version }) + '\n');
