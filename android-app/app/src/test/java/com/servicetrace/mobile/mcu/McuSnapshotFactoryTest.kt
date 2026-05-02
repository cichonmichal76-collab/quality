package com.servicetrace.mobile.mcu

import com.servicetrace.mobile.model.McuConnectionMode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class McuSnapshotFactoryTest {
    @Test
    fun `snapshot factory maps runner protocol payload to commissioning snapshot`() {
        val snapshot = buildSnapshotFromProtocol(
            connectionMode = McuConnectionMode.USB,
            deviceInfo = mapOf(
                "device_serial_number" to "ZSS-9000",
                "firmware_version" to "1.2.4",
                "bootloader_version" to "0.9.8",
            ),
            status = mapOf(
                "state" to "READY",
                "watchdog" to "OK",
                "mainboard" to "OK",
                "induction_board" to "OK",
            ),
            errors = emptyList(),
            logs = listOf("INFO@1000:BOOT", "INFO@2000:SELF_TEST_PASS"),
            linkStatus = "USB CDC LINK ACTIVE (/dev/mock0)",
            capturedAtMillis = 1000L,
        )

        assertEquals("ZSS-9000", snapshot.echoedSerialNumber)
        assertEquals("1.2.4", snapshot.firmwareVersion)
        assertEquals("0.9.8", snapshot.bootloaderVersion)
        assertEquals("READY", snapshot.hmiStatus)
        assertEquals("OK", snapshot.watchdogStatus)
        assertEquals("USB CDC LINK ACTIVE (/dev/mock0)", snapshot.usbLinkStatus)
        assertTrue(snapshot.logExcerpt.contains("BOOT"))
    }

    @Test
    fun `snapshot factory prefers MCU errors over logs in excerpt`() {
        val snapshot = buildSnapshotFromProtocol(
            connectionMode = McuConnectionMode.USB,
            deviceInfo = emptyMap(),
            status = emptyMap(),
            errors = listOf("E101", "E202"),
            logs = listOf("INFO@1000:BOOT"),
            linkStatus = "USB",
            capturedAtMillis = 1L,
        )

        assertEquals("MCU errors: E101, E202", snapshot.logExcerpt)
        assertEquals("UNKNOWN", snapshot.mainboardStatus)
    }
}
