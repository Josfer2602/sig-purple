import openpyxl

wb = openpyxl.load_workbook('Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm', data_only=True)

ws_rent = wb['Rentabilidad por Proyecto']
ws_pp = wb['Pago Proveedores']
ws_ad = wb['ADICIONALES']

print("=== Comparing Rentabilidad vs Pago Proveedores ===")
# Rentabilidad rows
rent_by_act = {}
for r in range(11, ws_rent.max_row + 1):
    act = ws_rent.cell(r, 5).value
    cli = ws_rent.cell(r, 6).value
    cost = ws_rent.cell(r, 11).value
    gastos_ad = ws_rent.cell(r, 12).value
    fact = ws_rent.cell(r, 13).value
    margen = ws_rent.cell(r, 15).value
    if act:
        key = (str(cli or '').strip().lower(), str(act or '').strip().lower())
        rent_by_act[key] = {
            'act': str(act).strip(),
            'cli': str(cli).strip(),
            'cost': float(cost) if cost and isinstance(cost, (int, float)) else 0.0,
            'gastos_ad': float(gastos_ad) if gastos_ad and isinstance(gastos_ad, (int, float)) else 0.0,
            'fact': float(fact) if fact and isinstance(fact, (int, float)) else 0.0,
            'margen': float(margen) if margen and isinstance(margen, (int, float)) else 0.0
        }

print(f"Total entries in Rentabilidad: {len(rent_by_act)}")

# Sum of Pago Proveedores by client + activity
pp_by_act = {}
for r in range(10, ws_pp.max_row + 1):
    cli = ws_pp.cell(r, 4).value
    act = ws_pp.cell(r, 5).value
    prov = ws_pp.cell(r, 7).value
    monto_sin_igv = ws_pp.cell(r, 10).value
    total = ws_pp.cell(r, 12).value
    if act:
        key = (str(cli or '').strip().lower(), str(act or '').strip().lower())
        if key not in pp_by_act:
            pp_by_act[key] = {'total_sin_igv': 0.0, 'total_con_igv': 0.0, 'items': []}
        m = float(monto_sin_igv) if monto_sin_igv and isinstance(monto_sin_igv, (int, float)) else 0.0
        tot = float(total) if total and isinstance(total, (int, float)) else 0.0
        pp_by_act[key]['total_sin_igv'] += m
        pp_by_act[key]['total_con_igv'] += tot
        pp_by_act[key]['items'].append({
            'prov': str(prov).strip() if prov else 'Varios',
            'monto': m,
            'total': tot
        })

print(f"Total projects with Pago Proveedores: {len(pp_by_act)}")

# Check 5 matches
matches = 0
for k, r_data in list(rent_by_act.items())[:10]:
    pp_data = pp_by_act.get(k)
    if pp_data:
        matches += 1
        print(f"\nProj: {r_data['cli']} -> {r_data['act']}")
        print(f"  Rent Costo Sin IGV: {r_data['cost']} | PP Total Sin IGV: {pp_data['total_sin_igv']} (Items: {len(pp_data['items'])})")
print(f"\nInitial sample matches: {matches}/10")
