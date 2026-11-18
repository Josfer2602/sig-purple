fetch('http://localhost:5000/api/ordenes').then(r => r.json()).then(d => console.dir(d, {depth: null})).catch(console.error);
