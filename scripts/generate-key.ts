import { randomBytes } from "crypto";

const key = randomBytes(32).toString("hex");

console.log("Generated SECRET_KEY:");
console.log(key);
console.log("");
console.log("Add to your .env:");
console.log(`SECRET_KEY=${key}`);
