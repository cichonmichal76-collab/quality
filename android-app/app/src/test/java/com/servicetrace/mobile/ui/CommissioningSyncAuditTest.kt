package com.servicetrace.mobile.ui

import com.servicetrace.mobile.model.CommissioningDraftFactory
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SyncAttemptHistoryEntry
import com.servicetrace.mobile.model.SyncAttemptResult
import com.servicetrace.mobile.model.SyncAttemptTriggerSource
import com.servicetrace.mobile.model.SyncFailureReasonCode
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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
            backendUploadCorrelationId = "SRV-UP-ABC123DEF456",
            backendUploadedAtIso = "2026-05-02T10:15:30Z",
        )
        val empty = syncAttempt(
            attemptId = "empty",
            attemptedAtMillis = 11_000L,
            result = SyncAttemptResult.SUCCESS,
        )

        assertEquals(
            "Status backendu: UPLOADED | ID backendu: svc-db-id | Hash paczki: hash-123 | Correlation ID: SRV-UP-ABC123DEF456 | Uploaded at: 2026-05-02T10:15:30Z",
            buildBackendSyncSummary(populated),
        )
        assertNull(buildBackendSyncSummary(empty))
    }

    @Test
    fun `sync audit json export contains filter scope and backend metadata`() {
        val rows = buildSyncAuditRows(
            drafts = listOf(
                draftWithAttempts(
                    sessionId = "SVC-JSON",
                    deviceSerialNumber = "DEV-JSON",
                    attempts = listOf(
                        syncAttempt(
                            attemptId = "sync-json",
                            attemptedAtMillis = 12_000L,
                            result = SyncAttemptResult.SUCCESS,
                            backendServiceSessionId = "svc-db-json",
                            backendUploadStatus = "UPLOADED",
                            backendPackageHash = "hash-json",
                            backendUploadCorrelationId = "SRV-UP-JSON123456",
                            backendUploadedAtIso = "2026-05-02T11:30:00Z",
                        ),
                    ),
                ),
            ),
        )

        val json = JSONObject(
            buildSyncAuditJson(
                rows = rows,
                filter = SyncAuditFilter.SUCCESSES,
                exportedAtMillis = 99_000L,
                selectedSessionId = "SVC-JSON",
                options = SyncAuditExportOptions(),
            ),
        )
        val firstRow = json.getJSONArray("rows").getJSONObject(0)

        assertEquals("SUCCESSES", json.getString("filter"))
        assertEquals("SVC-JSON", json.getString("selected_session_id"))
        assertEquals(1, json.getInt("entry_count"))
        assertEquals("svc-db-json", firstRow.getString("backend_service_session_id"))
        assertEquals("SRV-UP-JSON123456", firstRow.getString("backend_upload_correlation_id"))
        assertEquals("2026-05-02T11:30:00Z", firstRow.getString("backend_uploaded_at"))
        assertTrue(firstRow.getBoolean("retryable").not())
    }

    @Test
    fun `sync audit json export can redact sensitive fields`() {
        val rows = buildSyncAuditRows(
            drafts = listOf(
                draftWithAttempts(
                    sessionId = "SVC-REDACT",
                    deviceSerialNumber = "DEV-REDACT",
                    attempts = listOf(
                        syncAttempt(
                            attemptId = "sync-redact",
                            attemptedAtMillis = 22_000L,
                            result = SyncAttemptResult.SUCCESS,
                            backendServiceSessionId = "svc-db-redact",
                            backendUploadStatus = "UPLOADED",
                            backendPackageHash = "hash-redact",
                            backendUploadCorrelationId = "SRV-UP-REDACT123",
                        ),
                    ),
                ),
            ),
        )

        val json = JSONObject(
            buildSyncAuditJson(
                rows = rows,
                filter = SyncAuditFilter.SUCCESSES,
                exportedAtMillis = 111_000L,
                selectedSessionId = "SVC-REDACT",
                options = SyncAuditExportOptions(redactSensitiveData = true),
            ),
        )
        val firstRow = json.getJSONArray("rows").getJSONObject(0)

        assertTrue(json.getBoolean("redacted"))
        assertTrue(json.getString("selected_session_id").startsWith("REDACTED-"))
        assertTrue(firstRow.getString("session_id").startsWith("REDACTED-"))
        assertTrue(firstRow.getString("device_serial_number").startsWith("REDACTED-"))
        assertTrue(firstRow.getString("technician_id").startsWith("REDACTED-"))
        assertTrue(firstRow.getString("backend_service_session_id").startsWith("REDACTED-"))
        assertTrue(firstRow.getString("backend_package_hash").startsWith("REDACTED-"))
        assertTrue(firstRow.getString("backend_upload_correlation_id").startsWith("REDACTED-"))
        assertEquals("UPLOADED", firstRow.getString("backend_upload_status"))
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
        backendUploadCorrelationId: String? = null,
        backendUploadedAtIso: String? = null,
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
            backendUploadCorrelationId = backendUploadCorrelationId,
            backendUploadedAtIso = backendUploadedAtIso,
        )
}
