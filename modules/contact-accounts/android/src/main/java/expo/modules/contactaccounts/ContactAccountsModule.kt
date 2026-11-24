package expo.modules.contactaccounts

import android.content.ContentUris
import android.provider.ContactsContract
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * ContactAccountsModule
 *
 * expo-contacts tidak mengekspos akun/sumber kontak (Google, SIM, lokal, dll) di Android —
 * fitur "Container" dari expo-contacts hanya tersedia di iOS. Kolom ACCOUNT_TYPE dan
 * ACCOUNT_NAME ada di level ContentProvider Android (ContactsContract.RawContacts), jadi
 * harus diambil lewat native module kustom ini.
 *
 * Satu "Contact" (aggregate, ID yang dipakai expo-contacts) bisa dibentuk dari beberapa
 * "RawContact" (satu per akun sumber: Google, SIM, lokal, WhatsApp, dll) yang digabung
 * oleh Android Contacts Provider. Modul ini mengembalikan daftar akun sumber untuk tiap
 * contactId yang diminta.
 */
class ContactAccountsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ContactAccounts")

    // getAccountsForContacts(contactIds: string[]) -> { [contactId]: { accountType, accountName }[] }
    AsyncFunction("getAccountsForContacts") { contactIds: List<String> ->
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")

      val result = mutableMapOf<String, MutableList<Map<String, String?>>>()
      if (contactIds.isEmpty()) return@AsyncFunction result

      val resolver = context.contentResolver

      // Query RawContacts, filter per batch supaya tidak melebihi limit panjang query SQL
      val batchSize = 500
      contactIds.chunked(batchSize).forEach { batch ->
        val placeholders = batch.joinToString(",") { "?" }
        val selection = "${ContactsContract.RawContacts.CONTACT_ID} IN ($placeholders)"
        val selectionArgs = batch.toTypedArray()

        val projection = arrayOf(
          ContactsContract.RawContacts.CONTACT_ID,
          ContactsContract.RawContacts.ACCOUNT_TYPE,
          ContactsContract.RawContacts.ACCOUNT_NAME
        )

        val cursor = resolver.query(
          ContactsContract.RawContacts.CONTENT_URI,
          projection,
          selection,
          selectionArgs,
          null
        )

        cursor?.use {
          val contactIdIdx = it.getColumnIndexOrThrow(ContactsContract.RawContacts.CONTACT_ID)
          val accountTypeIdx = it.getColumnIndexOrThrow(ContactsContract.RawContacts.ACCOUNT_TYPE)
          val accountNameIdx = it.getColumnIndexOrThrow(ContactsContract.RawContacts.ACCOUNT_NAME)

          while (it.moveToNext()) {
            val contactId = it.getLong(contactIdIdx).toString()
            val accountType = it.getString(accountTypeIdx)
            val accountName = it.getString(accountNameIdx)

            val list = result.getOrPut(contactId) { mutableListOf() }
            list.add(
              mapOf(
                "accountType" to accountType,
                "accountName" to accountName,
                "label" to labelForAccountType(accountType)
              )
            )
          }
        }
      }

      result
    }
  }

  /**
   * Mapping ACCOUNT_TYPE mentah ke label yang dimengerti manusia.
   * ACCOUNT_TYPE untuk akun pihak ketiga biasanya berbentuk nama package,
   * misal "com.google" untuk Google, "com.whatsapp" untuk WhatsApp.
   */
  private fun labelForAccountType(accountType: String?): String {
    if (accountType == null) return "Tidak diketahui"
    return when {
      accountType == "com.google" -> "Google"
      accountType.contains("whatsapp", ignoreCase = true) -> "WhatsApp"
      accountType.contains("sim", ignoreCase = true) -> "SIM Card"
      accountType == "vnd.sec.contact.phone" -> "Telepon (lokal)"
      accountType.contains("exchange", ignoreCase = true) -> "Exchange"
      accountType.contains("samsung", ignoreCase = true) -> "Samsung Account"
      accountType.contains("xiaomi", ignoreCase = true) -> "Mi Account"
      accountType.contains("vivo", ignoreCase = true) -> "vivo Account"
      accountType.contains("oppo", ignoreCase = true) -> "OPPO Account"
      accountType.contains("local", ignoreCase = true) || accountType == "com.android.localphone" -> "Telepon (lokal)"
      else -> accountType
    }
  }
}
