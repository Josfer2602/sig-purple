import os
import re
import sys
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.append('server/src/services')
from parse_quote_excel import parse_excel_quote

base_dir = r'G:\Unidades compartidas\Proyectos'

def win_path(p):
    abs_p = os.path.abspath(p)
    if not abs_p.startswith('\\\\?\\'):
        return '\\\\?\\' + abs_p
    return abs_p

def get_version_score(path_str):
    match = re.search(r'[vV](\d+)', path_str)
    if match:
        return int(match.group(1))
    return 1

def collect_best_quotes(limit_clients=None):
    client_dirs = [d for d in os.listdir(base_dir) if os.path.isdir(os.path.join(base_dir, d))]
    if limit_clients:
        client_dirs = client_dirs[:limit_clients]
        
    projects_map = {}
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
                    except Exception:
                        pass
    return list(projects_map.values())

def parse_single_quote(item):
    v_score, mtime, file_path, client_name, proy_name, file_name = item
    try:
        clean_path = file_path.replace('\\\\?\\', '')
        parsed = parse_excel_quote(file_path)
        
        # Verify it has at least some content
        if not parsed or not parsed.get('categories') or len(parsed['categories']) == 0:
            return None
            
        return {
            'clientFolder': client_name,
            'projectFolder': proy_name,
            'fileName': file_name,
            'filePath': clean_path,
            'version': v_score,
            'mtime': mtime,
            'metadata': parsed.get('metadata', {}),
            'categories': parsed.get('categories', [])
        }
    except Exception as e:
        # print(f"Error parsing {file_name}: {e}")
        return None

if __name__ == '__main__':
    t0 = time.time()
    print("Collecting quotes from first 10 clients...")
    candidates = collect_best_quotes(limit_clients=10)
    print(f"Candidates found: {len(candidates)}. Starting parsing with ThreadPoolExecutor...")
    
    results = []
    with ThreadPoolExecutor(max_workers=6) as executor:
        futures = {executor.submit(parse_single_quote, item): item for item in candidates}
        for future in as_completed(futures):
            res = future.result()
            if res:
                results.append(res)
                
    t1 = time.time()
    print(f"Parsed {len(results)} / {len(candidates)} valid quotes in {t1 - t0:.2f} seconds!")
    if results:
        print("Sample 1:", results[0]['clientFolder'], "->", results[0]['metadata'].get('requirement'), "Categories:", len(results[0]['categories']))
