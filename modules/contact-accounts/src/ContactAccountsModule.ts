import { NativeModule, requireNativeModule } from 'expo';

import type { ContactAccountsMap } from './ContactAccounts.types';

declare class ContactAccountsModule extends NativeModule {
  getAccountsForContacts(contactIds: string[]): Promise<ContactAccountsMap>;
}

// Modul ini Android-only (lihat expo-module.config.json).
// requireNativeModule akan throw di iOS/web — pemanggil harus mengecek Platform.OS === 'android'
// sebelum memanggil, lihat src/index.ts.
export default requireNativeModule<ContactAccountsModule>('ContactAccounts');
