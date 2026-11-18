import openpyxl

wb_path = 'Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm'
wb = openpyxl.load_workbook(wb_path, data_only=True)

print("Sheets in workbook:", wb.sheetnames)

# Inspect DASHBOARD
if 'DASHBOARD' in wb.sheetnames:
    ws = wb['DASHBOARD']
    print("\n=== DASHBOARD Sheet sample rows ===")
    for r in range(1, 40):
        vals = [ws.cell(r, c).value for c in range(1, 20)]
        if any(v is not None for v in vals):
            row_str = " | ".join(str(v) for v in vals if v is not None)
            if any(k in row_str.upper() for k in ['VENTAS', 'MARGEN', '2018', '2019', '2020', 'TOTAL', 'PROMEDIO', 'CRECIMIENTO']):
                print(f"R{r}: {row_str[:120]}")

# Inspect Rentabilidad General
if 'Rentabilidad General' in wb.sheetnames:
    ws = wb['Rentabilidad General']
    print("\n=== Rentabilidad General Sheet sample rows ===")
    for r in range(1, 40):
        vals = [ws.cell(r, c).value for c in range(1, 20)]
        if any(v is not None for v in vals):
            row_str = " | ".join(str(v) for v in vals if v is not None)
            if any(k in row_str.upper() for k in ['VENTAS', 'MARGEN', '2018', '2019', '2020', 'TOTAL', 'FACTURACI']):
                print(f"R{r}: {row_str[:120]}")
