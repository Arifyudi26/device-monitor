import { Platform } from 'react-native';

import type { ContactAccountsMap } from './ContactAccounts.types';

export type { ContactAccount, ContactAccountsMap } from './ContactAccounts.types';

/**
 * Ambil akun sumber (Google, SIM, WhatsApp, lokal, dll) untuk setiap contactId.
 * Android-only — expo-contacts tidak expose info ini di Android (fitur Container
 * cuma ada di iOS). Di platform lain selalu mengembalikan map kosong.
 *
 * @param contactIds daftar ID kontak (dari expo-contacts, field `id`)
 */
export async function getAccountsForContacts(
  contactIds: string[]
): Promise<ContactAccountsMap> {
  if (Platform.OS !== 'android' || contactIds.length === 0) {
    return {};
  }

  // Lazy require supaya tidak memanggil requireNativeModule di platform yang tidak didukung
  const ContactAccountsModule = require('./ContactAccountsModule').default;
  return ContactAccountsModule.getAccountsForContacts(contactIds);
}
