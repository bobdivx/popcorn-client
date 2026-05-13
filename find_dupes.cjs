const fs = require('fs');
const content = fs.readFileSync('src/locales/fr.json', 'utf8');

function findDuplicates(jsonStr) {
  const lines = jsonStr.split('\n');
  const pathStack = [];
  const keyMap = new Map(); // path -> Set of keys

  let currentPath = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const keyMatch = line.match(/^\s*\"([^\"]+)\"\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      const indent = line.match(/^\s*/)[0].length;
      
      // Determine level based on indentation (simple heuristic)
      const level = indent / 2;
      pathStack.length = level;
      pathStack[level] = key;
      
      const parentPath = pathStack.slice(0, level).join('.');
      const fullPath = parentPath + (parentPath ? '.' : '') + key;
      
      if (!keyMap.has(parentPath)) {
        keyMap.set(parentPath, new Set());
      }
      
      if (keyMap.get(parentPath).has(key)) {
        console.log(`Duplicate key found: "${key}" at path "${parentPath}" on line ${i + 1}`);
      } else {
        keyMap.get(parentPath).add(key);
      }
    }
  }
}

findDuplicates(content);
