const fs = require('fs');

const builderPath = 'f:\\SIG Purple V2\\src\\components\\CotizacionBuilder.tsx';
const deletedPath = 'f:\\SIG Purple V2\\deleted_lines.txt';

const builderLines = fs.readFileSync(builderPath, 'utf8').split('\n');
let deletedLines = fs.readFileSync(deletedPath, 'utf8').split('\n');

// Replace the manual save comment with the auto-save logic in deletedLines
const autoSaveLogic = `
  // Auto-save logic
  React.useEffect(() => {
    const draftKey = \`quoteDraft_\${initialQuote.id}\`;
    const draftStr = localStorage.getItem(draftKey);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        if (JSON.stringify(draft) !== JSON.stringify(quote)) {
          if (window.confirm('Tienes un borrador sin guardar de esta cotización. ¿Deseas restaurarlo?')) {
            setQuote(draft);
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      } catch (e) {
        localStorage.removeItem(draftKey);
      }
    }
  }, [initialQuote.id]);

  React.useEffect(() => {
    if (quote && quote.id) {
      localStorage.setItem(\`quoteDraft_\${quote.id}\`, JSON.stringify(quote));
    }
  }, [quote]);

  const handleSaveAndClearDraft = async (q) => {
    await onUpdateGlobal(q);
    localStorage.removeItem(\`quoteDraft_\${q.id}\`);
    toast.success('Cotización guardada exitosamente');
  };
`;

let newDeletedLines = [];
for (let i = 0; i < deletedLines.length; i++) {
    if (deletedLines[i].includes('// Manual save only to avoid spamming the database')) {
        newDeletedLines.push(autoSaveLogic);
    } else if (deletedLines[i].includes('onUpdateGlobal(quote);') && deletedLines[i-1] && deletedLines[i-1].includes('Guardar Cambios')) {
        // Fix the Guardar button
        newDeletedLines.push('            <button className="btn-primary" onClick={() => handleSaveAndClearDraft(quote)} style={{ backgroundColor: \'var(--bg-panel)\', border: \'1px solid var(--border-color)\', color: \'var(--text-primary)\', padding: \'6px 12px\', fontSize: \'0.85rem\' }} title="Guardar Cambios">');
        i++; // skip original button line
    } else {
        newDeletedLines.push(deletedLines[i]);
    }
}

// Splice them together
// Keep lines 0 to 25 from builderLines (0-indexed, so up to line 26: `cat.items.forEach((item: any) => {`)
// Then insert newDeletedLines
// Then append from line 27 onwards of builderLines (`<div className="glass-panel" ...`)
const finalLines = [
    ...builderLines.slice(0, 26),
    ...newDeletedLines,
    ...builderLines.slice(27)
];

fs.writeFileSync(builderPath, finalLines.join('\n'));
console.log('Restored CotizacionBuilder.tsx successfully.');
