package com.servicetrace.mobile.model

import java.util.UUID

enum class CommissioningStepStatus {
    TODO,
    PASS,
    FAIL,
    HOLD,
}

enum class SessionSyncStatus {
    DRAFT,
    READY_TO_SYNC,
    SYNCED,
}

enum class SyncFailureReasonCode {
    NONE,
    MISSING_PACKAGE,
    NETWORK_TIMEOUT,
    NETWORK_CONNECTIVITY,
    RATE_LIMIT,
    SERVER_ERROR,
    VALIDATION_ERROR,
    CLIENT_ERROR,
    UNKNOWN,
}

enum class SyncAttemptResult {
    SUCCESS,
    FAILURE,
}

enum class SyncAttemptTriggerSource {
    MANUAL,
    AUTO_NETWORK,
    AUTO_READY,
    DEFERRED_WORKER,
}

enum class McuConnectionMode {
    MOCK,
    USB,
}

enum class McuConnectionStatus {
    DISCONNECTED,
    CONNECTED,
    HARDWARE_REQUIRED,
}

enum class SessionOutcome {
    PASS,
    FAIL,
    HOLD,
}

data class McuConnectionSnapshot(
    val connectionMode: McuConnectionMode,
    val echoedSerialNumber: String,
    val firmwareVersion: String,
    val bootloaderVersion: String,
    val mainboardStatus: String,
    val inductionBoardStatus: String,
    val hmiStatus: String,
    val watchdogStatus: String,
    val usbLinkStatus: String,
    val logExcerpt: String,
    val capturedAtMillis: Long,
)

data class UsbCandidateDevice(
    val deviceId: String,
    val displayName: String,
    val vendorId: Int,
    val productId: Int,
    val hasPermission: Boolean,
)

enum class CommissioningAttachmentKind {
    PHOTO,
}

data class CommissioningAttachment(
    val attachmentId: String,
    val kind: CommissioningAttachmentKind,
    val displayName: String,
    val localPath: String,
    val contentType: String,
    val sizeBytes: Long,
    val createdAtMillis: Long,
)

data class CommissioningStep(
    val stepCode: String,
    val title: String,
    val instructions: String,
    val status: CommissioningStepStatus,
    val note: String,
    val stepOrder: Int,
)

data class SyncAttemptHistoryEntry(
    val attemptId: String,
    val attemptedAtMillis: Long,
    val triggerSource: SyncAttemptTriggerSource,
    val result: SyncAttemptResult,
    val failureCode: SyncFailureReasonCode,
    val message: String,
    val retryable: Boolean,
    val attemptNumber: Int,
)

data class ServiceSessionDraft(
    val sessionId: String,
    val deviceSerialNumber: String,
    val deviceType: String,
    val technicianId: String,
    val overallComment: String,
    val firmwareVersion: String,
    val bootloaderVersion: String,
    val connectionMode: McuConnectionMode,
    val connectionStatus: McuConnectionStatus,
    val selectedUsbDeviceId: String,
    val selectedUsbDeviceLabel: String,
    val echoedSerialNumber: String,
    val mainboardStatus: String,
    val inductionBoardStatus: String,
    val hmiStatus: String,
    val watchdogStatus: String,
    val usbLinkStatus: String,
    val logExcerpt: String,
    val snapshotCapturedAtMillis: Long?,
    val packagePath: String,
    val packageGeneratedAtMillis: Long?,
    val packageEntryCount: Int,
    val syncStatus: SessionSyncStatus,
    val syncAttemptCount: Int,
    val lastSyncAttemptAtMillis: Long?,
    val lastSyncSuccessAtMillis: Long?,
    val lastSyncErrorMessage: String,
    val lastSyncFailureCode: SyncFailureReasonCode,
    val lastSyncAutoRetryEligible: Boolean,
    val createdAtMillis: Long,
    val updatedAtMillis: Long,
    val attachments: List<CommissioningAttachment>,
    val steps: List<CommissioningStep>,
    val syncAttempts: List<SyncAttemptHistoryEntry>,
) {
    val outcome: SessionOutcome?
        get() = deriveOutcome(steps)

    val readyToSync: Boolean
        get() = connectionStatus == McuConnectionStatus.CONNECTED &&
            echoedSerialNumber.isNotBlank() &&
            steps.isNotEmpty() &&
            steps.none { step -> step.status == CommissioningStepStatus.TODO } &&
            outcome != null
}

