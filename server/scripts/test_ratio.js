function parsePorcentajeAdelanto(condicion) {
  if (!condicion) return 0.5;
  const text = condicion.trim();

  // Caso: 100% Adelanto / Contado
  if (/100%\s*(adelanto|contado)/i.test(text) || /^contado$/i.test(text) || /^100%$/i.test(text)) {
    return 1.0;
  }

  // Caso: 100% Contra Entrega o Crédito sin adelanto
  if (
    /100%\s*(contra\s*entrega|saldo)/i.test(text) ||
    /cr[eé]dito/i.test(text) ||
    /pago a \d+/i.test(text) ||
    /contra\s*entrega/i.test(text) && !text.includes('/') && !text.includes('adelanto')
  ) {
    return 0.0;
  }

  // Caso: Fracción tipo "X/Y" (ej: "50/50", "40/60", "20/80", "30 / 70", "25/75")
  const ratioMatch = text.match(/(\d{1,3})\s*[\/]\s*(\d{1,3})/);
  if (ratioMatch) {
    const p1 = parseFloat(ratioMatch[1]);
    if (!isNaN(p1) && p1 >= 0 && p1 <= 100) {
      return p1 / 100;
    }
  }

  // Caso: Porcentaje explícito de adelanto o inicial (ej: "40% Adelanto", "25% inicial")
  const pctMatch = text.match(/(\d{1,3}(?:\.\d+)?)%\s*(adelanto|inicial|entrega)?/i);
  if (pctMatch) {
    const p = parseFloat(pctMatch[1]);
    if (!isNaN(p) && p >= 0 && p <= 100) {
      return p / 100;
    }
  }

  return 0.5; // Valor por defecto estándar
}

console.log('50% Adelanto / 50% Contra Entrega =>', parsePorcentajeAdelanto('50% Adelanto / 50% Contra Entrega'));
console.log('50/50 =>', parsePorcentajeAdelanto('50/50'));
console.log('100% Adelanto =>', parsePorcentajeAdelanto('100% Adelanto'));
console.log('100% Contra Entrega =>', parsePorcentajeAdelanto('100% Contra Entrega'));
console.log('30% Adelanto / 70% Contra Entrega =>', parsePorcentajeAdelanto('30% Adelanto / 70% Contra Entrega'));

