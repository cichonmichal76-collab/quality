package com.servicetrace.mobile.files

import org.junit.Assert.assertEquals
import org.junit.Test

class CommissioningArtifactStoreTest {
    @Test
    fun `camera capture file name uses deterministic jpg suffix`() {
        assertEquals(
            "camera-1700000000123.jpg",
            buildCameraPhotoFileName(1700000000123L),
        )
    }
}
