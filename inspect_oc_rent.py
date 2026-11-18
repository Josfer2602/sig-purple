import openpyxl

wb = openpyxl.load_workbook('Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm', data_only=True)

# 1. OC, Facturas y Cobranzas
ws_oc = wb['OC, Facturas y Cobranzas']
print(f"=== OC, Facturas y Cobranzas (max_row: {ws_oc.max_row}, max_col: {ws_oc.max_column}) ===")
# Check rows 8 to 12 to find table headers
for r in range(8, 12):
    row_vals = [ws_oc.cell(r, c).value for c in range(1, ws_oc.max_column + 1)]
    non_empty = [v for v in row_vals if v is not None]
    if non_empty:
        print(f"Row {r}: {[f'Col{i}:{v}' for i, v in enumerate(row_vals, 1) if v is not None][:15]}")

# 2. Rentabilidad por Proyecto
ws_rent = wb['Rentabilidad por Proyecto']
print(f"\n=== Rentabilidad por Proyecto (max_row: {ws_rent.max_row}, max_col: {ws_rent.max_column}) ===")
for r in range(8, 12):
    row_vals = [ws_rent.cell(r, c).value for c in range(1, ws_rent.max_column + 1)]
    non_empty = [v for v in row_vals if v is not None]
    if non_empty:
        print(f"Row {r}: {[f'Col{i}:{v}' for i, v in enumerate(row_vals, 1) if v is not None][:18]}")
