import crypto from "crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-cbc";
const KEY = crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();

export const EncryptionUtil = {
  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  },

  decrypt(encryptedText: string): string {
    const [ivHex, dataHex] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(dataHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString();
  },
};
