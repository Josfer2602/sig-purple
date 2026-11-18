import json

with open('mismatches.json', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total mismatches: {len(data)}")
zero_in_excel = [m for m in data if m['excel_subtotal'] == 0]
print(f"Excel has 0: {len(zero_in_excel)}")
non_zero = [m for m in data if m['excel_subtotal'] != 0]
print(f"Excel has non-zero: {len(non_zero)}")

print("\n--- FIRST 35 NON-ZERO MISMATCHES ---")
for i, m in enumerate(non_zero[:35]):
    db_info = ', '.join([f"{p['id']}: S/{p['subtotal']:,.2f} ({p.get('estado')})" for p in m['db_matches']])
    print(f"{i+1:2d}. Row {m['row']:4d} | {m['cliente'][:15]:15s} | {m['actividad'][:35]:35s} | Ex: S/{m['excel_subtotal']:10,.2f} | DB: {db_info}")

print("\n--- ZERO IN EXCEL (Total:", len(zero_in_excel), ") ---")
for i, m in enumerate(zero_in_excel[:20]):
    db_info = ', '.join([f"{p['id']}: S/{p['subtotal']:,.2f} ({p.get('estado')})" for p in m['db_matches']])
    print(f"{i+1:2d}. Row {m['row']:4d} | {m['cliente'][:15]:15s} | {m['actividad'][:35]:35s} | Ex: S/{m['excel_subtotal']:10,.2f} | DB: {db_info}")
