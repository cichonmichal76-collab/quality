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
        val capturedAtMillis = nowProvider()

        return buildSnapshotFromProtocol(
            connectionMode = McuConnectionMode.MOCK,
            deviceInfo = mapOf(
                "device_serial_number" to normalizedSerial,
                "device_type" to normalizedType,
                "firmware_version" to "mock-$normalizedType-1.$serialSuffix",
                "bootloader_version" to "boot-0.$serialSuffix",
            ),
            status = mapOf(
                "state" to "READY",
                "watchdog" to "ARMED",
                "mainboard" to "OK",
                "induction_board" to "OK",
            ),
            errors = emptyList(),
            logs = listOf("INFO@$capturedAtMillis:Mock MCU handshake OK for $normalizedSerial ($normalizedType)"),
            linkStatus = "USB CDC LINK ACTIVE",
            capturedAtMillis = capturedAtMillis,
        )
    }
}
