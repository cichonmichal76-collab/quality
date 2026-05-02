package com.servicetrace.mobile.mcu

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionSnapshot
import com.servicetrace.mobile.model.UsbCandidateDevice
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class UsbMcuClient(
    context: Context,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    private val appContext = context.applicationContext
    private val usbManager = appContext.getSystemService(UsbManager::class.java)

    fun listCandidateDevices(): List<UsbCandidateDevice> {
        val manager = usbManager ?: return emptyList()
        return manager.deviceList.values
            .filter { device -> findDataInterface(device) != null }
            .sortedBy { device -> device.deviceName }
            .map { device ->
                UsbCandidateDevice(
                    deviceId = device.deviceName,
                    displayName = buildDisplayName(device),
                    vendorId = device.vendorId,
                    productId = device.productId,
                    hasPermission = manager.hasPermission(device),
                )
            }
    }

    suspend fun requestPermission(deviceId: String): UsbCandidateDevice {
        val manager = usbManager ?: throw UsbMcuException("Brak dostępu do Android UsbManager.")
        val device = manager.deviceList.values.firstOrNull { candidate -> candidate.deviceName == deviceId }
            ?: throw UsbMcuException("Wybrane urządzenie USB nie jest już dostępne.")

        if (manager.hasPermission(device)) {
            return toCandidateDevice(manager, device)
        }

        return suspendCancellableCoroutine { continuation ->
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (intent?.action != ACTION_USB_PERMISSION || continuation.isCompleted) {
                        return
                    }
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    val returnedDevice = getUsbDeviceFromIntent(intent)
                    if (returnedDevice?.deviceName != deviceId) {
                        return
                    }
                    runCatching { appContext.unregisterReceiver(this) }
                    if (granted) {
                        continuation.resume(toCandidateDevice(manager, returnedDevice))
                    } else {
                        continuation.resumeWithException(
                            UsbMcuException("Android odrzucił zgodę na dostęp do urządzenia USB ${returnedDevice.deviceName}."),
                        )
                    }
                }
            }

            registerPermissionReceiver(receiver)
            continuation.invokeOnCancellation {
                runCatching { appContext.unregisterReceiver(receiver) }
            }

            val permissionIntent = PendingIntent.getBroadcast(
                appContext,
                device.deviceId,
                Intent(ACTION_USB_PERMISSION).setPackage(appContext.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            manager.requestPermission(device, permissionIntent)
        }
    }

    suspend fun connect(
        deviceSerialNumber: String,
        deviceType: String,
        selectedDeviceId: String?,
    ): McuConnectionSnapshot = withContext(ioDispatcher) {
        val manager = usbManager ?: throw UsbMcuException("Brak dostępu do Android UsbManager.")
        val device = when {
            selectedDeviceId.isNullOrBlank() -> {
                val candidates = manager.deviceList.values.filter { candidate -> findDataInterface(candidate) != null }
                when (candidates.size) {
                    0 -> throw UsbMcuException("Nie znaleziono urządzenia USB z kanałem danych bulk IN/OUT.")
                    1 -> candidates.first()
                    else -> throw UsbMcuException("Wybierz konkretne urządzenie USB przed połączeniem z MCU.")
                }
            }
            else -> manager.deviceList.values.firstOrNull { candidate -> candidate.deviceName == selectedDeviceId }
                ?: throw UsbMcuException("Wybrane urządzenie USB nie jest już dostępne.")
        }

        if (!manager.hasPermission(device)) {
            throw UsbMcuException(
                "Brak zgody Androida na urządzenie USB ${buildDisplayName(device)}. " +
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
            ?: throw UsbMcuException("Nie udało się otworzyć urządzenia USB ${buildDisplayName(device)}.")

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
                linkStatus = "USB CDC LINK ACTIVE (${buildDisplayName(device)})",
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

        val rawResponse = String(responseBuffer, 0, bytesRead, Charsets.UTF_8)
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

    private fun registerPermissionReceiver(receiver: BroadcastReceiver) {
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            appContext.registerReceiver(receiver, filter)
        }
    }

    private fun getUsbDeviceFromIntent(intent: Intent): UsbDevice? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }

    private fun toCandidateDevice(
        manager: UsbManager,
        device: UsbDevice,
    ): UsbCandidateDevice = UsbCandidateDevice(
        deviceId = device.deviceName,
        displayName = buildDisplayName(device),
        vendorId = device.vendorId,
        productId = device.productId,
        hasPermission = manager.hasPermission(device),
    )

    private fun buildDisplayName(device: UsbDevice): String {
        val manufacturer = device.manufacturerName?.takeIf { value -> value.isNotBlank() }
        val product = device.productName?.takeIf { value -> value.isNotBlank() }
        val identity = listOfNotNull(manufacturer, product).joinToString(" ")
        val vendorProduct = "VID:${device.vendorId} PID:${device.productId}"
        return if (identity.isNotBlank()) {
            "$identity ($vendorProduct)"
        } else {
            "${device.deviceName} ($vendorProduct)"
        }
    }

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
        private const val ACTION_USB_PERMISSION = "com.servicetrace.mobile.USB_PERMISSION"
        private const val WRITE_TIMEOUT_MILLIS = 1_000
        private const val READ_TIMEOUT_MILLIS = 2_000
        private const val READ_BUFFER_SIZE = 4_096
    }
}

class UsbMcuException(
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)
