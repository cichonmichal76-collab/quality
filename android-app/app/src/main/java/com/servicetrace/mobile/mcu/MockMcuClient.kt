package com.servicetrace.mobile.mcu

import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionSnapshot

class MockMcuClient(
    private val nowProvider: () -> Long = { System.currentTimeMillis() },
) {
    suspend fun connect(
        deviceSerialNumber: String,
        deviceType: String,
    ): McuConnectionSnapshot {
        val normalizedSerial = deviceSerialNumber.trim().uppercase()
        val normalizedType = deviceType.trim().uppercase().ifBlank { "UNKNOWN" }
        val serialSuffix = normalizedSerial
            .filter { character -> character.isLetterOrDigit() }
            .takeLast(4)
            .padStart(4, '0')

        return McuConnectionSnapshot(
            connectionMode = McuConnectionMode.MOCK,
            echoedSerialNumber = normalizedSerial,
            firmwareVersion = "mock-$normalizedType-1.$serialSuffix",
            bootloaderVersion = "boot-0.$serialSuffix",
            mainboardStatus = "OK",
            inductionBoardStatus = "OK",
            hmiStatus = "OK",
            watchdogStatus = "ARMED",
            usbLinkStatus = "USB CDC LINK ACTIVE",
            logExcerpt = "Mock MCU handshake OK for $normalizedSerial ($normalizedType).",
            capturedAtMillis = nowProvider(),
        )
    }
}
