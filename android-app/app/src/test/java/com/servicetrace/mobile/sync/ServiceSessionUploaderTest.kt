package com.servicetrace.mobile.sync

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
    }

    @Test
    fun `transport upload exception marks connect failures as retryable`() {
        assertTrue(classifyTransportUploadException(ConnectException("offline")).isRetryable)
        assertFalse(classifyTransportUploadException(IllegalStateException("bad package")).isRetryable)
    }
}
