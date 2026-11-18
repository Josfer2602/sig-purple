import openpyxl

wb = openpyxl.load_workbook('Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm', data_only=True)

# Check Rentabilidad por Proyecto
ws_rent = wb['Rentabilidad por Proyecto']
rent_rows = []
for r in range(11, ws_rent.max_row + 1):
    vals = [ws_rent.cell(r, c).value for c in range(1, 20)]
    if any(v is not None and str(v).strip() != '' for v in vals):
        rent_rows.append(vals)

print(f"=== Rentabilidad por Proyecto: Total rows = {len(rent_rows)} ===")
# Cols: 1: None, 2: #, 3: Servicio, 4: Tipo servicio, 5: Actividad, 6: Cliente, 7: Moneda,
# 8: Fecha Aceptacion, 9: Mes, 10: Año, 11: Costo Sin IGV, 12: Gastos Adicionales,
# 13: Facturacion Sin IGV, 14: Factoring, 15: Margen, 16: Mark Up, 17: Mark Down, 18: Status, 19: Observaciones

# Check Stand Perú Sostenible in Rentabilidad
for r in rent_rows:
    act = str(r[4] or '')
    cli = str(r[5] or '')
    if 'sostenible' in act.lower() or 'aap' in cli.lower() or 'izipay' in cli.lower():
        print(f"Rentabilidad match: Cliente={cli} | Actividad={act} | Año={r[9]} | Costo={r[10]} | Fact={r[12]} | Margen={r[14]} | Status={r[17]}")

# Check Pago Proveedores
ws_pp = wb['Pago Proveedores']
pp_rows = []
for r in range(10, ws_pp.max_row + 1):
    vals = [ws_pp.cell(r, c).value for c in range(1, 19)]
    if any(v is not None and str(v).strip() != '' for v in vals):
        pp_rows.append(vals)

print(f"\n=== Pago Proveedores: Total rows = {len(pp_rows)} ===")
for r in pp_rows:
    cli = str(r[3] or '')
    act = str(r[4] or '')
    prov = str(r[6] or '')
    if 'sostenible' in act.lower() or 'aap' in cli.lower():
        print(f"Pago Prov match: Prov={prov} | Cli={cli} | Act={act} | Monto={r[9]} | Total={r[11]} | Status={r[13]}")
