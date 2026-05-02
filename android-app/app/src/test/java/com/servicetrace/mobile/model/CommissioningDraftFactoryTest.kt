package com.servicetrace.mobile.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissioningDraftFactoryTest {
    @Test
    fun `factory creates five ordered default steps`() {
        val draft = CommissioningDraftFactory.create(
            deviceSerialNumber = "ZSS-1001",
            deviceType = "ZSS",
            technicianId = "TECH-01",
            nowMillis = 1234L,
        )

        assertEquals("ZSS-1001", draft.deviceSerialNumber)
        assertEquals("TECH-01", draft.technicianId)
        assertEquals(5, draft.steps.size)
        assertEquals(listOf(0, 1, 2, 3, 4), draft.steps.map { step -> step.stepOrder })
        assertTrue(draft.steps.all { step -> step.status == CommissioningStepStatus.TODO })
        assertEquals(McuConnectionMode.MOCK, draft.connectionMode)
        assertEquals(McuConnectionStatus.DISCONNECTED, draft.connectionStatus)
        assertTrue(draft.attachments.isEmpty())
        assertEquals("", draft.packagePath)
        assertNull(draft.packageGeneratedAtMillis)
        assertEquals(0, draft.packageEntryCount)
        assertEquals(0, draft.syncAttemptCount)
        assertNull(draft.lastSyncAttemptAtMillis)
        assertNull(draft.lastSyncSuccessAtMillis)
        assertEquals("", draft.lastSyncErrorMessage)
        assertEquals(SyncFailureReasonCode.NONE, draft.lastSyncFailureCode)
        assertTrue(draft.lastSyncAutoRetryEligible)
        assertNull(draft.outcome)
        assertFalse(draft.readyToSync)
    }

    @Test
    fun `outcome derives pass fail and hold from checklist`() {
        val baseline = CommissioningDraftFactory.create("ZSS-1", "ZSS", "TECH")
        val passDraft = baseline.copy(
            steps = baseline.steps.map { step -> step.copy(status = CommissioningStepStatus.PASS) },
            connectionStatus = McuConnectionStatus.CONNECTED,
            echoedSerialNumber = "ZSS-1",
        )
        val failDraft = passDraft.copy(
            steps = passDraft.steps.mapIndexed { index, step ->
                if (index == 2) step.copy(status = CommissioningStepStatus.FAIL) else step
            },
        )
        val holdDraft = passDraft.copy(
            steps = passDraft.steps.mapIndexed { index, step ->
                if (index == 1) step.copy(status = CommissioningStepStatus.HOLD) else step
            },
        )

        assertEquals(SessionOutcome.PASS, passDraft.outcome)
        assertEquals(SessionOutcome.FAIL, failDraft.outcome)
        assertEquals(SessionOutcome.HOLD, holdDraft.outcome)
        assertTrue(passDraft.readyToSync)
        assertTrue(failDraft.readyToSync)
        assertTrue(holdDraft.readyToSync)
        assertFalse(baseline.copy(
            steps = baseline.steps.map { step -> step.copy(status = CommissioningStepStatus.PASS) },
        ).readyToSync)
    }
}
