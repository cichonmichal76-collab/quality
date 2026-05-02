package com.servicetrace.mobile.sync

import org.junit.Assert.assertEquals
import org.junit.Test

class ServiceSessionUploaderTest {
    @Test
    fun `normalize api base url appends api once and trims slash`() {
        assertEquals("http://10.0.2.2:8000/api", normalizeApiBaseUrl(" http://10.0.2.2:8000/ "))
        assertEquals("http://10.0.2.2:8000/api", normalizeApiBaseUrl("http://10.0.2.2:8000/api"))
        assertEquals("https://demo.local/api", normalizeApiBaseUrl("https://demo.local/api/"))
    }
}
