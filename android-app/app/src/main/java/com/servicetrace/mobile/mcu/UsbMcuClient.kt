package com.servicetrace.mobile.mcu

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionSnapshot
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class UsbMcuClient(
    context: Context,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val usbManager = context.getSystemService(UsbManager::class.java)

    suspend fun connect(
        deviceSerialNumber: String,
        deviceType: String,
    ): McuConnectionSnapshot = withContext(ioDispatcher) {
        val manager = usbManager ?: throw UsbMcuException("Brak dostępu do Android UsbManager.")
        val device = findCandidateDevice(manager)
            ?: throw UsbMcuException("Nie znaleziono urządzenia USB z kanałem danych bulk IN/OUT.")

        if (!manager.hasPermission(device)) {
            throw UsbMcuException(
                "Brak zgody Androida na urządzenie USB ${device.deviceName}. " +
                    "Nadaj uprawnienie i spróbuj ponownie.",
            )
        }

        val usbInterface = findDataInterface(device)
            ?: throw UsbMcuException("Urządzenie USB nie wystawia interfejsu bulk IN/OUT.")
        val inputEndpoint = findEndpoint(usbInterface, UsbConstants.USB_DIR_IN)
            ?: throw UsbMcuException("Brak endpointu IN dla interfejsu USB.")
        val outputEndpoint = findEndpoint(usbInterface, UsbConstants.USB_DIR_OUT)
            ?: throw UsbMcuException("Brak endpointu OUT dla interfejsu USB.")

        val connection = manager.openDevice(device)
            ?: throw UsbMcuException("Nie udało się otworzyć urządzenia USB ${device.deviceName}.")

        try {
            if (!connection.claimInterface(usbInterface, true)) {
                throw UsbMcuException("Nie udało się przejąć interfejsu USB do komunikacji z MCU.")
            }

            val ping = executeCommand(connection, outputEndpoint, inputEndpoint, "PING")
            if (ping.optString("response") != "PONG") {
                throw UsbMcuException("MCU nie odpowiedziało na PING poprawnym PONG.")
            }

            val info = executeCommand(connection, outputEndpoint, inputEndpoint, "GET_DEVICE_INFO")
            val status = executeCommand(connection, outputEndpoint, inputEndpoint, "GET_STATUS")
            val errors = executeCommand(connection, outputEndpoint, inputEndpoint, "GET_ERRORS")
            val logs = executeCommand(connection, outputEndpoint, inputEndpoint, "GET_LOGS")

            buildSnapshotFromProtocol(
                connectionMode = McuConnectionMode.USB,
                deviceInfo = jsonObjectToMap(info).ifEmpty {
                    mapOf(
                        "device_serial_number" to deviceSerialNumber.trim().uppercase(),
                        "device_type" to deviceType.trim().uppercase(),
                    )
                },
                status = jsonObjectToMap(status),
                errors = jsonArrayToStrings(errors.optJSONArray("errors")),
                logs = jsonLogsToStrings(logs.optJSONArray("logs")),
                linkStatus = "USB CDC LINK ACTIVE (${device.deviceName})",
                capturedAtMillis = System.currentTimeMillis(),
            )
        } finally {
            runCatching { connection.releaseInterface(usbInterface) }
            runCatching { connection.close() }
        }
    }

    private fun executeCommand(
        connection: UsbDeviceConnection,
        outputEndpoint: UsbEndpoint,
        inputEndpoint: UsbEndpoint,
        command: String,
    ): JSONObject {
        val payload = "$command\n".toByteArray(Charsets.UTF_8)
        val bytesWritten = connection.bulkTransfer(
            outputEndpoint,
            payload,
            payload.size,
            WRITE_TIMEOUT_MILLIS,
        )
        if (bytesWritten <= 0) {
            throw UsbMcuException("MCU nie przyjęło komendy $command przez USB.")
        }

        val responseBuffer = ByteArray(READ_BUFFER_SIZE)
        val bytesRead = connection.bulkTransfer(
            inputEndpoint,
            responseBuffer,
            responseBuffer.size,
            READ_TIMEOUT_MILLIS,
        )
        if (bytesRead <= 0) {
            throw UsbMcuException("Brak odpowiedzi MCU dla komendy $command.")
        }

        val rawResponse = responseBuffer
            .let { buffer -> String(buffer, 0, bytesRead, Charsets.UTF_8) }
            .lineSequence()
            .firstOrNull { line -> line.isNotBlank() }
            ?.trim()
            ?: throw UsbMcuException("MCU zwróciło pustą odpowiedź dla $command.")

        return try {
            JSONObject(rawResponse)
        } catch (error: Exception) {
            throw UsbMcuException("MCU zwróciło niepoprawny JSON dla $command: $rawResponse", error)
        }
    }

    private fun findCandidateDevice(manager: UsbManager): UsbDevice? =
        manager.deviceList.values.firstOrNull { device -> findDataInterface(device) != null }

    private fun findDataInterface(device: UsbDevice): UsbInterface? {
        for (index in 0 until device.interfaceCount) {
            val usbInterface = device.getInterface(index)
            val hasIn = findEndpoint(usbInterface, UsbConstants.USB_DIR_IN) != null
            val hasOut = findEndpoint(usbInterface, UsbConstants.USB_DIR_OUT) != null
            if (hasIn && hasOut) {
                return usbInterface
            }
        }
        return null
    }

    private fun findEndpoint(
        usbInterface: UsbInterface,
        direction: Int,
    ): UsbEndpoint? {
        for (index in 0 until usbInterface.endpointCount) {
            val endpoint = usbInterface.getEndpoint(index)
            if (
                endpoint.direction == direction &&
                endpoint.type == UsbConstants.USB_ENDPOINT_XFER_BULK
            ) {
                return endpoint
            }
        }
        return null
    }

    private fun jsonObjectToMap(payload: JSONObject): Map<String, Any?> =
        buildMap {
            val keys = payload.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                put(key, payload.opt(key))
            }
        }

    private fun jsonArrayToStrings(array: JSONArray?): List<String> =
        buildList {
            if (array == null) return@buildList
            for (index in 0 until array.length()) {
                add(array.opt(index).toString())
            }
        }

    private fun jsonLogsToStrings(array: JSONArray?): List<String> =
        buildList {
            if (array == null) return@buildList
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index)
                if (item != null) {
                    val level = item.optString("level", "INFO")
                    val event = item.optString("event", "UNKNOWN")
                    val time = item.optString("mcu_time_ms", "?")
                    add("$level@$time:$event")
                } else {
                    add(array.opt(index).toString())
                }
            }
        }

    companion object {
        private const val WRITE_TIMEOUT_MILLIS = 1_000
        private const val READ_TIMEOUT_MILLIS = 2_000
        private const val READ_BUFFER_SIZE = 4_096
    }
}

class UsbMcuException(
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)
