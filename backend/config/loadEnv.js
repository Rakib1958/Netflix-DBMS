import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/.env (works no matter which folder you run `node` from)
dotenv.config({ path: path.join(__dirname, "..", ".env") });
