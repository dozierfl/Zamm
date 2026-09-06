import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { getSql } from "../db";
import { hashPassword, randomToken } from "../lib/auth";

function hideInput(hidden: boolean) {
  if (!stdin.isTTY) return;
  execFileSync("stty", [hidden ? "-echo" : "echo"], {
    stdio: [stdin, stdout, stdout],
  });
}

const variables = Object.fromEntries(
  (await readFile(new URL("../.dev.vars", import.meta.url), "utf8"))
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [line.slice(0, separator), line.slice(separator + 1)];
    }),
);
if (!variables.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");

const prompt = createInterface({ input: stdin, output: stdout });
try {
  const email = (await prompt.question("Dozi account email: "))
    .trim()
    .toLowerCase();
  hideInput(true);
  const password = await prompt.question("New password (10+ characters): ");
  stdout.write("\n");
  const confirmation = await prompt.question("Confirm new password: ");
  stdout.write("\n");
  hideInput(false);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Invalid email address.");
  if (password.length < 10)
    throw new Error("Password must contain at least 10 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  const sql = getSql(variables.DATABASE_URL),
    users = await sql<{ id: string }[]>`
      select id from users where email=${email} limit 1
    `,
    user = users[0];
  if (!user) throw new Error("No Dozi account uses that email address.");
  const salt = randomToken(),
    passwordHash = await hashPassword(password, salt);
  await sql.begin(async (transaction) => {
    await transaction`
      update users set password_hash=${passwordHash},password_salt=${salt},updated_at=now()
      where id=${user.id}
    `;
    await transaction`delete from sessions where user_id=${user.id}`;
  });
  stdout.write("Password reset. Sign in to Dozi with the new password.\n");
} finally {
  hideInput(false);
  prompt.close();
}
