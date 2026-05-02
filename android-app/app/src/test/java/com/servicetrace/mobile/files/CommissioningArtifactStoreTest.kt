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

    @Test
    fun `sync audit export file name uses deterministic json suffix`() {
        assertEquals(
            "sync-audit-1700000000123.json",
            buildSyncAuditExportFileName(1700000000123L),
        )
    }
}
