package com.servicetrace.mobile.mcu

import com.servicetrace.mobile.model.McuConnectionMode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MockMcuClientTest {
    @Test
    fun `mock mcu client returns deterministic commissioning snapshot`() = runBlocking {
        val client = MockMcuClient(nowProvider = { 123456789L })

        val snapshot = client.connect(
            deviceSerialNumber = "zss-42",
            deviceType = "zss",
        )

        assertEquals(McuConnectionMode.MOCK, snapshot.connectionMode)
        assertEquals("ZSS-42", snapshot.echoedSerialNumber)
        assertEquals("mock-ZSS-1.SS42", snapshot.firmwareVersion)
        assertEquals("boot-0.SS42", snapshot.bootloaderVersion)
        assertEquals("USB CDC LINK ACTIVE", snapshot.usbLinkStatus)
        assertEquals(123456789L, snapshot.capturedAtMillis)
        assertTrue(snapshot.logExcerpt.contains("ZSS-42"))
    }
}
