import pg from "pg";
import { randomUUID } from "crypto";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();

  // Find all admin users without employee records
  const admins = await client.query(`
    SELECT u.id, u.name, u.email, u.firm_id
    FROM "User" u
    WHERE u.role = 'admin' AND u.employee_id IS NULL AND u.firm_id IS NOT NULL AND u.is_active = true
  `);

  for (const admin of admins.rows) {
    // Check if employee already exists with same name in firm
    const existing = await client.query(
      `SELECT id FROM "Employee" WHERE firm_id = $1 AND name = $2`,
      [admin.firm_id, admin.name]
    );

    let employeeId: string;
    if (existing.rows.length > 0) {
      employeeId = existing.rows[0].id;
      console.log(`  Found existing employee for ${admin.name}: ${employeeId}`);
    } else {
      employeeId = randomUUID();
      // Use a placeholder phone (admin phone not required for WhatsApp)
      const phone = `admin_${admin.id.slice(0, 8)}`;
      await client.query(
        `INSERT INTO "Employee" (id, name, phone, email, firm_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
        [employeeId, admin.name, phone, admin.email, admin.firm_id]
      );
      console.log(`  Created employee for admin ${admin.name}: ${employeeId}`);
    }

    await client.query(
      `UPDATE "User" SET employee_id = $1 WHERE id = $2`,
      [employeeId, admin.id]
    );
    console.log(`  Linked user ${admin.name} → employee ${employeeId}`);
  }

  // Find all accountant users without employee records
  const accountants = await client.query(`
    SELECT u.id, u.name, u.email
    FROM "User" u
    WHERE u.role = 'accountant' AND u.employee_id IS NULL AND u.is_active = true
  `);

  for (const acct of accountants.rows) {
    // Get all firms this accountant is assigned to
    const firms = await client.query(
      `SELECT firm_id FROM "AccountantFirm" WHERE user_id = $1`,
      [acct.id]
    );

    let primaryEmployeeId: string | null = null;

    for (const firm of firms.rows) {
      // Check if employee already exists with same name in this firm
      const existing = await client.query(
        `SELECT id FROM "Employee" WHERE firm_id = $1 AND name = $2`,
        [firm.firm_id, acct.name]
      );

      let employeeId: string;
      if (existing.rows.length > 0) {
        employeeId = existing.rows[0].id;
        console.log(`  Found existing employee for ${acct.name} in firm ${firm.firm_id}: ${employeeId}`);
      } else {
        employeeId = randomUUID();
        const phone = `acct_${acct.id.slice(0, 8)}_${firm.firm_id.slice(0, 8)}`;
        await client.query(
          `INSERT INTO "Employee" (id, name, phone, email, firm_id, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
          [employeeId, acct.name, phone, acct.email, firm.firm_id]
        );
        console.log(`  Created employee for accountant ${acct.name} in firm ${firm.firm_id}: ${employeeId}`);
      }

      if (!primaryEmployeeId) primaryEmployeeId = employeeId;
    }

    // Link user to primary (first firm's) employee record
    if (primaryEmployeeId) {
      await client.query(
        `UPDATE "User" SET employee_id = $1 WHERE id = $2`,
        [primaryEmployeeId, acct.id]
      );
      console.log(`  Linked accountant ${acct.name} → employee ${primaryEmployeeId}`);
    }
  }

  console.log("\nDone! All users now have employee records.");
}

main()
  .then(() => client.end())
  .catch((err) => {
    console.error(err);
    client.end();
    process.exit(1);
  });
