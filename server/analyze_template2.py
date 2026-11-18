import openpyxl

wb = openpyxl.load_workbook('../Plantilla Cotización.xlsm', keep_vba=True)
ws2 = wb['Datos 2']

print("=== Datos 2 - All rows 1-20 with values ===")
for row_num in range(1, 30):
    row_vals = []
    for cell in ws2[row_num]:
        if cell.value is not None:
            row_vals.append(f"Col{cell.column}:{repr(cell.value)}")
    if row_vals:
        print(f"Row {row_num}: {' | '.join(row_vals)}")

print("\n=== Cotizacion Interna - Rows 1-20 ===")
ws_i = wb['Cotizacion Interna']
for row_num in range(1, 20):
    row_vals = []
    for cell in ws_i[row_num]:
        if cell.value is not None:
            row_vals.append(f"Col{cell.column}:{repr(cell.value)}")
    if row_vals:
        print(f"Row {row_num}: {' | '.join(row_vals)}")

print("\nCotizacion Interna merged:", [str(r) for r in ws_i.merged_cells.ranges])

print("\n=== Cot Interna - Detalle Proveedor ALL rows ===")
ws_dp = wb['Cot Interna - Detalle Proveedor']
for row_num in range(1, 30):
    row_vals = []
    for cell in ws_dp[row_num]:
        if cell.value is not None:
            row_vals.append(f"Col{cell.column}:{repr(cell.value)}")
    if row_vals:
        print(f"Row {row_num}: {' | '.join(row_vals)}")
