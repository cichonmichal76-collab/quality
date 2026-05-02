package com.servicetrace.mobile.sync

import com.servicetrace.mobile.model.ServiceSessionDraft
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.DataOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class ServiceSessionUploadResponse(
    val sessionId: String,
    val uploadStatus: String,
    val packageHash: String?,
)

class ServiceSessionUploader(
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    suspend fun upload(
        baseUrl: String,
        draft: ServiceSessionDraft,
    ): ServiceSessionUploadResponse = withContext(ioDispatcher) {
        val packageFile = File(draft.packagePath)
        if (!packageFile.exists()) {
            throw IllegalStateException("Brak lokalnej paczki ZIP dla sesji ${draft.sessionId}.")
        }

        val normalizedBaseUrl = normalizeApiBaseUrl(baseUrl)
        val boundary = "----ServiceTraceBoundary${System.currentTimeMillis()}"
        val connection = (URL("$normalizedBaseUrl/service-sessions/upload").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doInput = true
            doOutput = true
            useCaches = false
            connectTimeout = CONNECT_TIMEOUT_MILLIS
            readTimeout = READ_TIMEOUT_MILLIS
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        }

        DataOutputStream(connection.outputStream).use { output ->
            writeField(output, boundary, "session_id", draft.sessionId)
            writeField(output, boundary, "device_serial_number", draft.deviceSerialNumber)
            writeField(output, boundary, "technician_id", draft.technicianId)
            writeOptionalField(output, boundary, "device_type", draft.deviceType)
            writeOptionalField(output, boundary, "result", draft.outcome?.name)
            writeOptionalField(output, boundary, "firmware_version", draft.firmwareVersion)
            writeOptionalField(output, boundary, "bootloader_version", draft.bootloaderVersion)
            writeFile(output, boundary, "file", packageFile, "application/zip")
            output.writeBytes("--$boundary--\r\n")
            output.flush()
        }

        val statusCode = connection.responseCode
        val responseText = runCatching {
            val stream = if (statusCode in 200..299) connection.inputStream else connection.errorStream
            stream?.bufferedReader(Charsets.UTF_8)?.use { reader -> reader.readText() }.orEmpty()
        }.getOrDefault("")

        if (statusCode !in 200..299) {
            val detail = runCatching {
                JSONObject(responseText).optString("detail")
            }.getOrNull().orEmpty()
            throw IllegalStateException(
                detail.ifBlank {
                    "Backend odrzucil upload paczki commissioning (${connection.responseCode})."
                },
            )
        }

        val payload = JSONObject(responseText.ifBlank { "{}" })
        ServiceSessionUploadResponse(
            sessionId = payload.optString("session_id", draft.sessionId),
            uploadStatus = payload.optString("upload_status", "UPLOADED"),
            packageHash = payload.optString("package_hash").takeIf { value -> value.isNotBlank() },
        )
    }

    private fun writeOptionalField(
        output: DataOutputStream,
        boundary: String,
        name: String,
        value: String?,
    ) {
        value?.takeIf { candidate -> candidate.isNotBlank() }?.let { nonBlankValue ->
            writeField(output, boundary, name, nonBlankValue)
        }
    }

    private fun writeField(
        output: DataOutputStream,
        boundary: String,
        name: String,
        value: String,
    ) {
        output.writeBytes("--$boundary\r\n")
        output.writeBytes("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
        output.write(value.toByteArray(Charsets.UTF_8))
        output.writeBytes("\r\n")
    }

    private fun writeFile(
        output: DataOutputStream,
        boundary: String,
        fieldName: String,
        file: File,
        contentType: String,
    ) {
        output.writeBytes("--$boundary\r\n")
        output.writeBytes(
            "Content-Disposition: form-data; name=\"$fieldName\"; filename=\"${file.name}\"\r\n",
        )
        output.writeBytes("Content-Type: $contentType\r\n\r\n")
        file.inputStream().use { input ->
            input.copyTo(output)
        }
        output.writeBytes("\r\n")
    }

    companion object {
        private const val CONNECT_TIMEOUT_MILLIS = 5_000
        private const val READ_TIMEOUT_MILLIS = 20_000
    }
}

internal fun normalizeApiBaseUrl(baseUrl: String): String {
    val trimmed = baseUrl.trim().trimEnd('/')
    require(trimmed.isNotBlank()) { "Podaj adres backendu dla synchronizacji commissioning." }
    return if (trimmed.endsWith("/api")) {
        trimmed
    } else {
        "$trimmed/api"
    }
}
