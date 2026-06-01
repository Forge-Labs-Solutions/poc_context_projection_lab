import { seedDatabase } from "./seed.js";

await seedDatabase();
console.log("Seed completed.");
