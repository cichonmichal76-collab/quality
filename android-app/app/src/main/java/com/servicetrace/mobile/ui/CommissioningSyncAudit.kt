package com.servicetrace.mobile.ui

import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SyncAttemptHistoryEntry
import com.servicetrace.mobile.model.SyncAttemptResult
import org.json.JSONArray
import org.json.JSONObject

enum class SyncAuditFilter {
    ALL,
    FAILURES,
    SUCCESSES,
}

data class SyncAuditRow(
    val sessionId: String,
    val deviceSerialNumber: String,
    val deviceType: String,
    val technicianId: String,
    val attempt: SyncAttemptHistoryEntry,
)

data class SyncAuditExportOptions(
    val redactSensitiveData: Boolean = false,
)

internal fun buildSyncAuditRows(
    drafts: List<ServiceSessionDraft>,
    filter: SyncAuditFilter = SyncAuditFilter.ALL,
    onlySessionId: String? = null,
): List<SyncAuditRow> =
    drafts
        .asSequence()
        .filter { draft -> onlySessionId.isNullOrBlank() || draft.sessionId == onlySessionId }
        .flatMap { draft ->
            draft.syncAttempts.asSequence().map { attempt ->
                SyncAuditRow(
                    sessionId = draft.sessionId,
                    deviceSerialNumber = draft.deviceSerialNumber,
                    deviceType = draft.deviceType,
                    technicianId = draft.technicianId,
                    attempt = attempt,
                )
            }
        }
        .filter { row -> matchesSyncAuditFilter(row.attempt, filter) }
        .sortedWith(
            compareByDescending<SyncAuditRow> { row -> row.attempt.attemptedAtMillis }
                .thenByDescending { row -> row.attempt.attemptNumber }
                .thenBy { row -> row.sessionId },
        )
        .toList()

internal fun buildBackendSyncSummary(attempt: SyncAttemptHistoryEntry): String? {
    val parts = buildList {
        attempt.backendUploadStatus?.let { value -> add("Status backendu: $value") }
        attempt.backendServiceSessionId?.let { value -> add("ID backendu: $value") }
        attempt.backendPackageHash?.let { value -> add("Hash paczki: $value") }
        attempt.backendUploadCorrelationId?.let { value -> add("Correlation ID: $value") }
        attempt.backendUploadedAtIso?.let { value -> add("Uploaded at: $value") }
    }
    return if (parts.isEmpty()) null else parts.joinToString(" | ")
}

internal fun buildSyncAuditJson(
    rows: List<SyncAuditRow>,
    filter: SyncAuditFilter,
    exportedAtMillis: Long,
    selectedSessionId: String?,
    options: SyncAuditExportOptions = SyncAuditExportOptions(),
): String = JSONObject().apply {
    put("exported_at_millis", exportedAtMillis)
    put("filter", filter.name)
    put(
        "selected_session_id",
        redactAuditValue(selectedSessionId, options.redactSensitiveData) ?: JSONObject.NULL,
    )
    put("entry_count", rows.size)
    put("redacted", options.redactSensitiveData)
    put("rows", JSONArray().apply {
        rows.forEach { row ->
            put(
                JSONObject().apply {
                    put("session_id", redactAuditValue(row.sessionId, options.redactSensitiveData))
                    put("device_serial_number", redactAuditValue(row.deviceSerialNumber, options.redactSensitiveData))
                    put("device_type", row.deviceType)
                    put("technician_id", redactAuditValue(row.technicianId, options.redactSensitiveData))
                    put("attempt_id", row.attempt.attemptId)
                    put("attempted_at_millis", row.attempt.attemptedAtMillis)
                    put("trigger_source", row.attempt.triggerSource.name)
                    put("result", row.attempt.result.name)
                    put("failure_code", row.attempt.failureCode.name)
                    put("message", row.attempt.message)
                    put("retryable", row.attempt.retryable)
                    put("attempt_number", row.attempt.attemptNumber)
                    put(
                        "backend_service_session_id",
                        redactAuditValue(row.attempt.backendServiceSessionId, options.redactSensitiveData) ?: JSONObject.NULL,
                    )
                    put("backend_upload_status", row.attempt.backendUploadStatus ?: JSONObject.NULL)
                    put(
                        "backend_package_hash",
                        redactAuditValue(row.attempt.backendPackageHash, options.redactSensitiveData) ?: JSONObject.NULL,
                    )
                    put(
                        "backend_upload_correlation_id",
                        redactAuditValue(row.attempt.backendUploadCorrelationId, options.redactSensitiveData) ?: JSONObject.NULL,
                    )
                    put("backend_uploaded_at", row.attempt.backendUploadedAtIso ?: JSONObject.NULL)
                },
            )
        }
    })
}.toString(2)

internal fun syncAuditFilterLabel(filter: SyncAuditFilter): String =
    when (filter) {
        SyncAuditFilter.ALL -> "Wszystkie"
        SyncAuditFilter.FAILURES -> "Bledy"
        SyncAuditFilter.SUCCESSES -> "Sukcesy"
    }

private fun matchesSyncAuditFilter(
    attempt: SyncAttemptHistoryEntry,
    filter: SyncAuditFilter,
): Boolean =
    when (filter) {
        SyncAuditFilter.ALL -> true
        SyncAuditFilter.FAILURES -> attempt.result == SyncAttemptResult.FAILURE
        SyncAuditFilter.SUCCESSES -> attempt.result == SyncAttemptResult.SUCCESS
    }

internal fun redactAuditValue(
    value: String?,
    redactSensitiveData: Boolean,
): String? {
    if (value.isNullOrBlank()) {
        return null
    }
    if (!redactSensitiveData) {
        return value
    }
    val fingerprint = value.hashCode().toUInt().toString(16).uppercase().padStart(8, '0')
    return "REDACTED-$fingerprint"
}
