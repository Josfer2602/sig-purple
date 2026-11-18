import sys
sys.stdout.reconfigure(encoding='utf-8')
import openpyxl
import os
import glob

# Find the file
files = glob.glob("*.xlsm")
target_file = None
for f in files:
    if "Cuadro de" in f and "(6)" in f:
        target_file = f
        break

if not target_file:
    print("Files found:", files)
    sys.exit(1)

print("Target file:", target_file)

wb = openpyxl.load_workbook(target_file, read_only=True, data_only=True)
print("Sheet names:", wb.sheetnames)

for name in wb.sheetnames:
    sheet = wb[name]
    print(f"\n--- SHEET: {name} ---")
    rows = []
    count = 0
    for row in sheet.iter_rows(values_only=True):
        if any(cell is not None for cell in row):
            rows.append(row)
            count += 1
            if count >= 10:
                break
    print(f"Total non-empty sample rows inspected: {len(rows)}")
    for i, r in enumerate(rows[:6]):
        # filter out long trailing Nones
        non_empty = [c for c in r if c is not None]
        print(f"Row {i+1} (first 15 cols):", [str(c)[:30] if c is not None else '' for c in r[:15]])
