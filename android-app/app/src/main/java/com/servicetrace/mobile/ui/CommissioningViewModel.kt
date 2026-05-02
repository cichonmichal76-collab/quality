package com.servicetrace.mobile.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.servicetrace.mobile.data.CommissioningRepository
import com.servicetrace.mobile.files.CommissioningArtifactStore
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionStatus
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.model.UsbCandidateDevice
import com.servicetrace.mobile.mcu.MockMcuClient
import com.servicetrace.mobile.mcu.UsbMcuClient
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NewDraftInputs(
    val deviceSerialNumber: String = "",
    val deviceType: String = "",
    val technicianId: String = "",
)

data class CommissioningUiState(
    val drafts: List<ServiceSessionDraft> = emptyList(),
    val selectedDraft: ServiceSessionDraft? = null,
    val newDraftInputs: NewDraftInputs = NewDraftInputs(),
    val usbDevices: List<UsbCandidateDevice> = emptyList(),
    val usbPermissionInFlight: Boolean = false,
    val bannerMessage: String? = null,
)

class CommissioningViewModel(
    private val repository: CommissioningRepository,
    private val mockMcuClient: MockMcuClient,
    private val usbMcuClient: UsbMcuClient,
    private val artifactStore: CommissioningArtifactStore,
) : ViewModel() {
    private val inputs = MutableStateFlow(NewDraftInputs())
    private val selectedDraft = MutableStateFlow<ServiceSessionDraft?>(null)
    private val usbDevices = MutableStateFlow<List<UsbCandidateDevice>>(emptyList())
    private val usbPermissionInFlight = MutableStateFlow(false)
    private val bannerMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<CommissioningUiState> = combine(
        repository.observeDrafts(),
        inputs,
        selectedDraft,
        usbDevices,
        usbPermissionInFlight,
        bannerMessage,
    ) { drafts, draftInputs, currentDraft, availableUsbDevices, permissionInFlight, message ->
        val selected = currentDraft?.let { draft ->
            drafts.firstOrNull { row -> row.sessionId == draft.sessionId } ?: draft
        } ?: drafts.firstOrNull()
        CommissioningUiState(
            drafts = drafts,
            selectedDraft = selected,
            newDraftInputs = draftInputs,
            usbDevices = availableUsbDevices,
            usbPermissionInFlight = permissionInFlight,
            bannerMessage = message,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CommissioningUiState(),
    )

    init {
        refreshUsbDevices()
    }

    fun updateDeviceSerialNumber(value: String) {
        inputs.update { state -> state.copy(deviceSerialNumber = value) }
    }

    fun updateDeviceType(value: String) {
        inputs.update { state -> state.copy(deviceType = value) }
    }

    fun updateTechnicianId(value: String) {
        inputs.update { state -> state.copy(technicianId = value) }
    }

    fun createDraft() {
        val currentInputs = inputs.value
        if (currentInputs.deviceSerialNumber.isBlank() || currentInputs.technicianId.isBlank()) {
            bannerMessage.value = "Podaj numer seryjny i identyfikator technika."
            return
        }
        viewModelScope.launch {
            val draft = repository.createDraft(
                deviceSerialNumber = currentInputs.deviceSerialNumber,
                deviceType = currentInputs.deviceType,
                technicianId = currentInputs.technicianId,
            )
            selectedDraft.value = draft
            inputs.value = NewDraftInputs(deviceType = currentInputs.deviceType)
            bannerMessage.value = "Utworzono lokalny draft commissioning."
        }
    }

    fun selectDraft(sessionId: String) {
        viewModelScope.launch {
            selectedDraft.value = repository.getDraft(sessionId)
        }
    }

    fun updateStepStatus(stepCode: String, status: CommissioningStepStatus) {
        selectedDraft.update { draft ->
            draft?.copy(
                steps = draft.steps.map { step ->
                    if (step.stepCode == stepCode) step.copy(status = status) else step
                },
            )?.invalidatePackageMetadata()
        }
    }

    fun updateStepNote(stepCode: String, note: String) {
        selectedDraft.update { draft ->
            draft?.copy(
                steps = draft.steps.map { step ->
                    if (step.stepCode == stepCode) step.copy(note = note) else step
                },
            )?.invalidatePackageMetadata()
        }
    }

    fun updateOverallComment(comment: String) {
        selectedDraft.update { draft -> draft?.copy(overallComment = comment)?.invalidatePackageMetadata() }
    }

    fun updateFirmwareVersion(value: String) {
        selectedDraft.update { draft -> draft?.copy(firmwareVersion = value)?.invalidatePackageMetadata() }
    }

    fun updateBootloaderVersion(value: String) {
        selectedDraft.update { draft -> draft?.copy(bootloaderVersion = value)?.invalidatePackageMetadata() }
    }

    fun updateConnectionMode(mode: McuConnectionMode) {
        selectedDraft.update { draft ->
            draft?.copy(
                connectionMode = mode,
                connectionStatus = McuConnectionStatus.DISCONNECTED,
                firmwareVersion = "",
                bootloaderVersion = "",
                echoedSerialNumber = "",
                mainboardStatus = "",
                inductionBoardStatus = "",
                hmiStatus = "",
                watchdogStatus = "",
                usbLinkStatus = "",
                logExcerpt = "",
                snapshotCapturedAtMillis = null,
            )?.invalidatePackageMetadata()
        }
        if (mode == McuConnectionMode.USB) {
            refreshUsbDevices()
        }
    }

    fun refreshUsbDevices() {
        usbDevices.value = usbMcuClient.listCandidateDevices()
        val availableIds = usbDevices.value.map { device -> device.deviceId }.toSet()
        selectedDraft.update { draft ->
            draft?.let {
                if (
                    it.connectionMode == McuConnectionMode.USB &&
                    it.selectedUsbDeviceId.isNotBlank() &&
                    it.selectedUsbDeviceId !in availableIds
                ) {
                    it.copy(
                        selectedUsbDeviceId = "",
                        selectedUsbDeviceLabel = "",
                    ).invalidatePackageMetadata()
                } else {
                    it
                }
            }
        }
    }

    fun selectUsbDevice(deviceId: String) {
        val selectedDevice = usbDevices.value.firstOrNull { device -> device.deviceId == deviceId } ?: return
        selectedDraft.update { draft ->
            draft?.copy(
                selectedUsbDeviceId = selectedDevice.deviceId,
                selectedUsbDeviceLabel = selectedDevice.displayName,
                connectionStatus = McuConnectionStatus.DISCONNECTED,
                echoedSerialNumber = "",
                usbLinkStatus = "",
                logExcerpt = "",
                snapshotCapturedAtMillis = null,
            )?.invalidatePackageMetadata()
        }
    }

    fun requestUsbPermission() {
        val draft = selectedDraft.value ?: return
        if (draft.selectedUsbDeviceId.isBlank()) {
            bannerMessage.value = "Najpierw wybierz urządzenie USB."
            return
        }
        viewModelScope.launch {
            usbPermissionInFlight.value = true
            try {
                val grantedDevice = usbMcuClient.requestPermission(draft.selectedUsbDeviceId)
                usbDevices.value = usbMcuClient.listCandidateDevices()
                selectedDraft.update { currentDraft ->
                    currentDraft?.copy(
                        selectedUsbDeviceId = grantedDevice.deviceId,
                        selectedUsbDeviceLabel = grantedDevice.displayName,
                    )?.invalidatePackageMetadata()
                }
                bannerMessage.value = "Android nadał zgodę na dostęp do urządzenia USB."
            } catch (error: Exception) {
                bannerMessage.value = error.message ?: "Nie udało się uzyskać zgody USB."
            } finally {
                usbPermissionInFlight.value = false
            }
        }
    }

    fun connectToMcu() {
        val draft = selectedDraft.value ?: return
        viewModelScope.launch {
            try {
                val snapshot = when (draft.connectionMode) {
                    McuConnectionMode.MOCK -> mockMcuClient.connect(
                        deviceSerialNumber = draft.deviceSerialNumber,
                        deviceType = draft.deviceType,
                    )
                    McuConnectionMode.USB -> usbMcuClient.connect(
                        deviceSerialNumber = draft.deviceSerialNumber,
                        deviceType = draft.deviceType,
                        selectedDeviceId = draft.selectedUsbDeviceId,
                    )
                }
                val updatedDraft = draft.copy(
                    firmwareVersion = snapshot.firmwareVersion,
                    bootloaderVersion = snapshot.bootloaderVersion,
                    connectionStatus = McuConnectionStatus.CONNECTED,
                    echoedSerialNumber = snapshot.echoedSerialNumber,
                    mainboardStatus = snapshot.mainboardStatus,
                    inductionBoardStatus = snapshot.inductionBoardStatus,
                    hmiStatus = snapshot.hmiStatus,
                    watchdogStatus = snapshot.watchdogStatus,
                    usbLinkStatus = snapshot.usbLinkStatus,
                    logExcerpt = snapshot.logExcerpt,
                    snapshotCapturedAtMillis = snapshot.capturedAtMillis,
                    updatedAtMillis = snapshot.capturedAtMillis,
                ).invalidatePackageMetadata()
                repository.saveDraft(updatedDraft)
                selectedDraft.value = updatedDraft
                bannerMessage.value = if (draft.connectionMode == McuConnectionMode.USB) {
                    "Połączono z MCU przez USB i zapisano snapshot commissioning."
                } else {
                    "Połączono z Mock MCU i zapisano snapshot commissioning."
                }
            } catch (error: Exception) {
                val failedDraft = draft.copy(
                    connectionStatus = McuConnectionStatus.HARDWARE_REQUIRED,
                    updatedAtMillis = System.currentTimeMillis(),
                )
                repository.saveDraft(failedDraft)
                selectedDraft.value = failedDraft
                bannerMessage.value = error.message ?: "Nie udało się połączyć z MCU."
            }
        }
    }

    fun importPhoto(sourceUri: Uri) {
        val draft = selectedDraft.value ?: run {
            bannerMessage.value = "Najpierw wybierz lokalny draft commissioning."
            return
        }
        viewModelScope.launch {
            try {
                val attachment = artifactStore.importPhoto(
                    sessionId = draft.sessionId,
                    sourceUri = sourceUri,
                )
                val updatedDraft = draft.copy(
                    attachments = listOf(attachment) + draft.attachments,
                    updatedAtMillis = System.currentTimeMillis(),
                ).invalidatePackageMetadata()
                repository.saveDraft(updatedDraft)
                selectedDraft.value = updatedDraft
                bannerMessage.value = "Zdjecie zapisano lokalnie do sesji commissioning."
            } catch (error: Exception) {
                bannerMessage.value = error.message ?: "Nie udalo sie dodac zdjecia do sesji."
            }
        }
    }

    fun removePhoto(attachmentId: String) {
        val draft = selectedDraft.value ?: return
        val attachment = draft.attachments.firstOrNull { row -> row.attachmentId == attachmentId } ?: return
        viewModelScope.launch {
            artifactStore.removeAttachment(attachment)
            val updatedDraft = draft.copy(
                attachments = draft.attachments.filterNot { row -> row.attachmentId == attachmentId },
                updatedAtMillis = System.currentTimeMillis(),
            ).invalidatePackageMetadata()
            repository.saveDraft(updatedDraft)
            selectedDraft.value = updatedDraft
            bannerMessage.value = "Usunieto lokalne zdjecie z sesji commissioning."
        }
    }

    fun buildServicePackage() {
        val draft = selectedDraft.value ?: run {
            bannerMessage.value = "Najpierw wybierz lokalny draft commissioning."
            return
        }
        viewModelScope.launch {
            try {
                val packageResult = artifactStore.buildPackage(draft)
                val updatedDraft = draft.copy(
                    packagePath = packageResult.zipPath,
                    packageGeneratedAtMillis = packageResult.generatedAtMillis,
                    packageEntryCount = packageResult.entryCount,
                    updatedAtMillis = packageResult.generatedAtMillis,
                )
                repository.saveDraft(updatedDraft)
                selectedDraft.value = updatedDraft
                bannerMessage.value = "Wygenerowano lokalna paczke ZIP commissioning."
            } catch (error: Exception) {
                bannerMessage.value = error.message ?: "Nie udalo sie zbudowac paczki ZIP commissioning."
            }
        }
    }

    fun saveOffline() {
        val draft = selectedDraft.value ?: return
        viewModelScope.launch {
            val updatedDraft = draft.copy(
                syncStatus = if (draft.syncStatus == SessionSyncStatus.SYNCED) {
                    SessionSyncStatus.SYNCED
                } else {
                    SessionSyncStatus.DRAFT
                },
                updatedAtMillis = System.currentTimeMillis(),
            )
            repository.saveDraft(updatedDraft)
            selectedDraft.value = updatedDraft
            bannerMessage.value = "Draft zapisany lokalnie w Room."
        }
    }

    fun markReadyToSync() {
        val draft = selectedDraft.value ?: return
        if (!draft.readyToSync) {
            bannerMessage.value = "Uzupełnij wszystkie kroki checklisty przed kolejką synchronizacji."
            return
        }
        viewModelScope.launch {
            val updatedDraft = draft.copy(
                syncStatus = SessionSyncStatus.READY_TO_SYNC,
                updatedAtMillis = System.currentTimeMillis(),
            )
            repository.saveDraft(updatedDraft)
            selectedDraft.value = updatedDraft
            bannerMessage.value = "Sesja jest gotowa do przyszłej synchronizacji do backendu."
        }
    }

    fun dismissBanner() {
        bannerMessage.value = null
    }

    companion object {
        fun factory(
            repository: CommissioningRepository,
            mockMcuClient: MockMcuClient,
            usbMcuClient: UsbMcuClient,
            artifactStore: CommissioningArtifactStore,
        ): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    CommissioningViewModel(repository, mockMcuClient, usbMcuClient, artifactStore) as T
            }
    }
}

private fun ServiceSessionDraft.invalidatePackageMetadata(): ServiceSessionDraft =
    copy(
        packagePath = "",
        packageGeneratedAtMillis = null,
        packageEntryCount = 0,
    )
