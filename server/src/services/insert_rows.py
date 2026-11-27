
import sys
import os

_current_dir = os.path.dirname(os.path.abspath(__file__))
_vendor_candidates = [
    os.path.join(_current_dir, 'vendor'),
    os.path.join(_current_dir, '..', 'vendor'),
    os.path.join(os.getcwd(), 'server', 'src', 'services', 'vendor'),
    os.path.join(os.getcwd(), 'src', 'services', 'vendor'),
]
for _vd in _vendor_candidates:
    if os.path.isdir(_vd) and _vd not in sys.path:
        sys.path.insert(0, _vd)

import openpyxl

template_path = sys.argv[1]
temp_path = sys.argv[2]
rows_to_insert = int(sys.argv[3])

wb = openpyxl.load_workbook(template_path, keep_vba=True)
ws = wb['Cotizacion Interna']

if rows_to_insert > 0:
    ws.insert_rows(14, rows_to_insert)

wb.save(temp_path)
