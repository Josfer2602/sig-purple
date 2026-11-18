import openpyxl

wb = openpyxl.load_workbook('Cuadro de Gestión Comercial Purple BTL V7777777 (20 20 20 20 20) (6).xlsm', data_only=True)
ws_ad = wb['ADICIONALES']

print(f"=== ADICIONALES (max_row: {ws_ad.max_row}, max_col: {ws_ad.max_column}) ===")
# Row 9 headers:
headers = [ws_ad.cell(9, c).value for c in range(1, ws_ad.max_column + 1)]
print("Headers:", [(i, h) for i, h in enumerate(headers, 1) if h is not None])

ad_rows = []
for r in range(10, ws_ad.max_row + 1):
    vals = [ws_ad.cell(r, c).value for c in range(1, 15)]
    if any(v is not None and str(v).strip() != '' for v in vals):
        ad_rows.append(vals)

print(f"Total rows in ADICIONALES: {len(ad_rows)}")
# Sample 5
for r in ad_rows[:5]:
    print("Sample:", [v for v in r if v is not None])
