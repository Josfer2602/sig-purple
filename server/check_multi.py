import openpyxl

wb = openpyxl.load_workbook('test_output_multi.xlsm', keep_vba=True)
ws = wb['Cotizacion Interna']

print("=== Merged cells rows 10+ ===")
for mc in sorted(ws.merged_cells.ranges, key=lambda x: x.min_row):
    if mc.min_row >= 10:
        print(f"  {mc.coord}")

print("\n=== Cotizacion Interna rows 9-22 ===")
for r in range(9, 23):
    vals = {}
    for c in range(5, 22):
        cell = ws.cell(row=r, column=c)
        if cell.value is not None:
            vals[cell.column_letter] = repr(cell.value)[:60]
    if vals:
        print(f"  Row {r}: {vals}")

print("\n=== Cot Interna - Detalle Proveedor rows 1-35 ===")
ws2 = wb['Cot Interna - Detalle Proveedor']
for r in range(1, 36):
    vals = {}
    for c in range(1, 10):
        cell = ws2.cell(row=r, column=c)
        if cell.value is not None:
            vals[f"C{c}"] = repr(cell.value)[:45]
    if vals:
        print(f"  Row {r}: {vals}")
