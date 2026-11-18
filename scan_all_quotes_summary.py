import os
import re

base_dir = r'G:\Unidades compartidas\Proyectos'

def get_version_score(path_str):
    match = re.search(r'[vV](\d+)', path_str)
    if match:
        return int(match.group(1))
    return 1

def win_path(p):
    # Support Windows MAX_PATH > 260
    abs_p = os.path.abspath(p)
    if not abs_p.startswith('\\\\?\\'):
        return '\\\\?\\' + abs_p
    return abs_p

print("Escaneando carpetas de clientes en G:\\Unidades compartidas\\Proyectos...")

client_dirs = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
total_clients = len(client_dirs)

projects_map = {}
errors = 0

for cl in client_dirs:
    cl_path = os.path.join(base_dir, cl)
    for root, dirs, files in os.walk(win_path(cl_path)):
        for f in files:
            f_lower = f.lower()
            if ('cotiz' in f_lower or 'ppto' in f_lower or 'presupuesto' in f_lower) and f_lower.endswith(('.xlsm', '.xlsx')) and not f.startswith('~$'):
                norm_root = root.lower()
                if 'proveedor' in norm_root or 'producci' in norm_root:
                    continue
                
                full_path = os.path.join(root, f)
                
                try:
                    rel = os.path.relpath(root, win_path(cl_path))
                    parts = rel.split(os.sep)
                    proy_name = parts[0] if len(parts) > 0 else 'General'
                    if proy_name in ['Cuentas', 'Cotización Cliente', 'Cotizacion Cliente', '.']:
                        proy_name = f
                        
                    key = (cl.lower(), proy_name.lower())
                    v_score = get_version_score(full_path)
                    mtime = os.path.getmtime(full_path)
                    
                    if key not in projects_map:
                        projects_map[key] = (v_score, mtime, full_path, cl, proy_name, f)
                    else:
                        curr_score, curr_mtime, _, _, _, _ = projects_map[key]
                        if v_score > curr_score or (v_score == curr_score and mtime > curr_mtime):
                            projects_map[key] = (v_score, mtime, full_path, cl, proy_name, f)
                except Exception as e:
                    errors += 1

print(f"\nTotal clientes analizados: {total_clients}")
print(f"Total proyectos únicos con cotización cliente detectados: {len(projects_map)}")
print(f"Errores de acceso omitidos: {errors}")

sample_items = list(projects_map.values())[:15]
print("\nMuestra de 15 cotizaciones seleccionadas (versión más alta):")
for v, m, path_f, cl, pr, f in sample_items:
    clean_f = path_f.replace('\\\\?\\', '')
    print(f"  [{cl}] {pr} (V{v}) -> {f}")