object CommissioningDraftFactory {
    private data class StepTemplate(
        val stepCode: String,
        val title: String,
        val instructions: String,
    )

    private val templates = listOf(
        StepTemplate(
            stepCode = "IDENTIFY_DEVICE",
            title = "Identyfikacja urządzenia",
            instructions = "Potwierdź numer seryjny z tabliczki, HMI albo odczytu serwisowego.",
        ),
        StepTemplate(
            stepCode = "USB_LINK",
            title = "Połączenie USB / MCU",
            instructions = "Sprawdź przewodowe połączenie serwisowe i gotowość klienta MCU.",
        ),
        StepTemplate(
            stepCode = "SAFETY_CHECK",
            title = "Kontrola bezpieczeństwa",
            instructions = "Potwierdź blokady, osłony i warunki bezpiecznego uruchomienia.",
        ),
        StepTemplate(
            stepCode = "STARTUP_SEQUENCE",
            title = "Procedura startowa",
            instructions = "Zweryfikuj start HMI, sekwencję boot i podstawowe odpowiedzi urządzenia.",
        ),
        StepTemplate(
            stepCode = "SERVICE_SIGNOFF",
            title = "Podsumowanie i podpis technika",
            instructions = "Potwierdź wynik commissioning i gotowość paczki serwisowej do synchronizacji.",
        ),
    )

    fun create(
        deviceSerialNumber: String,
        deviceType: String,
        technicianId: String,
        nowMillis: Long = System.currentTimeMillis(),
    ): ServiceSessionDraft {
        val sessionId = "SVC-${UUID.randomUUID().toString().take(8).uppercase()}"
        return ServiceSessionDraft(
            sessionId = sessionId,
            deviceSerialNumber = deviceSerialNumber.trim(),
            deviceType = deviceType.trim().ifEmpty { "UNKNOWN" },
            technicianId = technicianId.trim(),
            overallComment = "",
            firmwareVersion = "",
            bootloaderVersion = "",
            connectionMode = McuConnectionMode.MOCK,
            connectionStatus = McuConnectionStatus.DISCONNECTED,
            selectedUsbDeviceId = "",
            selectedUsbDeviceLabel = "",
            echoedSerialNumber = "",
            mainboardStatus = "",
            inductionBoardStatus = "",
            hmiStatus = "",
            watchdogStatus = "",
            usbLinkStatus = "",
            logExcerpt = "",
            snapshotCapturedAtMillis = null,
            packagePath = "",
            packageGeneratedAtMillis = null,
            packageEntryCount = 0,
            syncStatus = SessionSyncStatus.DRAFT,
            syncAttemptCount = 0,
            lastSyncAttemptAtMillis = null,
            lastSyncSuccessAtMillis = null,
            lastSyncErrorMessage = "",
            lastSyncFailureCode = SyncFailureReasonCode.NONE,
            lastSyncAutoRetryEligible = true,
            createdAtMillis = nowMillis,
            updatedAtMillis = nowMillis,
            attachments = emptyList(),
            steps = templates.mapIndexed { index, template ->
                CommissioningStep(
                    stepCode = template.stepCode,
                    title = template.title,
                    instructions = template.instructions,
                    status = CommissioningStepStatus.TODO,
                    note = "",
                    stepOrder = index,
                )
            },
            syncAttempts = emptyList(),
        )
    }
}

fun deriveOutcome(steps: List<CommissioningStep>): SessionOutcome? {
    if (steps.isEmpty() || steps.any { step -> step.status == CommissioningStepStatus.TODO }) {
        return null
    }
    if (steps.any { step -> step.status == CommissioningStepStatus.FAIL }) {
        return SessionOutcome.FAIL
    }
    if (steps.any { step -> step.status == CommissioningStepStatus.HOLD }) {
        return SessionOutcome.HOLD
    }
    return SessionOutcome.PASS
}
