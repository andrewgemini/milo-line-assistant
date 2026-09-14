import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createHash } from 'node:crypto';

const PROD_URL = process.env.DATABASE_URL?.trim();
const RECOVERY_URL = process.env.RECOVERY_DATABASE_URL?.trim();

if (!PROD_URL) {
  console.error('RECOVERY_DRILL=BLOCKED');
  console.error('REASON=DATABASE_URL is missing');
  process.exit(2);
}
if (!RECOVERY_URL) {
  console.error('RECOVERY_DRILL=BLOCKED');
  console.error('REASON=RECOVERY_DATABASE_URL is missing');
  console.error('ACTION=Add the restored TiDB connection string as RECOVERY_DATABASE_URL in .env, then run pnpm recovery:verify');
  process.exit(2);
}

const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
const qid = (name) => '`' + String(name).replaceAll('`', '``') + '`';

async function connect(url) {
  return mysql.createConnection({ uri: url, ssl, connectTimeout: 15000 });
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

async function snapshot(url, label) {
  const conn = await connect(url);
  try {
    const [[dbRow]] = await conn.query('SELECT DATABASE() AS db');
    const db = dbRow?.db;
    if (!db) throw new Error(`${label}: no selected database`);

    const [columnRows] = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, EXTRA
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA=?
       ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      [db],
    );
    const [tableRows] = await conn.query(
      `SELECT TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'
       ORDER BY TABLE_NAME`,
      [db],
    );

    const columnsByTable = new Map();
    for (const row of columnRows) {
      if (!columnsByTable.has(row.TABLE_NAME)) columnsByTable.set(row.TABLE_NAME, []);
      columnsByTable.get(row.TABLE_NAME).push({
        name: row.COLUMN_NAME,
        pos: row.ORDINAL_POSITION,
        type: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE,
        key: row.COLUMN_KEY,
        extra: row.EXTRA,
      });
    }

    const tables = {};
    for (const row of tableRows) {
      const name = row.TABLE_NAME;
      const cols = columnsByTable.get(name) ?? [];
      const [[countRow]] = await conn.query(`SELECT COUNT(*) AS rowCount FROM ${qid(name)}`);
      const idCol = cols.find((c) => c.name === 'id');
      const createdCol = cols.find((c) => c.name === 'createdAt');
      const updatedCol = cols.find((c) => c.name === 'updatedAt');
      const statusCol = cols.find((c) => c.name === 'status');
      const summary = {
        rows: Number(countRow.rowCount),
        schema: hashJson(cols),
      };
      if (idCol) {
        const [[r]] = await conn.query(`SELECT MIN(${qid('id')}) AS minId, MAX(${qid('id')}) AS maxId FROM ${qid(name)}`);
        summary.minId = r.minId === null ? null : Number(r.minId);
        summary.maxId = r.maxId === null ? null : Number(r.maxId);
      }
      if (createdCol) {
        const [[r]] = await conn.query(`SELECT MIN(${qid('createdAt')}) AS minCreatedAt, MAX(${qid('createdAt')}) AS maxCreatedAt FROM ${qid(name)}`);
        summary.minCreatedAt = r.minCreatedAt ?? null;
        summary.maxCreatedAt = r.maxCreatedAt ?? null;
      }
      if (updatedCol) {
        const [[r]] = await conn.query(`SELECT MAX(${qid('updatedAt')}) AS maxUpdatedAt FROM ${qid(name)}`);
        summary.maxUpdatedAt = r.maxUpdatedAt ?? null;
      }
      if (statusCol) {
        const [rows] = await conn.query(`SELECT ${qid('status')} AS status, COUNT(*) AS c FROM ${qid(name)} GROUP BY ${qid('status')} ORDER BY ${qid('status')}`);
        summary.statusCounts = Object.fromEntries(rows.map((r) => [String(r.status ?? 'NULL'), Number(r.c)]));
      }
      tables[name] = summary;
    }

    return {
      label,
      database: db,
      tableCount: tableRows.length,
      schemaFingerprint: hashJson(columnRows.map((r) => [r.TABLE_NAME, r.COLUMN_NAME, r.ORDINAL_POSITION, r.COLUMN_TYPE, r.IS_NULLABLE, r.COLUMN_KEY, r.EXTRA])),
      tables,
    };
  } finally {
    await conn.end();
  }
}

