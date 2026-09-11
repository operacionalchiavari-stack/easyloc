const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const [source, target] of [
  ['three/build', 'three/build'],
  ['three/examples/jsm', 'three/examples/jsm'],
  ['three/LICENSE', 'three/LICENSE'],
  ['@google/model-viewer/dist/model-viewer.min.js', 'model-viewer/model-viewer.min.js'],
  ['@google/model-viewer/LICENSE', 'model-viewer/LICENSE'],
]) {
  const destination = path.join(root, 'js/vendor', target);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, 'node_modules', source), destination, { recursive: true });
}
