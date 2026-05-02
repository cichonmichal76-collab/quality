package com.servicetrace.mobile.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.servicetrace.mobile.data.CommissioningRepository
import com.servicetrace.mobile.files.CommissioningArtifactStore
import com.servicetrace.mobile.files.PendingCameraCapture
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionStatus
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.model.SyncFailureReasonCode
import com.servicetrace.mobile.model.SyncAttemptTriggerSource
import com.servicetrace.mobile.model.UsbCandidateDevice
import com.servicetrace.mobile.mcu.MockMcuClient
import com.servicetrace.mobile.mcu.UsbMcuClient
import com.servicetrace.mobile.sync.CommissioningSyncRunner
import com.servicetrace.mobile.sync.CommissioningSyncWorkScheduler
import com.servicetrace.mobile.sync.ConnectivityMonitor
import com.servicetrace.mobile.sync.DEFAULT_COMMISSIONING_UPLOAD_BASE_URL
import com.servicetrace.mobile.sync.SyncSettingsStore
import com.servicetrace.mobile.sync.shouldAutoRetrySync
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
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
    val uploadBaseUrl: String = DEFAULT_COMMISSIONING_UPLOAD_BASE_URL,
    val autoSyncEnabled: Boolean = true,
    val networkAvailable: Boolean = false,
    val syncInFlight: Boolean = false,
    val lastAuditExportPath: String? = null,
    val lastAuditExportAtMillis: Long? = null,
    val lastAuditExportRowCount: Int = 0,
    val bannerMessage: String? = null,
)

