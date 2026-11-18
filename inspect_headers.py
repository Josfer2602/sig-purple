import openpyxl

wb_path = 'Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm'
wb = openpyxl.load_workbook(wb_path, data_only=True)

# 1. Print first 15 rows of 'BASE DE DATOS'
ws_bd = wb['BASE DE DATOS']
print(f"=== BASE DE DATOS (max_row: {ws_bd.max_row}, max_col: {ws_bd.max_column}) ===")
for r in range(1, 20):
    vals = [ws_bd.cell(r, c).value for c in range(1, min(30, ws_bd.max_column + 1))]
    non_empty = [(c, v) for c, v in enumerate(vals, 1) if v is not None]
    if non_empty:
        print(f"Row {r}: {vals[:15]}")

print("\n=== Rentabilidad por Proyecto Row 10 headers ===")
ws_rent = wb['Rentabilidad por Proyecto']
rent_headers = [ws_rent.cell(10, c).value for c in range(1, ws_rent.max_column + 1)]
print([h for h in rent_headers if h is not None])

print("\n=== OC, Facturas y Cobranzas Row 10 headers ===")
ws_oc = wb['OC, Facturas y Cobranzas']
oc_headers = [ws_oc.cell(10, c).value for c in range(1, ws_oc.max_column + 1)]
print([h for h in oc_headers if h is not None])

print("\n=== Pago Proveedores Row 9 headers ===")
ws_pp = wb['Pago Proveedores']
pp_headers = [ws_pp.cell(9, c).value for c in range(1, ws_pp.max_column + 1)]
print([h for h in pp_headers if h is not None])
