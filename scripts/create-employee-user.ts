import pg from "pg";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  const employeeId = "80946235-0b2d-46c4-9629-bdbe18bb67da";
  const firmId = "442d767c-0b5f-4fee-8c27-c69a5fa33440";
  const email = "l.c.wen@hotmail.com";
  const password = "password123";
  const userId = randomUUID();
  const passwordHash = await hash(password, 10);

  // Update employee email
  await client.query(`UPDATE "Employee" SET email = $1 WHERE id = $2`, [email, employeeId]);
  console.log("Updated employee email");

  // Create user
  await client.query(
    `INSERT INTO "User" (id, email, password_hash, name, role, status, firm_id, employee_id, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
    [userId, email, passwordHash, "Lee Chia Wen", "employee", "active", firmId, employeeId, true]
  );

  console.log("Created user:", userId);
  console.log("\nLogin credentials:");
  console.log("  Email:", email);
  console.log("  Password:", password);
}

main()
  .then(() => client.end())
  .catch((err) => {
    console.error(err);
    client.end();
    process.exit(1);
  });
