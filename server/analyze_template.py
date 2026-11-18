import openpyxl

wb = openpyxl.load_workbook('../Plantilla Cotización.xlsm', keep_vba=True)

# Print all sheet names
print("Sheets:", wb.sheetnames)

# Analyze Cot Interna - Detalle Proveedor
ws = wb['Cot Interna - Detalle Proveedor']
print("\n=== Cot Interna - Detalle Proveedor ===")
for row in ws.iter_rows(min_row=1, max_row=25, values_only=False):
    row_vals = []
    for cell in row:
        if cell.value is not None:
            row_vals.append(f"[{cell.column}:{repr(cell.value)}]")
    if row_vals:
        print(f"Row {row[0].row}: {' | '.join(row_vals)}")

# Also show merged cells
print("\nMerged cells:", list(str(r) for r in ws.merged_cells.ranges)[:20])

# Analyze Datos 2 rows 5, 7, 12
ws2 = wb['Datos 2']
print("\n=== Datos 2 - Row 5 (category title) ===")
for cell in ws2[5]:
    if cell.value is not None:
        print(f"  Col {cell.column}: {repr(cell.value)}")

print("\n=== Datos 2 - Row 7 (sub-header) ===")
for cell in ws2[7]:
    if cell.value is not None:
        print(f"  Col {cell.column}: {repr(cell.value)}")

print("\n=== Datos 2 - Row 12 (item row) ===")
for cell in ws2[12]:
    if cell.value is not None:
        print(f"  Col {cell.column}: {repr(cell.value)}")
