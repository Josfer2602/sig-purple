import openpyxl, os, sys, json, urllib.request

sys.stdout.reconfigure(encoding='utf-8')

req = urllib.request.Request("https://purple.devlian.de/api/proyectos", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    db_projects = json.loads(resp.read().decode('utf-8'))

fname = [f for f in os.listdir('.') if f.endswith('.xlsm') and '(6)' in f][0]
wb = openpyxl.load_workbook(fname, data_only=True)
sheet = wb['BASE DE DATOS']

# Build map of db projects
# Map by exact (nombre.lower(), cliente.lower())
db_map = {}
for p in db_projects:
    c_empresa = p.get('cliente', {}).get('empresa', '') if p.get('cliente') else ''
    k = (p['nombre'].strip().lower(), c_empresa.strip().lower())
    if k not in db_map:
        db_map[k] = []
    db_map[k].append(p)

mismatches = []
for r in range(15, sheet.max_row + 1):
    cliente = str(sheet.cell(row=r, column=4).value or '').strip()
    actividad = str(sheet.cell(row=r, column=5).value or '').strip()
    if not actividad and not cliente:
        continue
    
    sub_val = sheet.cell(row=r, column=16).value
    try:
        ex_sub = round(float(sub_val or 0), 2)
    except:
        ex_sub = 0.0

    k = (actividad.lower(), cliente.lower())
    matches = db_map.get(k, [])
    
    # If not found by (actividad, cliente), try by actividad alone
    if not matches:
        for (a_name, c_name), plist in db_map.items():
            if a_name == actividad.lower():
                matches = plist
                break
                
    if matches:
        # Check if any match has identical subtotal
        has_exact = any(abs(round(float(m.get('subtotal') or 0), 2) - ex_sub) < 0.05 for m in matches)
        if not has_exact:
            mismatches.append({
                "row": r,
                "cliente": cliente,
                "actividad": actividad,
                "excel_subtotal": ex_sub,
                "db_matches": [{
                    "id": m['id'],
                    "nombre": m['nombre'],
                    "subtotal": round(float(m.get('subtotal') or 0), 2),
                    "estado": m.get('estado')
                } for m in matches]
            })

print(f"Total Excel rows: {sheet.max_row - 14}")
print(f"Total mismatches: {len(mismatches)}")
print("\n=== ALL MISMATCHES ===")
for idx, m in enumerate(mismatches, 1):
    db_info = "; ".join([f"{p['id']}: S/{p['subtotal']:,.2f} ({p['estado']})" for p in m['db_matches']])
    diff = m['excel_subtotal'] - m['db_matches'][0]['subtotal']
    print(f"{idx:3d}. Row {m['row']:4d} | {m['cliente'][:18]:18s} | {m['actividad'][:38]:38s} | Excel: S/{m['excel_subtotal']:>11,.2f} | DB: {db_info} | Diff: S/{diff:>10,.2f}")

with open('mismatches.json', 'w', encoding='utf-8') as f:
    json.dump(mismatches, f, ensure_ascii=False, indent=2)
print("\nSaved all mismatches to mismatches.json")