class CommissioningViewModel(
    private val repository: CommissioningRepository,
    private val mockMcuClient: MockMcuClient,
    private val usbMcuClient: UsbMcuClient,
    private val artifactStore: CommissioningArtifactStore,
    private val connectivityMonitor: ConnectivityMonitor,
    private val syncSettingsStore: SyncSettingsStore,
    private val syncRunner: CommissioningSyncRunner,
    private val syncWorkScheduler: CommissioningSyncWorkScheduler,
) : ViewModel() {
    private val inputs = MutableStateFlow(NewDraftInputs())
    private val selectedDraft = MutableStateFlow<ServiceSessionDraft?>(null)
    private val usbDevices = MutableStateFlow<List<UsbCandidateDevice>>(emptyList())
    private val usbPermissionInFlight = MutableStateFlow(false)
    private val uploadBaseUrl = MutableStateFlow(syncSettingsStore.current().uploadBaseUrl)
    private val autoSyncEnabled = MutableStateFlow(syncSettingsStore.current().autoSyncEnabled)
    private val networkAvailable = MutableStateFlow(connectivityMonitor.currentStatus())
    private val syncInFlight = MutableStateFlow(false)
    private val lastAuditExportPath = MutableStateFlow<String?>(null)
    private val lastAuditExportAtMillis = MutableStateFlow<Long?>(null)
    private val lastAuditExportRowCount = MutableStateFlow(0)
    private val bannerMessage = MutableStateFlow<String?>(null)
    private var lastAutoSyncReadySignature: String = ""

    val uiState: StateFlow<CommissioningUiState> = combine(
        repository.observeDrafts(),
        inputs,
        selectedDraft,
        usbDevices,
        usbPermissionInFlight,
        uploadBaseUrl,
        autoSyncEnabled,
        networkAvailable,
        syncInFlight,
        lastAuditExportPath,
        lastAuditExportAtMillis,
        lastAuditExportRowCount,
        bannerMessage,
    ) { drafts, draftInputs, currentDraft, availableUsbDevices, permissionInFlight, currentUploadBaseUrl, currentAutoSyncEnabled, online, syncRunning, auditExportPath, auditExportAtMillis, auditExportRowCountValue, message ->
        val selected = currentDraft?.let { draft ->
            drafts.firstOrNull { row -> row.sessionId == draft.sessionId } ?: draft
        } ?: drafts.firstOrNull()
        CommissioningUiState(
            drafts = drafts,
            selectedDraft = selected,
            newDraftInputs = draftInputs,
            usbDevices = availableUsbDevices,
            usbPermissionInFlight = permissionInFlight,
            uploadBaseUrl = currentUploadBaseUrl,
            autoSyncEnabled = currentAutoSyncEnabled,
            networkAvailable = online,
            syncInFlight = syncRunning,
            lastAuditExportPath = auditExportPath,
            lastAuditExportAtMillis = auditExportAtMillis,
            lastAuditExportRowCount = auditExportRowCountValue,
            bannerMessage = message,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = CommissioningUiState(),
    )

    init {
        refreshUsbDevices()
        observeSyncSettings()
        observeConnectivity()
        observeDraftsForAutoSync()
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

    fun updateUploadBaseUrl(value: String) {
        uploadBaseUrl.value = value
        syncSettingsStore.updateUploadBaseUrl(value)
    }

    fun updateAutoSyncEnabled(enabled: Boolean) {
        autoSyncEnabled.value = enabled
        syncSettingsStore.updateAutoSyncEnabled(enabled)
        if (!enabled) {
            lastAutoSyncReadySignature = ""
            syncWorkScheduler.cancelDeferredSync()
        } else {
            val drafts = uiState.value.drafts
            if (shouldQueueDeferredSync(enabled, networkAvailable.value, drafts.count(::shouldAutoRetrySync))) {
                syncWorkScheduler.enqueueDeferredSync()
            }
            maybeAutoSyncOnline(
                trigger = SyncTrigger.AUTO_NETWORK,
                drafts = drafts,
            )
        }
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
            bannerMessage.value = "Najpierw wybierz urzadzenie USB."
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
                bannerMessage.value = "Android przyznal zgode na dostep do urzadzenia USB."
            } catch (error: Exception) {
                bannerMessage.value = error.message ?: "Nie udalo sie uzyskac zgody USB."
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
                    "Polaczono z MCU przez USB i zapisano snapshot commissioning."
                } else {
                    "Polaczono z Mock MCU i zapisano snapshot commissioning."
                }
            } catch (error: Exception) {
                val failedDraft = draft.copy(
                    connectionStatus = McuConnectionStatus.HARDWARE_REQUIRED,
                    updatedAtMillis = System.currentTimeMillis(),
                )
                repository.saveDraft(failedDraft)
                selectedDraft.value = failedDraft
                bannerMessage.value = error.message ?: "Nie udalo sie polaczyc z MCU."
            }
        }
    }

    fun prepareCameraCapture(): PendingCameraCapture? {
        val draft = selectedDraft.value ?: run {
            bannerMessage.value = "Najpierw wybierz lokalny draft commissioning."
            return null
        }
        return runCatching {
            artifactStore.createPendingCameraCapture(draft.sessionId)
        }.getOrElse { error ->
            bannerMessage.value = error.message ?: "Nie udalo sie przygotowac zapisu zdjecia z kamery."
            null
        }
    }

    fun completeCameraCapture(capture: PendingCameraCapture) {
        viewModelScope.launch {
            val draft = repository.getDraft(capture.sessionId) ?: run {
                artifactStore.discardPendingCameraCapture(capture)
                bannerMessage.value = "Nie znaleziono draftu commissioning dla zapisanego zdjecia."
                return@launch
            }
            try {
                val attachment = artifactStore.finalizeCameraCapture(capture)
                val updatedDraft = draft.copy(
                    attachments = listOf(attachment) + draft.attachments,
                    updatedAtMillis = System.currentTimeMillis(),
                ).invalidatePackageMetadata()
                repository.saveDraft(updatedDraft)
                selectedDraft.value = updatedDraft
                bannerMessage.value = "Zdjecie z kamery zapisano lokalnie do sesji commissioning."
            } catch (error: Exception) {
                artifactStore.discardPendingCameraCapture(capture)
                bannerMessage.value = error.message ?: "Nie udalo sie zapisac zdjecia z kamery."
            }
        }
    }

    fun cancelCameraCapture(capture: PendingCameraCapture) {
        artifactStore.discardPendingCameraCapture(capture)
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

    fun syncReadyDrafts() {
        startSync(trigger = SyncTrigger.MANUAL)
    }

    fun exportSyncAudit(
        filter: SyncAuditFilter,
        onlySelectedDraft: Boolean,
    ) {
        viewModelScope.launch {
            val selectedSessionId = if (onlySelectedDraft) selectedDraft.value?.sessionId else null
            val rows = buildSyncAuditRows(
                drafts = uiState.value.drafts,
                filter = filter,
                onlySessionId = selectedSessionId,
            )
            if (rows.isEmpty()) {
                bannerMessage.value = "Brak wpisow do eksportu audytu synchronizacji."
                return@launch
            }
            try {
                val exportedAtMillis = System.currentTimeMillis()
                val json = buildSyncAuditJson(
                    rows = rows,
                    filter = filter,
                    exportedAtMillis = exportedAtMillis,
                    selectedSessionId = selectedSessionId,
                )
                val result = artifactStore.exportSyncAuditReport(
                    content = json,
                    rowCount = rows.size,
                )
                lastAuditExportPath.value = result.exportPath
                lastAuditExportAtMillis.value = result.generatedAtMillis
                lastAuditExportRowCount.value = result.rowCount
                bannerMessage.value = "Wyeksportowano audyt synchronizacji do JSON."
            } catch (error: Exception) {
                bannerMessage.value = error.message ?: "Nie udalo sie wyeksportowac audytu synchronizacji."
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
                lastSyncFailureCode = SyncFailureReasonCode.NONE,
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
            bannerMessage.value = "Uzupelnij wszystkie kroki checklisty przed kolejka synchronizacji."
            return
        }
        viewModelScope.launch {
            val updatedDraft = draft.copy(
                syncStatus = SessionSyncStatus.READY_TO_SYNC,
                syncAttemptCount = 0,
                lastSyncAttemptAtMillis = null,
                lastSyncSuccessAtMillis = null,
                lastSyncErrorMessage = "",
                lastSyncFailureCode = SyncFailureReasonCode.NONE,
                lastSyncAutoRetryEligible = true,
                updatedAtMillis = System.currentTimeMillis(),
            )
            repository.saveDraft(updatedDraft)
            selectedDraft.value = updatedDraft
            bannerMessage.value = "Sesja jest gotowa do przyszlej synchronizacji do backendu."
            val otherReadyDrafts = uiState.value.drafts.filter { row ->
                row.sessionId != updatedDraft.sessionId && row.syncStatus == SessionSyncStatus.READY_TO_SYNC
            }
            maybeAutoSyncOnline(
                trigger = SyncTrigger.AUTO_READY,
                drafts = listOf(updatedDraft) + otherReadyDrafts,
            )
            val autoRetryReadyCount = (listOf(updatedDraft) + otherReadyDrafts).count(::shouldAutoRetrySync)
            if (shouldQueueDeferredSync(autoSyncEnabled.value, networkAvailable.value, autoRetryReadyCount)) {
                syncWorkScheduler.enqueueDeferredSync()
            }
        }
    }

    fun dismissBanner() {
        bannerMessage.value = null
    }

    private fun observeSyncSettings() {
        viewModelScope.launch {
            syncSettingsStore.settings.collect { settings ->
                uploadBaseUrl.value = settings.uploadBaseUrl
                autoSyncEnabled.value = settings.autoSyncEnabled
                if (!settings.autoSyncEnabled) {
                    lastAutoSyncReadySignature = ""
                    syncWorkScheduler.cancelDeferredSync()
                } else {
                    val drafts = uiState.value.drafts
                    if (shouldQueueDeferredSync(settings.autoSyncEnabled, networkAvailable.value, drafts.count(::shouldAutoRetrySync))) {
                        syncWorkScheduler.enqueueDeferredSync()
                    }
                }
            }
        }
    }

    private fun observeConnectivity() {
        viewModelScope.launch {
            connectivityMonitor.isOnline
                .distinctUntilChanged()
                .collect { online ->
                    networkAvailable.value = online
                    if (!online) {
                        lastAutoSyncReadySignature = ""
                        val readyDraftCount = uiState.value.drafts.count(::shouldAutoRetrySync)
                        if (shouldQueueDeferredSync(autoSyncEnabled.value, online, readyDraftCount)) {
                            syncWorkScheduler.enqueueDeferredSync()
                        }
                    } else {
                        maybeAutoSyncOnline(
                            trigger = SyncTrigger.AUTO_NETWORK,
                            drafts = uiState.value.drafts,
                        )
                    }
                }
        }
    }

    private fun observeDraftsForAutoSync() {
        viewModelScope.launch {
            repository.observeDrafts().collect { drafts ->
                val readyDraftCount = drafts.count(::shouldAutoRetrySync)
                if (shouldQueueDeferredSync(autoSyncEnabled.value, networkAvailable.value, readyDraftCount)) {
                    syncWorkScheduler.enqueueDeferredSync()
                }
                maybeAutoSyncOnline(
                    trigger = SyncTrigger.AUTO_NETWORK,
                    drafts = drafts,
                )
            }
        }
    }

    private fun maybeAutoSyncOnline(
        trigger: SyncTrigger,
        drafts: List<ServiceSessionDraft>,
    ) {
        val readyDrafts = drafts.filter(::shouldAutoRetrySync)
        val signature = readyDrafts
            .map { draft -> draft.sessionId }
            .sorted()
            .joinToString(separator = "|")

        if (!canAutoSync(autoSyncEnabled.value, networkAvailable.value, syncInFlight.value, readyDrafts.size)) {
            return
        }
        if (signature.isBlank() || signature == lastAutoSyncReadySignature) {
            return
        }

        lastAutoSyncReadySignature = signature
        startSync(
            trigger = trigger,
            readyDraftsOverride = readyDrafts,
        )
    }

    private fun startSync(
        trigger: SyncTrigger,
        readyDraftsOverride: List<ServiceSessionDraft>? = null,
    ) {
        val readyDrafts = (readyDraftsOverride ?: uiState.value.drafts.filter { draft ->
            draft.syncStatus == SessionSyncStatus.READY_TO_SYNC
        }).distinctBy { draft -> draft.sessionId }

        if (readyDrafts.isEmpty()) {
            if (trigger == SyncTrigger.MANUAL) {
                bannerMessage.value = "Brak sesji gotowych do synchronizacji."
            }
            return
        }

        if (syncInFlight.value) {
            if (trigger == SyncTrigger.MANUAL) {
                bannerMessage.value = "Synchronizacja commissioning juz trwa."
            }
            return
        }

        if (trigger != SyncTrigger.MANUAL && !canAutoSync(autoSyncEnabled.value, networkAvailable.value, syncInFlight.value, readyDrafts.size)) {
            return
        }

        viewModelScope.launch {
            syncInFlight.value = true
            try {
                val result = syncRunner.syncDrafts(
                    baseUrl = uploadBaseUrl.value,
                    drafts = readyDrafts,
                    triggerSource = trigger.toAttemptTriggerSource(),
                )
                val currentSelectedDraftId = selectedDraft.value?.sessionId
                if (currentSelectedDraftId != null) {
                    result.latestDraftsBySessionId[currentSelectedDraftId]?.let { latestDraft ->
                        selectedDraft.value = latestDraft
                    }
                }
                bannerMessage.value = buildSyncCompletionMessage(
                    trigger = trigger,
                    uploadedCount = result.uploadedCount,
                    failedCount = result.failedCount,
                )
            } finally {
                syncInFlight.value = false
            }
        }
    }

    companion object {
        fun factory(
            repository: CommissioningRepository,
            mockMcuClient: MockMcuClient,
            usbMcuClient: UsbMcuClient,
            artifactStore: CommissioningArtifactStore,
            connectivityMonitor: ConnectivityMonitor,
            syncSettingsStore: SyncSettingsStore,
            syncRunner: CommissioningSyncRunner,
            syncWorkScheduler: CommissioningSyncWorkScheduler,
        ): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    CommissioningViewModel(
                        repository = repository,
                        mockMcuClient = mockMcuClient,
                        usbMcuClient = usbMcuClient,
                        artifactStore = artifactStore,
                        connectivityMonitor = connectivityMonitor,
                        syncSettingsStore = syncSettingsStore,
                        syncRunner = syncRunner,
                        syncWorkScheduler = syncWorkScheduler,
                    ) as T
            }
    }
}