function compare(prod, recovery) {
  const all = [...new Set([...Object.keys(prod.tables), ...Object.keys(recovery.tables)])].sort();
  const missingInRecovery = all.filter((t) => prod.tables[t] && !recovery.tables[t]);
  const extraInRecovery = all.filter((t) => recovery.tables[t] && !prod.tables[t]);
  const schemaMismatch = all.filter((t) => prod.tables[t] && recovery.tables[t] && prod.tables[t].schema !== recovery.tables[t].schema);
  const countAhead = all.filter((t) => prod.tables[t] && recovery.tables[t] && recovery.tables[t].rows > prod.tables[t].rows);
  const exactCounts = all.filter((t) => prod.tables[t] && recovery.tables[t] && recovery.tables[t].rows === prod.tables[t].rows);
  const olderCounts = all.filter((t) => prod.tables[t] && recovery.tables[t] && recovery.tables[t].rows < prod.tables[t].rows);

  const critical = ['transactions', 'audit_logs', 'vault_items', 'webhook_events', 'users', 'finance_accounts', 'finance_account_members'];
  const criticalMissing = critical.filter((t) => prod.tables[t] && !recovery.tables[t]);
  const criticalEmptyUnexpectedly = critical.filter((t) => (prod.tables[t]?.rows ?? 0) > 0 && (recovery.tables[t]?.rows ?? 0) === 0);
  const criticalSchemaMismatch = schemaMismatch.filter((t) => critical.includes(t));

  const pass = missingInRecovery.length === 0 && schemaMismatch.length === 0 && countAhead.length === 0 && criticalMissing.length === 0 && criticalEmptyUnexpectedly.length === 0;
  return { pass, missingInRecovery, extraInRecovery, schemaMismatch, countAhead, exactCounts, olderCounts, criticalMissing, criticalEmptyUnexpectedly, criticalSchemaMismatch };
}

try {
  const production = await snapshot(PROD_URL, 'production');
  const recovery = await snapshot(RECOVERY_URL, 'recovery');
  const result = compare(production, recovery);

  console.log(`PRODUCTION_DB=${production.database}`);
  console.log(`RECOVERY_DB=${recovery.database}`);
  console.log(`PRODUCTION_TABLES=${production.tableCount}`);
  console.log(`RECOVERY_TABLES=${recovery.tableCount}`);
  console.log(`PRODUCTION_SCHEMA=${production.schemaFingerprint}`);
  console.log(`RECOVERY_SCHEMA=${recovery.schemaFingerprint}`);
  console.log(`SCHEMA_MATCH=${production.schemaFingerprint === recovery.schemaFingerprint}`);

  for (const table of Object.keys(production.tables).sort()) {
    const p = production.tables[table];
    const r = recovery.tables[table];
    console.log(`TABLE ${table}: prod=${p.rows} recovery=${r?.rows ?? 'MISSING'} schema=${r ? (p.schema === r.schema ? 'MATCH' : 'MISMATCH') : 'MISSING'}`);
  }

  console.log(`MISSING_IN_RECOVERY=${result.missingInRecovery.join(',') || 'none'}`);
  console.log(`SCHEMA_MISMATCH=${result.schemaMismatch.join(',') || 'none'}`);
  console.log(`RECOVERY_COUNT_AHEAD=${result.countAhead.join(',') || 'none'}`);
  console.log(`EXACT_COUNT_TABLES=${result.exactCounts.length}`);
  console.log(`OLDER_SNAPSHOT_TABLES=${result.olderCounts.join(',') || 'none'}`);
  console.log(`RECOVERY_DRILL=${result.pass ? 'PASS' : 'FAIL'}`);
  process.exit(result.pass ? 0 : 1);
} catch (error) {
  console.error('RECOVERY_DRILL=FAIL');
  console.error(`ERROR=${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
