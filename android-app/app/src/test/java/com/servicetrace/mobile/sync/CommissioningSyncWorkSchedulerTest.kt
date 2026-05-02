package com.servicetrace.mobile.sync

import com.servicetrace.mobile.ui.shouldQueueDeferredSync
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
}
