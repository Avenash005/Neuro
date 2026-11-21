import os
import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))
print(f"Total migration files: {len(migrations)}")

tables = {}
functions = []
triggers = []
policies = []
foreign_keys = []
auth_refs = []
storage_refs = []

for m in migrations:
    content = open(m, 'r', encoding='utf-8').read()
    fname = os.path.basename(m)
    
    # Tables
    for match in re.finditer(r'create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-zA-Z0-9_]+)', content, re.IGNORECASE):
        tbl = match.group(1).lower()
        if tbl not in tables:
            tables[tbl] = fname
            
    # Functions
    for match in re.finditer(r'create(?:\s+or\s+replace)?\s+function\s+(?:public\.)?([a-zA-Z0-9_]+)', content, re.IGNORECASE):
        fn = match.group(1).lower()
        functions.append((fn, fname))
        
    # Triggers
    for match in re.finditer(r'create\s+trigger\s+([a-zA-Z0-9_]+)', content, re.IGNORECASE):
        tr = match.group(1).lower()
        triggers.append((tr, fname))
        
    # Policies
    for match in re.finditer(r'create\s+policy\s+["\']?([^"\']+)["\']?\s+on\s+(?:public\.)?([a-zA-Z0-9_]+)', content, re.IGNORECASE):
        policies.append((match.group(1), match.group(2).lower(), fname))
        
    # References to auth.users or auth.uid()
    if 'auth.users' in content.lower():
        auth_refs.append((fname, 'auth.users'))
    if 'auth.uid()' in content.lower():
        auth_refs.append((fname, 'auth.uid()'))
        
    # References to storage
    if 'storage.' in content.lower():
        storage_refs.append((fname, 'storage'))

print(f"\n--- Application Tables ({len(tables)}) ---")
for t in sorted(tables.keys()):
    print(f"  {t:35} (defined in {tables[t]})")

print(f"\n--- Functions ({len(functions)}) ---")
for f, m in functions:
    print(f"  {f:35} ({m})")

print(f"\n--- Triggers ({len(triggers)}) ---")
for tr, m in triggers:
    print(f"  {tr:35} ({m})")

print(f"\n--- Total Policies: {len(policies)} ---")

print(f"\n--- Auth References: {len(auth_refs)} ---")
for m, ref in auth_refs:
    print(f"  {m}: {ref}")

print(f"\n--- Storage References: {len(storage_refs)} ---")
for m, ref in storage_refs:
    print(f"  {m}: {ref}")
