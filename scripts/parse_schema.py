import os
import glob
import re

migrations = sorted(glob.glob('supabase/migrations/*.sql'))

# We want to extract full CREATE TABLE statements and ALTER TABLE statements
table_defs = {}
alter_stmts = []

for m in migrations:
    content = open(m, 'r', encoding='utf-8').read()
    fname = os.path.basename(m)
    
    # Clean SQL comments
    # Remove block comments
    cleaned = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    # Remove line comments
    lines = [l for l in cleaned.splitlines() if not l.strip().startswith('--')]
    sql_text = '\n'.join(lines)
    
    # Find all CREATE TABLE statements
    pattern = r'create\s+table(?:\s+if\s+not\s+exists)?\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\);'
    for match in re.finditer(pattern, sql_text, re.IGNORECASE | re.DOTALL):
        tbl_name = match.group(1).lower()
        body = match.group(2)
        if tbl_name not in table_defs:
            table_defs[tbl_name] = {'migration': fname, 'body': body, 'alters': []}
            
    # Find ALTER TABLE ADD COLUMN / FOREIGN KEY / etc.
    alter_pattern = r'alter\s+table(?:\s+only)?\s+(?:public\.)?([a-zA-Z0-9_]+)\s+([^;]+);'
    for match in re.finditer(alter_pattern, sql_text, re.IGNORECASE):
        tbl_name = match.group(1).lower()
        action = match.group(2).strip()
        if tbl_name in table_defs:
            table_defs[tbl_name]['alters'].append((fname, action))
        else:
            alter_stmts.append((tbl_name, fname, action))

out_file = 'scripts/parsed_schema_inventory.txt'
with open(out_file, 'w', encoding='utf-8') as f:
    f.write(f"Total Tables Parsed: {len(table_defs)}\n\n")
    for tbl in sorted(table_defs.keys()):
        info = table_defs[tbl]
        f.write(f"====================================================\n")
        f.write(f"TABLE: {tbl} (Created in: {info['migration']})\n")
        f.write(f"====================================================\n")
        f.write(info['body'].strip() + "\n")
        if info['alters']:
            f.write("\nALTER STATEMENTS:\n")
            for m, a in info['alters']:
                f.write(f"  [{m}] ALTER TABLE {tbl} {a};\n")
        f.write("\n\n")

print(f"Parsed {len(table_defs)} tables into {out_file}")
