export interface ContactAccount {
  /** Raw account type dari Android, misal "com.google", "com.whatsapp", null kalau lokal tanpa akun */
  accountType: string | null;
  /** Nama akun, misal alamat email Google yang menyimpan kontak ini */
  accountName: string | null;
  /** Label yang sudah dipetakan ke nama yang mudah dibaca, misal "Google", "SIM Card" */
  label: string;
}

/** Map contactId (string) -> daftar akun sumber kontak tersebut */
export type ContactAccountsMap = Record<string, ContactAccount[]>;
