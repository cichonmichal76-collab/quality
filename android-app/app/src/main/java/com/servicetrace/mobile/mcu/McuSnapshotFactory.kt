package com.servicetrace.mobile.mcu

import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionSnapshot

fun buildSnapshotFromProtocol(
    connectionMode: McuConnectionMode,
    deviceInfo: Map<String, Any?>,
    status: Map<String, Any?>,
    errors: List<String>,
    logs: List<String>,
    linkStatus: String,
    capturedAtMillis: Long,
): McuConnectionSnapshot {
    val serialNumber = deviceInfo["device_serial_number"]?.toString().orEmpty()
    val firmwareVersion = deviceInfo["firmware_version"]?.toString().orEmpty()
    val bootloaderVersion = deviceInfo["bootloader_version"]?.toString().orEmpty()
    val state = status["state"]?.toString().orEmpty()
    val watchdog = status["watchdog"]?.toString().orEmpty()
    val mainboard = status["mainboard"]?.toString().orEmpty()
    val inductionBoard = status["induction_board"]?.toString().orEmpty()

    val logExcerpt = when {
        errors.isNotEmpty() -> "MCU errors: ${errors.joinToString(", ")}"
        logs.isNotEmpty() -> logs.take(3).joinToString(" | ")
        else -> "No MCU logs captured."
    }

    return McuConnectionSnapshot(
        connectionMode = connectionMode,
        echoedSerialNumber = serialNumber,
        firmwareVersion = firmwareVersion,
        bootloaderVersion = bootloaderVersion,
        mainboardStatus = if (mainboard.isNotBlank()) mainboard else "UNKNOWN",
        inductionBoardStatus = if (inductionBoard.isNotBlank()) inductionBoard else "UNKNOWN",
        hmiStatus = if (state.isNotBlank()) state else "UNKNOWN",
        watchdogStatus = if (watchdog.isNotBlank()) watchdog else "UNKNOWN",
        usbLinkStatus = linkStatus,
        logExcerpt = logExcerpt,
        capturedAtMillis = capturedAtMillis,
    )
}
