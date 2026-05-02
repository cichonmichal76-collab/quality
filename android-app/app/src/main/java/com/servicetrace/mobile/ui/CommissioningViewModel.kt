package com.servicetrace.mobile.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.servicetrace.mobile.data.CommissioningRepository
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionStatus
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.mcu.MockMcuClient
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
    val bannerMessage: String? = null,
)

class CommissioningViewModel(
    private val repository: CommissioningRepository,
    private val mockMcuClient: MockMcuClient,
) : ViewModel() {
    private val inputs = MutableStateFlow(NewDraftInputs())
    private val selectedDraft = MutableStateFlow<ServiceSessionDraft?>(null)
    private val bannerMessage = MutableStateFlow<String?>(null)

    val uiState: StateFlow<CommissioningUiState> = combine(
        repository.observeDrafts(),
        inputs,
        selectedDraft,
        bannerMessage,
    ) { drafts, draftInputs, currentDraft, message ->
        val selected = currentDraft?.let { draft ->
            drafts.firstOrNull { row -> row.sessionId == draft.sessionId } ?: draft
        } ?: drafts.firstOrNull()
        CommissioningUiState(
            drafts = drafts,
            selectedDraft = selected,
            newDraftInputs = draftInputs,
            bannerMessage = message,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CommissioningUiState(),
    )

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
            )
        }
    }

    fun updateStepNote(stepCode: String, note: String) {
        selectedDraft.update { draft ->
            draft?.copy(
                steps = draft.steps.map { step ->
                    if (step.stepCode == stepCode) step.copy(note = note) else step
                },
            )
        }
    }

    fun updateOverallComment(comment: String) {
        selectedDraft.update { draft -> draft?.copy(overallComment = comment) }
    }

    fun updateFirmwareVersion(value: String) {
        selectedDraft.update { draft -> draft?.copy(firmwareVersion = value) }
    }

    fun updateBootloaderVersion(value: String) {
        selectedDraft.update { draft -> draft?.copy(bootloaderVersion = value) }
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
            )
        }
    }

    fun connectToMcu() {
        val draft = selectedDraft.value ?: return
        viewModelScope.launch {
            if (draft.connectionMode == McuConnectionMode.USB) {
                val updatedDraft = draft.copy(
                    connectionStatus = McuConnectionStatus.HARDWARE_REQUIRED,
                    updatedAtMillis = System.currentTimeMillis(),
                )
                repository.saveDraft(updatedDraft)
                selectedDraft.value = updatedDraft
                bannerMessage.value =
                    "Tryb USB jest już widoczny w workflow, ale właściwy UsbMcuClient dołożymy w następnym kroku."
                return@launch
            }

            val snapshot = mockMcuClient.connect(
                deviceSerialNumber = draft.deviceSerialNumber,
                deviceType = draft.deviceType,
            )
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
            )
            repository.saveDraft(updatedDraft)
            selectedDraft.value = updatedDraft
            bannerMessage.value = "Połączono z Mock MCU i zapisano snapshot commissioning."
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
        ): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    CommissioningViewModel(repository, mockMcuClient) as T
            }
    }
}
