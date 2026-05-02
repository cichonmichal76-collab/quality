package com.servicetrace.mobile.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissioningSyncPolicyTest {
    @Test
    fun `auto sync requires online network no running sync and ready drafts`() {
        assertTrue(canAutoSync(autoSyncEnabled = true, networkAvailable = true, syncInFlight = false, readyDraftCount = 1))
        assertFalse(canAutoSync(autoSyncEnabled = false, networkAvailable = true, syncInFlight = false, readyDraftCount = 1))
        assertFalse(canAutoSync(autoSyncEnabled = true, networkAvailable = false, syncInFlight = false, readyDraftCount = 1))
        assertFalse(canAutoSync(autoSyncEnabled = true, networkAvailable = true, syncInFlight = true, readyDraftCount = 1))
        assertFalse(canAutoSync(autoSyncEnabled = true, networkAvailable = true, syncInFlight = false, readyDraftCount = 0))
    }

    @Test
    fun `completion message differentiates manual and automatic sync`() {
        assertEquals(
            "Zsynchronizowano 2 sesji commissioning do backendu.",
            buildSyncCompletionMessage(SyncTrigger.MANUAL, uploadedCount = 2, failedCount = 0),
        )
        assertEquals(
            "Auto-sync po odzyskaniu lacznosci zsynchronizowal 1 sesji commissioning, bledy: 1.",
            buildSyncCompletionMessage(SyncTrigger.AUTO_NETWORK, uploadedCount = 1, failedCount = 1),
        )
        assertEquals(
            "Auto-sync od razu wyslal 3 gotowych sesji commissioning.",
            buildSyncCompletionMessage(SyncTrigger.AUTO_READY, uploadedCount = 3, failedCount = 0),
        )
    }
}
