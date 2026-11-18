import openpyxl

wb = openpyxl.load_workbook('../Plantilla Cotización.xlsm', keep_vba=True)
ws = wb['Cotizacion Interna']

print("=== All merged cells in Cotizacion Interna ===")
for mc in sorted(ws.merged_cells.ranges, key=lambda x: x.min_row):
    print(f"  {mc.coord}  rows {mc.min_row}-{mc.max_row}")

print("\n=== Rows 9-16 values ===")
for r in range(9, 17):
    vals = {}
    for c in range(1, 22):
        cell = ws.cell(row=r, column=c)
        if cell.value is not None:
            vals[f"C{c}({cell.column_letter})"] = repr(cell.value)[:60]
    if vals:
        print(f"  Row {r}: {vals}")
