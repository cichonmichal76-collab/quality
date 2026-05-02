package com.servicetrace.mobile.sync

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

data class SyncSettings(
    val uploadBaseUrl: String = DEFAULT_COMMISSIONING_UPLOAD_BASE_URL,
    val autoSyncEnabled: Boolean = true,
)

interface SyncSettingsStore {
    val settings: Flow<SyncSettings>

    fun current(): SyncSettings

    fun updateUploadBaseUrl(value: String)

    fun updateAutoSyncEnabled(enabled: Boolean)
}

class AndroidSharedPreferencesSyncSettingsStore(
    context: Context,
) : SyncSettingsStore {
    private val preferences: SharedPreferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    override val settings: Flow<SyncSettings> =
        callbackFlow {
            val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
                if (key == KEY_UPLOAD_BASE_URL || key == KEY_AUTO_SYNC_ENABLED) {
                    trySend(current())
                }
            }
            trySend(current())
            preferences.registerOnSharedPreferenceChangeListener(listener)
            awaitClose {
                preferences.unregisterOnSharedPreferenceChangeListener(listener)
            }
        }.distinctUntilChanged()

    override fun current(): SyncSettings =
        SyncSettings(
            uploadBaseUrl = preferences.getString(KEY_UPLOAD_BASE_URL, DEFAULT_COMMISSIONING_UPLOAD_BASE_URL)
                ?.ifBlank { DEFAULT_COMMISSIONING_UPLOAD_BASE_URL }
                ?: DEFAULT_COMMISSIONING_UPLOAD_BASE_URL,
            autoSyncEnabled = preferences.getBoolean(KEY_AUTO_SYNC_ENABLED, true),
        )

    override fun updateUploadBaseUrl(value: String) {
        preferences.edit()
            .putString(KEY_UPLOAD_BASE_URL, value)
            .apply()
    }

    override fun updateAutoSyncEnabled(enabled: Boolean) {
        preferences.edit()
            .putBoolean(KEY_AUTO_SYNC_ENABLED, enabled)
            .apply()
    }

    private companion object {
        private const val PREFERENCES_NAME = "commissioning_sync_settings"
        private const val KEY_UPLOAD_BASE_URL = "upload_base_url"
        private const val KEY_AUTO_SYNC_ENABLED = "auto_sync_enabled"
    }
}

const val DEFAULT_COMMISSIONING_UPLOAD_BASE_URL = "http://10.0.2.2:8000/api"
