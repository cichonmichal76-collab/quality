package com.servicetrace.mobile.sync

import com.servicetrace.mobile.model.CommissioningDraftFactory
import com.servicetrace.mobile.model.SyncAttemptTriggerSource
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.ui.shouldQueueDeferredSync
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissioningSyncWorkSchedulerTest {
    @Test
    fun `deferred sync is queued only for offline ready drafts`() {
        assertTrue(
            shouldQueueDeferredSync(
                autoSyncEnabled = true,
                networkAvailable = false,
                readyDraftCount = 1,
            ),
        )
        assertFalse(
            shouldQueueDeferredSync(
                autoSyncEnabled = false,
                networkAvailable = false,
                readyDraftCount = 1,
            ),
        )
        assertFalse(
            shouldQueueDeferredSync(
                autoSyncEnabled = true,
                networkAvailable = true,
                readyDraftCount = 1,
            ),
        )
        assertFalse(
            shouldQueueDeferredSync(
                autoSyncEnabled = true,
                networkAvailable = false,
                readyDraftCount = 0,
            ),
        )
    }

    @Test
    fun `auto retry sync stops after permanent failure or exhausted attempts`() {
        val baseline = CommissioningDraftFactory.create(
            deviceSerialNumber = "ZSS-1001",
            deviceType = "ZSS",
            technicianId = "TECH-01",
        )
        val retryableDraft = baseline.copy(
            syncStatus = SessionSyncStatus.READY_TO_SYNC,
            syncAttemptCount = 1,
            lastSyncErrorMessage = "offline",
            lastSyncAutoRetryEligible = true,
        )
        val permanentDraft = retryableDraft.copy(
            lastSyncAutoRetryEligible = false,
        )
        val cleanReadyDraft = baseline.copy(
            syncStatus = SessionSyncStatus.READY_TO_SYNC,
            lastSyncErrorMessage = "",
            lastSyncAutoRetryEligible = true,
        )

        assertTrue(shouldAutoRetrySync(cleanReadyDraft))
        assertTrue(shouldAutoRetrySync(retryableDraft))
        assertFalse(shouldAutoRetrySync(permanentDraft))
    }

    @Test
    fun `sync attempt history entry can be stored on draft`() {
        val baseline = CommissioningDraftFactory.create(
            deviceSerialNumber = "ZSS-1001",
            deviceType = "ZSS",
            technicianId = "TECH-01",
        )
        val updated = baseline.copy(
            syncAttempts = listOf(
                com.servicetrace.mobile.model.SyncAttemptHistoryEntry(
                    attemptId = "SYNC-001",
                    attemptedAtMillis = 1234L,
                    triggerSource = SyncAttemptTriggerSource.MANUAL,
                    result = com.servicetrace.mobile.model.SyncAttemptResult.FAILURE,
                    failureCode = com.servicetrace.mobile.model.SyncFailureReasonCode.NETWORK_CONNECTIVITY,
                    message = "offline",
                    retryable = true,
                    attemptNumber = 1,
                ),
            ),
        )

        assertEquals(1, updated.syncAttempts.size)
        assertEquals(SyncAttemptTriggerSource.MANUAL, updated.syncAttempts.first().triggerSource)
    }
}
