import crypto from "node:crypto";
import mysql from "mysql2/promise";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

let pool: mysql.Pool | null = null;
let passwordColumnReady: Promise<void> | null = null;

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
      connectionLimit: 5,
    });
  }
  if (!pool) throw new Error("Database unavailable");
  return pool;
}

async function ensurePasswordColumn(db: mysql.Pool) {
  if (!passwordColumnReady) {
    passwordColumnReady = db
      .query("ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `passwordHash` VARCHAR(255) NULL AFTER `role`")
      .then(() => undefined)
      .catch(error => {
        passwordColumnReady = null;
        throw error;
      });
  }
  await passwordColumnReady;
}

function scrypt(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export async function hashAdminPassword(password: string) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyAdminPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (parts.length !== 7 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const costN = Number(n);
  const costR = Number(r);
  const costP = Number(p);
  if (!salt.length || !expected.length || !Number.isInteger(costN) || !Number.isInteger(costR) || !Number.isInteger(costP) || costN < 1024 || costR < 1 || costP < 1 || expected.length !== KEYLEN) return false;
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, { N: costN, r: costR, p: costP }, (error, value) => error ? reject(error) : resolve(value));
  });
  return crypto.timingSafeEqual(expected, derived);
}

function configuredUsername() {
  const username = (process.env.ADMIN_USERNAME ?? "").trim();
  if (!username) throw new Error("ADMIN_USERNAME is not configured");
  return username;
}

function configuredBootstrapPassword() {
  const password = (process.env.ADMIN_PASSWORD ?? "").trim();
  if (!password) throw new Error("Admin password has not been configured");
  return password;
}

function adminOpenId(username: string) {
  return `admin_${username}`;
}

export async function authenticateAdminPassword(username: string, password: string) {
  const expectedUsername = configuredUsername();
  if (username !== expectedUsername) return false;

  const db = getPool();
  await ensurePasswordColumn(db);
  const openId = adminOpenId(expectedUsername);
  const [rows] = await db.query("SELECT id, passwordHash FROM users WHERE openId = ? AND role = 'admin' LIMIT 1", [openId]);
  const row = (rows as Array<{ id: number; passwordHash: string | null }>)[0];

  if (row?.passwordHash) return verifyAdminPassword(password, row.passwordHash);

  const bootstrapPassword = configuredBootstrapPassword();
  if (password !== bootstrapPassword) return false;

  const passwordHash = await hashAdminPassword(password);
  if (row) {
    await db.query("UPDATE users SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, row.id]);
  } else {
    await db.query(
      "INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, lastSignedIn) VALUES (?, ?, ?, ?, 'admin', ?, CURRENT_TIMESTAMP)",
      [openId, "ผู้ดูแลระบบ (Admin)", "admin@milo.internal", "admin_password", passwordHash],
    );
  }
  return true;
}

export async function changeAdminPassword(input: { username: string; currentPassword: string; newPassword: string }) {
  const expectedUsername = configuredUsername();
  if (input.username !== expectedUsername) throw new Error("ไม่สามารถเปลี่ยนรหัสผ่านของผู้ดูแลระบบนี้ได้");
  if (input.newPassword.length < 10) throw new Error("รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร");
  if (input.currentPassword === input.newPassword) throw new Error("รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านเดิม");

  const db = getPool();
  await ensurePasswordColumn(db);
  const openId = adminOpenId(expectedUsername);
  const [rows] = await db.query("SELECT id, passwordHash FROM users WHERE openId = ? AND role = 'admin' LIMIT 1", [openId]);
  const row = (rows as Array<{ id: number; passwordHash: string | null }>)[0];
  if (!row) throw new Error("ไม่พบบัญชีผู้ดูแลระบบ");

  const validCurrent = row.passwordHash
    ? await verifyAdminPassword(input.currentPassword, row.passwordHash)
    : input.currentPassword === configuredBootstrapPassword();
  if (!validCurrent) throw new Error("รหัสผ่านเดิมไม่ถูกต้อง");

  const passwordHash = await hashAdminPassword(input.newPassword);
  await db.query("UPDATE users SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", [passwordHash, row.id]);
  return { userId: row.id };
}
