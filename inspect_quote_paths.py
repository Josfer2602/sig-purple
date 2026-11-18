import os
import re

base_dir = r'G:\Unidades compartidas\Proyectos'

# Let's inspect 5 sample clients: AAP, Campari, Softys, CNCH, Byma Instruments
test_clients = ['AAP', 'Campari', 'Softys', 'CNCH', 'Byma Instruments']

print("=== Analyzing quote folder structures ===")

for cl in test_clients:
    cl_path = os.path.join(base_dir, cl)
    if not os.path.exists(cl_path):
        print(f"Client folder not found: {cl}")
        continue
    
    print(f"\n--- Client: {cl} ---")
    quotes_found = []
    for root, dirs, files in os.walk(cl_path):
        for f in files:
            f_lower = f.lower()
            if ('cotiz' in f_lower or 'ppto' in f_lower) and f_lower.endswith(('.xlsm', '.xlsx')) and not f.startswith('~$'):
                # Check path
                rel_path = os.path.relpath(os.path.join(root, f), cl_path)
                quotes_found.append(rel_path)
                
    print(f"Total quotes found in {cl}: {len(quotes_found)}")
    for q in quotes_found[:6]:
        print(f"  {q}")
