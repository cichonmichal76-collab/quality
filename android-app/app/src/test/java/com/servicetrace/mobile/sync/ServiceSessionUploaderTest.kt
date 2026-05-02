package com.servicetrace.mobile.sync

import com.servicetrace.mobile.model.SyncFailureReasonCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ConnectException

class ServiceSessionUploaderTest {
    @Test
    fun `normalize api base url appends api once and trims slash`() {
        assertEquals("http://10.0.2.2:8000/api", normalizeApiBaseUrl(" http://10.0.2.2:8000/ "))
        assertEquals("http://10.0.2.2:8000/api", normalizeApiBaseUrl("http://10.0.2.2:8000/api"))
        assertEquals("https://demo.local/api", normalizeApiBaseUrl("https://demo.local/api/"))
    }

    @Test
    fun `http upload exception is retryable only for transient statuses`() {
        assertTrue(createHttpUploadException(500, "").isRetryable)
        assertTrue(createHttpUploadException(429, "limit").isRetryable)
        assertFalse(createHttpUploadException(422, "bad zip").isRetryable)
        assertFalse(createHttpUploadException(404, "").isRetryable)
        assertEquals(SyncFailureReasonCode.SERVER_ERROR, createHttpUploadException(500, "").reasonCode)
        assertEquals(SyncFailureReasonCode.RATE_LIMIT, createHttpUploadException(429, "limit").reasonCode)
        assertEquals(SyncFailureReasonCode.VALIDATION_ERROR, createHttpUploadException(422, "bad zip").reasonCode)
        assertEquals(SyncFailureReasonCode.CLIENT_ERROR, createHttpUploadException(404, "").reasonCode)
    }

    @Test
    fun `transport upload exception marks connect failures as retryable`() {
        assertTrue(classifyTransportUploadException(ConnectException("offline")).isRetryable)
        assertFalse(classifyTransportUploadException(IllegalStateException("bad package")).isRetryable)
        assertEquals(
            SyncFailureReasonCode.NETWORK_CONNECTIVITY,
            classifyTransportUploadException(ConnectException("offline")).reasonCode,
        )
        assertEquals(
            SyncFailureReasonCode.UNKNOWN,
            classifyTransportUploadException(IllegalStateException("bad package")).reasonCode,
        )
    }

    @Test
    fun `upload response can carry backend session metadata`() {
        val response = ServiceSessionUploadResponse(
            backendServiceSessionId = "svc-db-id",
            sessionId = "SVC-123",
            uploadStatus = "UPLOADED",
            packageHash = "abc123",
            uploadCorrelationId = "SRV-UP-ABC123DEF456",
            uploadedAtIso = "2026-05-02T10:15:30Z",
        )

        assertEquals("svc-db-id", response.backendServiceSessionId)
        assertEquals("SVC-123", response.sessionId)
        assertEquals("UPLOADED", response.uploadStatus)
        assertEquals("abc123", response.packageHash)
        assertEquals("SRV-UP-ABC123DEF456", response.uploadCorrelationId)
        assertEquals("2026-05-02T10:15:30Z", response.uploadedAtIso)
    }
}