internal enum class SyncTrigger {
    MANUAL,
    AUTO_NETWORK,
    AUTO_READY,
}

private fun SyncTrigger.toAttemptTriggerSource(): SyncAttemptTriggerSource =
    when (this) {
        SyncTrigger.MANUAL -> SyncAttemptTriggerSource.MANUAL
        SyncTrigger.AUTO_NETWORK -> SyncAttemptTriggerSource.AUTO_NETWORK
        SyncTrigger.AUTO_READY -> SyncAttemptTriggerSource.AUTO_READY
    }

internal fun canAutoSync(
    autoSyncEnabled: Boolean,
    networkAvailable: Boolean,
    syncInFlight: Boolean,
    readyDraftCount: Int,
): Boolean =
    autoSyncEnabled && networkAvailable && !syncInFlight && readyDraftCount > 0

internal fun shouldQueueDeferredSync(
    autoSyncEnabled: Boolean,
    networkAvailable: Boolean,
    readyDraftCount: Int,
): Boolean =
    autoSyncEnabled && !networkAvailable && readyDraftCount > 0

internal fun buildSyncCompletionMessage(
    trigger: SyncTrigger,
    uploadedCount: Int,
    failedCount: Int,
): String =
    when (trigger) {
        SyncTrigger.MANUAL ->
            when {
                failedCount == 0 -> "Zsynchronizowano $uploadedCount sesji commissioning do backendu."
                uploadedCount == 0 -> "Nie udalo sie zsynchronizowac zadnej sesji commissioning."
                else -> "Zsynchronizowano $uploadedCount sesji commissioning, bledy: $failedCount."
            }
        SyncTrigger.AUTO_NETWORK ->
            when {
                failedCount == 0 -> "Auto-sync po odzyskaniu lacznosci zsynchronizowal $uploadedCount sesji commissioning."
                uploadedCount == 0 -> "Auto-sync po odzyskaniu lacznosci nie udal sie dla zadnej sesji commissioning."
                else -> "Auto-sync po odzyskaniu lacznosci zsynchronizowal $uploadedCount sesji commissioning, bledy: $failedCount."
            }
        SyncTrigger.AUTO_READY ->
            when {
                failedCount == 0 -> "Auto-sync od razu wyslal $uploadedCount gotowych sesji commissioning."
                uploadedCount == 0 -> "Auto-sync nie udal sie dla nowo oznaczonych sesji commissioning."
                else -> "Auto-sync od razu wyslal $uploadedCount gotowych sesji commissioning, bledy: $failedCount."
            }
    }

private fun ServiceSessionDraft.invalidatePackageMetadata(): ServiceSessionDraft =
    copy(
        packagePath = "",
        packageGeneratedAtMillis = null,
        packageEntryCount = 0,
        syncAttemptCount = 0,
        lastSyncAttemptAtMillis = null,
        lastSyncSuccessAtMillis = null,
        lastSyncErrorMessage = "",
        lastSyncFailureCode = SyncFailureReasonCode.NONE,
        lastSyncAutoRetryEligible = true,
        syncStatus = if (syncStatus == SessionSyncStatus.SYNCED) {
            SessionSyncStatus.DRAFT
        } else {
            syncStatus
        },
    )
