package com.servicetrace.mobile.ui

import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SyncAttemptHistoryEntry
import com.servicetrace.mobile.model.SyncAttemptResult

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
    }
    return if (parts.isEmpty()) null else parts.joinToString(" | ")
}

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
