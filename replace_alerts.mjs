import fs from 'fs';
import path from 'path';

const srcDir = 'f:/SIG Purple V2/src';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(srcDir);
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  if (content.includes('alert(')) {
    // Determine if it needs toast import
    if (!content.includes("import toast from 'react-hot-toast'")) {
      // Add import after last import
      const lastImportIndex = content.lastIndexOf('import ');
      if (lastImportIndex !== -1) {
        const nextLineIndex = content.indexOf('\n', lastImportIndex);
        content = content.slice(0, nextLineIndex + 1) + "import toast from 'react-hot-toast';\n" + content.slice(nextLineIndex + 1);
      } else {
        content = "import toast from 'react-hot-toast';\n" + content;
      }
    }

    content = content.replace(/alert\((.*?)\);?/g, (match, p1) => {
      const isSuccess = p1.toLowerCase().includes('éxito') || p1.toLowerCase().includes('correctamente') || p1.toLowerCase().includes('copiado');
      return `toast.${isSuccess ? 'success' : 'error'}(${p1});`;
    });
    
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated', file);
  }
});
