package com.servicetrace.mobile.ui

import com.servicetrace.mobile.model.CommissioningDraftFactory
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SyncAttemptHistoryEntry
import com.servicetrace.mobile.model.SyncAttemptResult
import com.servicetrace.mobile.model.SyncAttemptTriggerSource
import com.servicetrace.mobile.model.SyncFailureReasonCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CommissioningSyncAuditTest {
    @Test
    fun `build sync audit rows sorts newest attempts first across drafts`() {
        val olderDraft = draftWithAttempts(
            sessionId = "SVC-OLDER",
            deviceSerialNumber = "DEV-1",
            attempts = listOf(
                syncAttempt(
                    attemptId = "older-success",
                    attemptedAtMillis = 1_000L,
                    result = SyncAttemptResult.SUCCESS,
                    attemptNumber = 1,
                ),
            ),
        )
        val newerDraft = draftWithAttempts(
            sessionId = "SVC-NEWER",
            deviceSerialNumber = "DEV-2",
            attempts = listOf(
                syncAttempt(
                    attemptId = "newer-failure",
                    attemptedAtMillis = 3_000L,
                    result = SyncAttemptResult.FAILURE,
                    failureCode = SyncFailureReasonCode.NETWORK_TIMEOUT,
                    message = "timeout",
                    attemptNumber = 2,
                ),
                syncAttempt(
                    attemptId = "newer-success",
                    attemptedAtMillis = 2_000L,
                    result = SyncAttemptResult.SUCCESS,
                    attemptNumber = 1,
                ),
            ),
        )

        val rows = buildSyncAuditRows(listOf(olderDraft, newerDraft))

        assertEquals(listOf("newer-failure", "newer-success", "older-success"), rows.map { row -> row.attempt.attemptId })
        assertEquals(listOf("SVC-NEWER", "SVC-NEWER", "SVC-OLDER"), rows.map { row -> row.sessionId })
    }

    @Test
    fun `build sync audit rows filters failures for selected draft only`() {
        val selectedDraft = draftWithAttempts(
            sessionId = "SVC-FOCUS",
            deviceSerialNumber = "DEV-FOCUS",
            attempts = listOf(
                syncAttempt(
                    attemptId = "focus-failure",
                    attemptedAtMillis = 5_000L,
                    result = SyncAttemptResult.FAILURE,
                    failureCode = SyncFailureReasonCode.SERVER_ERROR,
                    message = "server",
                    attemptNumber = 3,
                ),
                syncAttempt(
                    attemptId = "focus-success",
                    attemptedAtMillis = 4_000L,
                    result = SyncAttemptResult.SUCCESS,
                    attemptNumber = 2,
                ),
            ),
        )
        val otherDraft = draftWithAttempts(
            sessionId = "SVC-OTHER",
            deviceSerialNumber = "DEV-OTHER",
            attempts = listOf(
                syncAttempt(
                    attemptId = "other-failure",
                    attemptedAtMillis = 6_000L,
                    result = SyncAttemptResult.FAILURE,
                    failureCode = SyncFailureReasonCode.NETWORK_CONNECTIVITY,
                    message = "offline",
                    attemptNumber = 1,
                ),
            ),
        )

        val rows = buildSyncAuditRows(
            drafts = listOf(selectedDraft, otherDraft),
            filter = SyncAuditFilter.FAILURES,
            onlySessionId = "SVC-FOCUS",
        )

        assertEquals(listOf("focus-failure"), rows.map { row -> row.attempt.attemptId })
    }

    @Test
    fun `backend sync summary returns joined metadata only when present`() {
        val populated = syncAttempt(
            attemptId = "success",
            attemptedAtMillis = 10_000L,
            result = SyncAttemptResult.SUCCESS,
            backendServiceSessionId = "svc-db-id",
            backendUploadStatus = "UPLOADED",
            backendPackageHash = "hash-123",
        )
        val empty = syncAttempt(
            attemptId = "empty",
            attemptedAtMillis = 11_000L,
            result = SyncAttemptResult.SUCCESS,
        )

        assertEquals(
            "Status backendu: UPLOADED | ID backendu: svc-db-id | Hash paczki: hash-123",
            buildBackendSyncSummary(populated),
        )
        assertNull(buildBackendSyncSummary(empty))
    }

    private fun draftWithAttempts(
        sessionId: String,
        deviceSerialNumber: String,
        attempts: List<SyncAttemptHistoryEntry>,
    ): ServiceSessionDraft =
        CommissioningDraftFactory.create(
            deviceSerialNumber = deviceSerialNumber,
            deviceType = "ZSS",
            technicianId = "TECH-001",
            nowMillis = 123L,
        ).copy(
            sessionId = sessionId,
            syncAttempts = attempts,
        )

    private fun syncAttempt(
        attemptId: String,
        attemptedAtMillis: Long,
        result: SyncAttemptResult,
        failureCode: SyncFailureReasonCode = SyncFailureReasonCode.NONE,
        message: String = "",
        attemptNumber: Int = 1,
        backendServiceSessionId: String? = null,
        backendUploadStatus: String? = null,
        backendPackageHash: String? = null,
    ): SyncAttemptHistoryEntry =
        SyncAttemptHistoryEntry(
            attemptId = attemptId,
            attemptedAtMillis = attemptedAtMillis,
            triggerSource = SyncAttemptTriggerSource.MANUAL,
            result = result,
            failureCode = failureCode,
            message = message,
            retryable = false,
            attemptNumber = attemptNumber,
            backendServiceSessionId = backendServiceSessionId,
            backendUploadStatus = backendUploadStatus,
            backendPackageHash = backendPackageHash,
        )
}
