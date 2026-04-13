import pg from "pg";
import { readFileSync, readdirSync } from "fs";

function parseCSV(csv: string): Record<string, any>[] {
  const lines = csv.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',');
  const rows: Record<string, any>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;
    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] === '' ? null : values[j];
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

async function importData() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const files = readdirSync('/tmp/prod_backup').filter(f => f.endsWith('.csv')).sort();
    
    console.log(`[Import] Disabling triggers and truncating tables...`);
    
    await client.query('SET session_replication_role = replica;');
    
    const tableNames = files.map(f => f.replace('.csv', ''));
    
    for (const table of tableNames) {
      try {
        await client.query(`TRUNCATE TABLE "${table}" CASCADE`);
      } catch(e: any) {
        console.log(`  Skip truncate ${table}: ${e.message.substring(0, 60)}`);
      }
    }
    
    console.log(`[Import] Importing ${files.length} tables...`);
    
    let totalRows = 0;
    let successTables = 0;
    
    for (const file of files) {
      const table = file.replace('.csv', '');
      const csv = readFileSync(`/tmp/prod_backup/${file}`, 'utf-8');
      const rows = parseCSV(csv);
      
      if (rows.length === 0) {
        continue;
      }
      
      const columns = Object.keys(rows[0]);
      
      try {
        for (const row of rows) {
          const values = columns.map(c => row[c]);
          const placeholders = columns.map((_, i) => `$${i + 1}`);
          const quotedCols = columns.map(c => `"${c}"`);
          
          await client.query(
            `INSERT INTO "${table}" (${quotedCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`,
            values
          );
        }
        totalRows += rows.length;
        successTables++;
        if (successTables % 10 === 0) {
          console.log(`  Imported ${successTables} tables (${totalRows} rows)...`);
        }
      } catch(e: any) {
        console.log(`  FAILED ${table}: ${e.message.substring(0, 100)}`);
      }
    }
    
    await client.query('SET session_replication_role = DEFAULT;');
    
    // Reset sequences
    console.log(`[Import] Resetting sequences...`);
    for (const table of tableNames) {
      try {
        await client.query(`
          SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), 
            COALESCE((SELECT MAX(id) FROM "${table}"), 1))
        `);
      } catch(e: any) {
        // table might not have id or serial sequence
      }
    }
    
    console.log(`[Import] Done: ${successTables} tables, ${totalRows} total rows`);
  } catch(e) {
    console.error('[Import] Error:', e);
    throw e;
  } finally {
    await client.end();
  }
}

importData().catch(err => {
  console.error(err);
  process.exit(1);
});
