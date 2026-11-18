import csv

with open('google_facturas.csv', 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.reader(f)
    rows = list(reader)

print(f"Total rows in CSV: {len(rows)}")
for i in range(min(5, len(rows))):
    print(f"Row {i+1}: {rows[i][:15]}")

headers = rows[1]
print("\nHeaders (Row 2):")
for idx, h in enumerate(headers):
    if h:
        print(f"  [{idx}] {h}")

sample_data = rows[2:10]
print("\nSample records:")
for r in sample_data:
    row_dict = {headers[i]: r[i] for i in range(min(len(headers), len(r))) if headers[i]}
    print(row_dict)
