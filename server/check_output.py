import openpyxl

wb = openpyxl.load_workbook('test_output.xlsm', keep_vba=True)
ws = wb['Cotizacion Interna']

print("=== Cotizacion Interna rows 9-15 ===")
for r in range(9, 16):
    for c in range(5, 12):
        cell = ws.cell(row=r, column=c)
        if cell.value:
            print(f"R{r}C{c} ({cell.column_letter}): {repr(cell.value)}")

print("\n=== Cot Interna - Detalle Proveedor rows 1-15 ===")
ws2 = wb['Cot Interna - Detalle Proveedor']
for r in range(1, 16):
    for c in range(1, 10):
        cell = ws2.cell(row=r, column=c)
        if cell.value:
            print(f"R{r}C{c}: {repr(cell.value)}")
