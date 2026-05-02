package com.servicetrace.mobile.files

import com.servicetrace.mobile.model.CommissioningAttachment
import com.servicetrace.mobile.model.ServiceSessionDraft
import org.json.JSONArray
import org.json.JSONObject

fun buildCommissioningManifestJson(
    draft: ServiceSessionDraft,
    generatedAtMillis: Long,
    attachmentCount: Int,
    entryCount: Int,
): String = JSONObject().apply {
    put("session_id", draft.sessionId)
    put("device_serial_number", draft.deviceSerialNumber)
    put("device_type", draft.deviceType)
    put("technician_id", draft.technicianId)
    put("sync_status", draft.syncStatus.name)
    put("outcome", draft.outcome?.name ?: JSONObject.NULL)
    put("generated_at_millis", generatedAtMillis)
    put("attachment_count", attachmentCount)
    put("entry_count", entryCount)
}.toString(2)

fun buildCommissioningDraftJson(draft: ServiceSessionDraft): String = JSONObject().apply {
    put("session_id", draft.sessionId)
    put("device_serial_number", draft.deviceSerialNumber)
    put("device_type", draft.deviceType)
    put("technician_id", draft.technicianId)
    put("overall_comment", draft.overallComment)
    put("firmware_version", draft.firmwareVersion)
    put("bootloader_version", draft.bootloaderVersion)
    put("connection_mode", draft.connectionMode.name)
    put("connection_status", draft.connectionStatus.name)
    put("selected_usb_device_id", draft.selectedUsbDeviceId)
    put("selected_usb_device_label", draft.selectedUsbDeviceLabel)
    put("sync_status", draft.syncStatus.name)
    put("created_at_millis", draft.createdAtMillis)
    put("updated_at_millis", draft.updatedAtMillis)
    put("attachments", JSONArray().apply {
        draft.attachments.forEach { attachment ->
            put(attachment.toJson())
        }
    })
}.toString(2)

fun buildCommissioningSnapshotJson(draft: ServiceSessionDraft): String = JSONObject().apply {
    put("echoed_serial_number", draft.echoedSerialNumber)
    put("firmware_version", draft.firmwareVersion)
    put("bootloader_version", draft.bootloaderVersion)
    put("mainboard_status", draft.mainboardStatus)
    put("induction_board_status", draft.inductionBoardStatus)
    put("hmi_status", draft.hmiStatus)
    put("watchdog_status", draft.watchdogStatus)
    put("usb_link_status", draft.usbLinkStatus)
    put("log_excerpt", draft.logExcerpt)
    put("snapshot_captured_at_millis", draft.snapshotCapturedAtMillis ?: JSONObject.NULL)
}.toString(2)

fun buildCommissioningChecklistJson(draft: ServiceSessionDraft): String =
    JSONArray().apply {
        draft.steps
            .sortedBy { step -> step.stepOrder }
            .forEach { step ->
                put(
                    JSONObject().apply {
                        put("step_code", step.stepCode)
                        put("title", step.title)
                        put("instructions", step.instructions)
                        put("status", step.status.name)
                        put("note", step.note)
                        put("step_order", step.stepOrder)
                    },
                )
            }
    }.toString(2)

private fun CommissioningAttachment.toJson(): JSONObject = JSONObject().apply {
    put("attachment_id", attachmentId)
    put("kind", kind.name)
    put("display_name", displayName)
    put("local_path", localPath)
    put("content_type", contentType)
    put("size_bytes", sizeBytes)
    put("created_at_millis", createdAtMillis)
}
