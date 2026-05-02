package com.servicetrace.mobile.files

import com.servicetrace.mobile.model.CommissioningAttachment
import com.servicetrace.mobile.model.CommissioningAttachmentKind
import com.servicetrace.mobile.model.CommissioningDraftFactory
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.McuConnectionStatus
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CommissioningPackageJsonTest {
    @Test
    fun `package json builders include snapshot attachments and manifest counts`() {
        val draft = CommissioningDraftFactory.create(
            deviceSerialNumber = "ZSS-1002",
            deviceType = "ZSS",
            technicianId = "TECH-02",
            nowMillis = 100L,
        ).copy(
            connectionStatus = McuConnectionStatus.CONNECTED,
            echoedSerialNumber = "ZSS-1002",
            firmwareVersion = "1.2.3",
            bootloaderVersion = "0.9.1",
            mainboardStatus = "OK",
            inductionBoardStatus = "OK",
            hmiStatus = "READY",
            watchdogStatus = "OK",
            usbLinkStatus = "USB CDC LINK ACTIVE",
            logExcerpt = "INFO@1000:BOOT",
            snapshotCapturedAtMillis = 12345L,
            attachments = listOf(
                CommissioningAttachment(
                    attachmentId = "ATT-1",
                    kind = CommissioningAttachmentKind.PHOTO,
                    displayName = "front-panel.jpg",
                    localPath = "/tmp/front-panel.jpg",
                    contentType = "image/jpeg",
                    sizeBytes = 2048L,
                    createdAtMillis = 200L,
                ),
            ),
            steps = CommissioningDraftFactory.create("ZSS-1002", "ZSS", "TECH-02").steps.map { step ->
                step.copy(status = CommissioningStepStatus.PASS)
            },
        )

        val manifest = JSONObject(
            buildCommissioningManifestJson(
                draft = draft,
                generatedAtMillis = 999L,
                attachmentCount = 1,
                entryCount = 5,
            ),
        )
        val serializedDraft = JSONObject(buildCommissioningDraftJson(draft))
        val snapshot = JSONObject(buildCommissioningSnapshotJson(draft))
        val checklist = JSONArray(buildCommissioningChecklistJson(draft))

        assertEquals("ZSS-1002", manifest.getString("device_serial_number"))
        assertEquals(1, manifest.getInt("attachment_count"))
        assertEquals(5, manifest.getInt("entry_count"))
        assertEquals("ATT-1", serializedDraft.getJSONArray("attachments").getJSONObject(0).getString("attachment_id"))
        assertEquals("USB CDC LINK ACTIVE", snapshot.getString("usb_link_status"))
        assertEquals(5, checklist.length())
        assertTrue(checklist.getJSONObject(0).has("step_code"))
    }
}
