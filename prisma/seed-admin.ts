import { Role } from "../src/lib/enums";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Creates ONLY the admin account — no dummy employees, no fake leads.
// Meant for a real production database (as opposed to prisma/seed.ts,
// which also creates test employees + 20 fake leads for local/demo use).
//
// Run with: npm run db:seed-admin
//
// IMPORTANT: change this password immediately after logging in for the
// first time (from the "حسابي" / account settings page).
const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("Passw0rd!", 10);

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "Rana",
      username: "admin",
      email: "admin@kesra.ai",
      passwordHash: password,
      role: Role.ADMIN,
    },
  });

  console.log(`✔ Admin account ready — username: ${admin.username}, password: Passw0rd!`);
  console.log("  Please log in and change this password right away.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
