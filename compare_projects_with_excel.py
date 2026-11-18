import openpyxl, os, sys, json, urllib.request

sys.stdout.reconfigure(encoding='utf-8')

print("1. Fetching projects from production API...")
req = urllib.request.Request("https://purple.devlian.de/api/proyectos", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req) as resp:
    db_projects = json.loads(resp.read().decode('utf-8'))

print(f"Total projects in DB: {len(db_projects)}")

print("2. Loading Excel file...")
fname = [f for f in os.listdir('.') if f.endswith('.xlsm') and '(6)' in f][0]
wb = openpyxl.load_workbook(fname, data_only=True)
sheet = wb['BASE DE DATOS']

excel_rows = []
for r in range(15, sheet.max_row + 1):
    cliente = sheet.cell(row=r, column=4).value
    actividad = sheet.cell(row=r, column=5).value
    if not actividad and not cliente:
        continue
    
    subtotal = sheet.cell(row=r, column=16).value
    presupuesto_si_no = sheet.cell(row=r, column=15).value
    prom_de = sheet.cell(row=r, column=17).value
    prom_hasta = sheet.cell(row=r, column=18).value
    prom_plazo = sheet.cell(row=r, column=29).value
    
    estado = sheet.cell(row=r, column=11).value
    fecha_prop = sheet.cell(row=r, column=1).value
    fecha_est = sheet.cell(row=r, column=12).value
    
    subtotal_num = 0.0
    if subtotal is not None:
        try:
            subtotal_num = float(subtotal)
        except:
            subtotal_num = 0.0
            
    excel_rows.append({
        "row": r,
        "cliente": str(cliente).strip() if cliente else "",
        "actividad": str(actividad).strip() if actividad else "",
        "subtotal": subtotal_num,
        "col15": presupuesto_si_no,
        "col17": prom_de,
        "col18": prom_hasta,
        "col29": prom_plazo,
        "estado": str(estado).strip() if estado else "",
        "fechaProp": str(fecha_prop).split(' ')[0] if fecha_prop else "",
        "fechaEst": str(fecha_est).split(' ')[0] if fecha_est else ""
    })

print(f"Total rows parsed from Excel BASE DE DATOS: {len(excel_rows)}")

# Let's inspect differences!
# Build a map of db projects by normalized name and by id
db_by_name = {}
for p in db_projects:
    norm_name = p['nombre'].strip().lower()
    if norm_name not in db_by_name:
        db_by_name[norm_name] = []
    db_by_name[norm_name].append(p)

mismatches = []
not_found = []
exact_matches = 0

for erow in excel_rows:
    act = erow['actividad']
    norm_act = act.lower()
    ex_sub = round(erow['subtotal'], 2)
    
    matches = db_by_name.get(norm_act, [])
    if not matches:
        not_found.append(erow)
    else:
        # Check if any match has the exact same subtotal
        matched_proj = None
        for m in matches:
            db_sub = round(float(m.get('subtotal') or 0), 2)
            if abs(db_sub - ex_sub) < 0.05:
                matched_proj = m
                break
        
        if matched_proj:
            exact_matches += 1
        else:
            mismatches.append({
                "excel_row": erow['row'],
                "cliente": erow['cliente'],
                "actividad": act,
                "excel_subtotal": ex_sub,
                "db_projects": [{
                    "id": m['id'],
                    "nombre": m['nombre'],
                    "subtotal": round(float(m.get('subtotal') or 0), 2),
                    "presupuestoEstimado": m.get('presupuestoEstimado'),
                    "estado": m.get('estado')
                } for m in matches]
            })

print("\n=== SUMMARY OF COMPARISON ===")
print(f"Exact matches (name + subtotal): {exact_matches}")
print(f"Subtotal Mismatches: {len(mismatches)}")
print(f"Not found by exact name: {len(not_found)}")

if mismatches:
    print("\n--- SAMPLE 20 MISMATCHES ---")
    for m in mismatches[:20]:
        db_subs = [f"{p['id']}: S/{p['subtotal']}" for p in m['db_projects']]
        print(f"Row {m['excel_row']} | {m['cliente'][:15]} | {m['actividad'][:35]} | Excel: S/{m['excel_subtotal']:,.2f} | DB: {', '.join(db_subs)}")

if not_found:
    print("\n--- SAMPLE 15 NOT FOUND BY EXACT NAME ---")
    for nf in not_found[:15]:
        print(f"Row {nf['row']} | {nf['cliente'][:15]} | {nf['actividad'][:40]} | Excel: S/{nf['subtotal']:,.2f}")
