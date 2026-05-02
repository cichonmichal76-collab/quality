package com.servicetrace.mobile.ui

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalLayoutApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.servicetrace.mobile.files.PendingCameraCapture
import com.servicetrace.mobile.model.CommissioningAttachment
import com.servicetrace.mobile.model.CommissioningStep
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionStatus
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SessionOutcome
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.model.SyncAttemptResult
import com.servicetrace.mobile.model.SyncAttemptTriggerSource
import com.servicetrace.mobile.model.SyncFailureReasonCode
import com.servicetrace.mobile.model.UsbCandidateDevice
import com.servicetrace.mobile.sync.MAX_AUTO_SYNC_RETRY_ATTEMPTS
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun CommissioningScreen(
    viewModel: CommissioningViewModel,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var pendingCameraCapture by remember { mutableStateOf<PendingCameraCapture?>(null) }
    val photoPickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { nonNullUri ->
            viewModel.importPhoto(nonNullUri)
        }
    }
    val cameraCaptureLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        val pendingCapture = pendingCameraCapture ?: return@rememberLauncherForActivityResult
        if (success) {
            viewModel.completeCameraCapture(pendingCapture)
        } else {
            viewModel.cancelCameraCapture(pendingCapture)
        }
        pendingCameraCapture = null
    }

    uiState.bannerMessage?.let { message ->
        LaunchedEffect(message) {
            snackbarHostState.showSnackbar(message)
            viewModel.dismissBanner()
        }
    }

    CommissioningScreen(
        uiState = uiState,
        snackbarHostState = snackbarHostState,
        onDeviceSerialChange = viewModel::updateDeviceSerialNumber,
        onDeviceTypeChange = viewModel::updateDeviceType,
        onTechnicianIdChange = viewModel::updateTechnicianId,
        onCreateDraft = viewModel::createDraft,
        onSelectDraft = viewModel::selectDraft,
        onStepStatusChange = viewModel::updateStepStatus,
        onStepNoteChange = viewModel::updateStepNote,
        onOverallCommentChange = viewModel::updateOverallComment,
        onFirmwareVersionChange = viewModel::updateFirmwareVersion,
        onBootloaderVersionChange = viewModel::updateBootloaderVersion,
        onConnectionModeChange = viewModel::updateConnectionMode,
        onRefreshUsbDevices = viewModel::refreshUsbDevices,
        onSelectUsbDevice = viewModel::selectUsbDevice,
        onRequestUsbPermission = viewModel::requestUsbPermission,
        onConnectToMcu = viewModel::connectToMcu,
        onExportSyncAudit = viewModel::exportSyncAudit,
        onShareSyncAudit = {
            viewModel.prepareSyncAuditShareUri()?.let { shareUri ->
                shareSyncAuditExport(context, shareUri)
            }
        },
        onCapturePhoto = {
            val pendingCapture = viewModel.prepareCameraCapture()
            if (pendingCapture != null) {
                pendingCameraCapture = pendingCapture
                cameraCaptureLauncher.launch(pendingCapture.outputUri)
            }
        },
        onAddPhotoFromGallery = { photoPickerLauncher.launch("image/*") },
        onRemovePhoto = viewModel::removePhoto,
        onBuildPackage = viewModel::buildServicePackage,
        onUploadBaseUrlChange = viewModel::updateUploadBaseUrl,
        onAutoSyncEnabledChange = viewModel::updateAutoSyncEnabled,
        onSyncReadyDrafts = viewModel::syncReadyDrafts,
        onSaveOffline = viewModel::saveOffline,
        onMarkReadyToSync = viewModel::markReadyToSync,
    )
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun CommissioningScreen(
    uiState: CommissioningUiState,
    snackbarHostState: SnackbarHostState,
    onDeviceSerialChange: (String) -> Unit,
    onDeviceTypeChange: (String) -> Unit,
    onTechnicianIdChange: (String) -> Unit,
    onCreateDraft: () -> Unit,
    onSelectDraft: (String) -> Unit,
    onStepStatusChange: (String, CommissioningStepStatus) -> Unit,
    onStepNoteChange: (String, String) -> Unit,
    onOverallCommentChange: (String) -> Unit,
    onFirmwareVersionChange: (String) -> Unit,
    onBootloaderVersionChange: (String) -> Unit,
    onConnectionModeChange: (McuConnectionMode) -> Unit,
    onRefreshUsbDevices: () -> Unit,
    onSelectUsbDevice: (String) -> Unit,
    onRequestUsbPermission: () -> Unit,
    onConnectToMcu: () -> Unit,
    onExportSyncAudit: (SyncAuditFilter, Boolean, Boolean) -> Unit,
    onShareSyncAudit: () -> Unit,
    onCapturePhoto: () -> Unit,
    onAddPhotoFromGallery: () -> Unit,
    onRemovePhoto: (String) -> Unit,
    onBuildPackage: () -> Unit,
    onUploadBaseUrlChange: (String) -> Unit,
    onAutoSyncEnabledChange: (Boolean) -> Unit,
    onSyncReadyDrafts: () -> Unit,
    onSaveOffline: () -> Unit,
    onMarkReadyToSync: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("ServiceTrace Mobile")
                        Text(
                            "Commissioning offline MVP",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SummarySection(
                drafts = uiState.drafts,
                uploadBaseUrl = uiState.uploadBaseUrl,
                autoSyncEnabled = uiState.autoSyncEnabled,
                networkAvailable = uiState.networkAvailable,
                syncInFlight = uiState.syncInFlight,
                onUploadBaseUrlChange = onUploadBaseUrlChange,
                onAutoSyncEnabledChange = onAutoSyncEnabledChange,
                onSyncReadyDrafts = onSyncReadyDrafts,
            )
            NewDraftSection(
                inputs = uiState.newDraftInputs,
                onDeviceSerialChange = onDeviceSerialChange,
                onDeviceTypeChange = onDeviceTypeChange,
                onTechnicianIdChange = onTechnicianIdChange,
                onCreateDraft = onCreateDraft,
            )
            DraftListSection(
                drafts = uiState.drafts,
                selectedSessionId = uiState.selectedDraft?.sessionId,
                onSelectDraft = onSelectDraft,
            )
            SyncAuditSection(
                drafts = uiState.drafts,
                selectedSessionId = uiState.selectedDraft?.sessionId,
                lastAuditExportPath = uiState.lastAuditExportPath,
                lastAuditExportAtMillis = uiState.lastAuditExportAtMillis,
                lastAuditExportRowCount = uiState.lastAuditExportRowCount,
                lastAuditExportRedacted = uiState.lastAuditExportRedacted,
                onSelectDraft = onSelectDraft,
                onExportSyncAudit = onExportSyncAudit,
                onShareSyncAudit = onShareSyncAudit,
            )
            HorizontalDivider()
            DraftEditorSection(
                draft = uiState.selectedDraft,
                onStepStatusChange = onStepStatusChange,
                onStepNoteChange = onStepNoteChange,
                onOverallCommentChange = onOverallCommentChange,
                onFirmwareVersionChange = onFirmwareVersionChange,
                onBootloaderVersionChange = onBootloaderVersionChange,
                onConnectionModeChange = onConnectionModeChange,
                usbDevices = uiState.usbDevices,
                usbPermissionInFlight = uiState.usbPermissionInFlight,
                onRefreshUsbDevices = onRefreshUsbDevices,
                onSelectUsbDevice = onSelectUsbDevice,
                onRequestUsbPermission = onRequestUsbPermission,
                onConnectToMcu = onConnectToMcu,
                onCapturePhoto = onCapturePhoto,
                onAddPhotoFromGallery = onAddPhotoFromGallery,
                onRemovePhoto = onRemovePhoto,
                onBuildPackage = onBuildPackage,
                onSaveOffline = onSaveOffline,
                onMarkReadyToSync = onMarkReadyToSync,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SyncAuditSection(
    drafts: List<ServiceSessionDraft>,
    selectedSessionId: String?,
    lastAuditExportPath: String?,
    lastAuditExportAtMillis: Long?,
    lastAuditExportRowCount: Int,
    lastAuditExportRedacted: Boolean,
    onSelectDraft: (String) -> Unit,
    onExportSyncAudit: (SyncAuditFilter, Boolean, Boolean) -> Unit,
    onShareSyncAudit: () -> Unit,
) {
    var filterName by rememberSaveable { mutableStateOf(SyncAuditFilter.ALL.name) }
    var onlySelectedDraft by rememberSaveable { mutableStateOf(false) }
    var redactSensitiveData by rememberSaveable { mutableStateOf(true) }
    val activeFilter = SyncAuditFilter.valueOf(filterName)
    val allRows = remember(drafts) { buildSyncAuditRows(drafts) }
    val filteredRows = remember(drafts, filterName, onlySelectedDraft, selectedSessionId) {
        buildSyncAuditRows(
            drafts = drafts,
            filter = activeFilter,
            onlySessionId = if (onlySelectedDraft) selectedSessionId else null,
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Audyt synchronizacji", style = MaterialTheme.typography.titleMedium)
        Card {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    SyncAuditFilter.entries.forEach { filter ->
                        val filterCount = when (filter) {
                            SyncAuditFilter.ALL -> allRows.size
                            SyncAuditFilter.FAILURES -> allRows.count { row -> row.attempt.result == SyncAttemptResult.FAILURE }
                            SyncAuditFilter.SUCCESSES -> allRows.count { row -> row.attempt.result == SyncAttemptResult.SUCCESS }
                        }
                        FilterChip(
                            selected = activeFilter == filter,
                            onClick = { filterName = filter.name },
                            label = { Text("${syncAuditFilterLabel(filter)}: $filterCount") },
                        )
                    }
                    if (selectedSessionId != null) {
                        FilterChip(
                            selected = onlySelectedDraft,
                            onClick = { onlySelectedDraft = !onlySelectedDraft },
                            label = {
                                Text(
                                    if (onlySelectedDraft) {
                                        "Tylko wybrany draft"
                                    } else {
                                        "Wszystkie drafty"
                                    },
                                )
                            },
                        )
                    }
                    FilterChip(
                        selected = redactSensitiveData,
                        onClick = { redactSensitiveData = !redactSensitiveData },
                        label = {
                            Text(
                                if (redactSensitiveData) {
                                    "Eksport z anonimizacja"
                                } else {
                                    "Eksport pelny"
                                },
                            )
                        },
                    )
                }
                Text(
                    "Pelny audyt pokazuje wszystkie lokalnie zapisane proby syncu wraz ze zrodlem uruchomienia, kodem bledu i metadanymi backendu po sukcesie.",
                    style = MaterialTheme.typography.bodySmall,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Button(
                        onClick = { onExportSyncAudit(activeFilter, onlySelectedDraft, redactSensitiveData) },
                        enabled = filteredRows.isNotEmpty(),
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Eksportuj JSON audytu")
                    }
                    Button(
                        onClick = onShareSyncAudit,
                        enabled = lastAuditExportPath != null,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Udostepnij ostatni eksport")
                    }
                }
                if (lastAuditExportPath != null && lastAuditExportAtMillis != null) {
                    Text(
                        "Ostatni eksport: ${formatTimestamp(lastAuditExportAtMillis)} ($lastAuditExportRowCount wpisow, ${if (lastAuditExportRedacted) "anonimizowany" else "pelny"})",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Text(lastAuditExportPath, style = MaterialTheme.typography.bodySmall)
                }
                if (filteredRows.isEmpty()) {
                    Text(
                        "Brak wpisow dla aktualnego filtra audytu.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    filteredRows.forEach { row ->
                        val selected = row.sessionId == selectedSessionId
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onSelectDraft(row.sessionId) },
                            colors = if (selected) {
                                CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)
                            } else {
                                CardDefaults.cardColors()
                            },
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    "${row.deviceSerialNumber} - ${row.deviceType}",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text("Sesja: ${row.sessionId} | Technik: ${row.technicianId}", style = MaterialTheme.typography.bodySmall)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    AssistChip(onClick = {}, label = { Text(syncAttemptResultLabel(row.attempt.result)) })
                                    AssistChip(onClick = {}, label = { Text(syncAttemptTriggerLabel(row.attempt.triggerSource)) })
                                    AssistChip(onClick = {}, label = { Text("Proba: ${row.attempt.attemptNumber}") })
                                    if (selected) {
                                        AssistChip(onClick = {}, label = { Text("Wybrany draft") })
                                    }
                                }
                                Text(formatTimestamp(row.attempt.attemptedAtMillis), style = MaterialTheme.typography.bodySmall)
                                if (row.attempt.failureCode != SyncFailureReasonCode.NONE) {
                                    Text(
                                        "Kod: ${syncFailureReasonLabel(row.attempt.failureCode)} | ${row.attempt.message}",
                                        style = MaterialTheme.typography.bodySmall,
                                    )
                                } else {
                                    buildBackendSyncSummary(row.attempt)?.let { backendSummary ->
                                        Text(backendSummary, style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SummarySection(
    drafts: List<ServiceSessionDraft>,
    uploadBaseUrl: String,
    autoSyncEnabled: Boolean,
    networkAvailable: Boolean,
    syncInFlight: Boolean,
    onUploadBaseUrlChange: (String) -> Unit,
    onAutoSyncEnabledChange: (Boolean) -> Unit,
    onSyncReadyDrafts: () -> Unit,
) {
    val readyCount = drafts.count { draft -> draft.syncStatus == SessionSyncStatus.READY_TO_SYNC }
    val blockedAutoRetryCount = drafts.count { draft -> isAutoRetrySuspended(draft) }
    val passCount = drafts.count { draft -> draft.outcome == SessionOutcome.PASS }
    val failCount = drafts.count { draft -> draft.outcome == SessionOutcome.FAIL }
    val syncedCount = drafts.count { draft -> draft.syncStatus == SessionSyncStatus.SYNCED }
    val syncErrorCount = drafts.count { draft ->
        draft.lastSyncErrorMessage.isNotBlank() && draft.syncStatus != SessionSyncStatus.SYNCED
    }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Stan lokalnej kolejki commissioning", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = {}, label = { Text("Drafty: ${drafts.size}") })
                AssistChip(onClick = {}, label = { Text("Gotowe do sync: $readyCount") })
                AssistChip(onClick = {}, label = { Text("Synced: $syncedCount") })
                AssistChip(onClick = {}, label = { Text("Bledy sync: $syncErrorCount") })
                AssistChip(onClick = {}, label = { Text("Auto-retry wstrzymane: $blockedAutoRetryCount") })
                AssistChip(onClick = {}, label = { Text("PASS: $passCount") })
                AssistChip(onClick = {}, label = { Text("FAIL: $failCount") })
                AssistChip(onClick = {}, label = { Text(if (networkAvailable) "Siec: online" else "Siec: offline") })
                FilterChip(
                    selected = autoSyncEnabled,
                    onClick = { onAutoSyncEnabledChange(!autoSyncEnabled) },
                    label = { Text(if (autoSyncEnabled) "Auto-sync: wlaczony" else "Auto-sync: wylaczony") },
                )
            }
            OutlinedTextField(
                value = uploadBaseUrl,
                onValueChange = onUploadBaseUrlChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Adres backendu do synchronizacji") },
                singleLine = true,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = onSyncReadyDrafts,
                    enabled = readyCount > 0 && !syncInFlight,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (syncInFlight) "Synchronizacja w toku..." else "Synchronizuj gotowe sesje")
                }
                Button(
                    onClick = { onAutoSyncEnabledChange(!autoSyncEnabled) },
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (autoSyncEnabled) "Wylacz auto-sync" else "Wlacz auto-sync")
                }
            }
            Text(
                "Aplikacja zapisuje sesje commissioning lokalnie, trwale pamieta adres backendu i ustawienie auto-sync oraz moze wysylac gotowe ZIP-y recznie albo automatycznie po odzyskaniu lacznosci.",
                style = MaterialTheme.typography.bodyMedium,
            )
            if (blockedAutoRetryCount > 0) {
                Text(
                    "Czesc sesji wymaga recznej interwencji: auto-retry zostal wstrzymany po bledzie trwalym albo po limicie prob.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun NewDraftSection(
    inputs: NewDraftInputs,
    onDeviceSerialChange: (String) -> Unit,
    onDeviceTypeChange: (String) -> Unit,
    onTechnicianIdChange: (String) -> Unit,
    onCreateDraft: () -> Unit,
) {
    Card {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Nowa sesja commissioning", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = inputs.deviceSerialNumber,
                onValueChange = onDeviceSerialChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Numer seryjny urzadzenia") },
                singleLine = true,
            )
            OutlinedTextField(
                value = inputs.deviceType,
                onValueChange = onDeviceTypeChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Typ urzadzenia") },
                singleLine = true,
            )
            OutlinedTextField(
                value = inputs.technicianId,
                onValueChange = onTechnicianIdChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Technik / serwisant") },
                singleLine = true,
            )
            Button(onClick = onCreateDraft, modifier = Modifier.fillMaxWidth()) {
                Text("Utworz draft offline")
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DraftListSection(
    drafts: List<ServiceSessionDraft>,
    selectedSessionId: String?,
    onSelectDraft: (String) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Lokalne sesje", style = MaterialTheme.typography.titleMedium)
        if (drafts.isEmpty()) {
            Card {
                Text(
                    "Brak lokalnych draftow. Utworz pierwsza sesje commissioning powyzej.",
                    modifier = Modifier.padding(16.dp),
                )
            }
            return
        }
        drafts.forEach { draft ->
            val selected = draft.sessionId == selectedSessionId
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onSelectDraft(draft.sessionId) },
                colors = if (selected) {
                    CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                } else {
                    CardDefaults.cardColors()
                },
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        "${draft.deviceSerialNumber} - ${draft.deviceType}",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text("Sesja: ${draft.sessionId}")
                    Text("Technik: ${draft.technicianId}")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        AssistChip(onClick = {}, label = { Text(syncLabel(draft.syncStatus)) })
                        draft.outcome?.let { outcome ->
                            AssistChip(onClick = {}, label = { Text("Wynik: ${outcome.name}") })
                        }
                        if (draft.syncAttemptCount > 0) {
                            AssistChip(onClick = {}, label = { Text("Proby sync: ${draft.syncAttemptCount}") })
                        }
                        if (isAutoRetrySuspended(draft)) {
                            AssistChip(onClick = {}, label = { Text("Auto-retry wstrzymany") })
                        }
                        if (draft.lastSyncFailureCode != SyncFailureReasonCode.NONE) {
                            AssistChip(onClick = {}, label = { Text("Kod: ${syncFailureReasonLabel(draft.lastSyncFailureCode)}") })
                        }
                    }
                    if (draft.lastSyncErrorMessage.isNotBlank()) {
                        Text("Ostatni blad sync: ${draft.lastSyncErrorMessage}", style = MaterialTheme.typography.bodySmall)
                    }
                    draft.lastSyncAttemptAtMillis?.let { lastAttemptAtMillis ->
                        Text("Ostatnia proba sync: ${formatTimestamp(lastAttemptAtMillis)}", style = MaterialTheme.typography.bodySmall)
                    }
                    Text("Aktualizacja: ${formatTimestamp(draft.updatedAtMillis)}")
                }
            }
        }
    }
}

@Composable
private fun DraftEditorSection(
    draft: ServiceSessionDraft?,
    onStepStatusChange: (String, CommissioningStepStatus) -> Unit,
    onStepNoteChange: (String, String) -> Unit,
    onOverallCommentChange: (String) -> Unit,
    onFirmwareVersionChange: (String) -> Unit,
    onBootloaderVersionChange: (String) -> Unit,
    onConnectionModeChange: (McuConnectionMode) -> Unit,
    usbDevices: List<UsbCandidateDevice>,
    usbPermissionInFlight: Boolean,
    onRefreshUsbDevices: () -> Unit,
    onSelectUsbDevice: (String) -> Unit,
    onRequestUsbPermission: () -> Unit,
    onConnectToMcu: () -> Unit,
    onCapturePhoto: () -> Unit,
    onAddPhotoFromGallery: () -> Unit,
    onRemovePhoto: (String) -> Unit,
    onBuildPackage: () -> Unit,
    onSaveOffline: () -> Unit,
    onMarkReadyToSync: () -> Unit,
) {
    if (draft == null) {
        Card {
            Text(
                "Wybierz draft, aby przejsc przez checkliste commissioning i zapisac lokalna sesje.",
                modifier = Modifier.padding(16.dp),
            )
        }
        return
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Edytor sesji commissioning", style = MaterialTheme.typography.titleMedium)
        Card {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("${draft.deviceSerialNumber} - ${draft.deviceType}", style = MaterialTheme.typography.titleLarge)
                Text("Technik: ${draft.technicianId}")
                Text("Status kolejki: ${syncLabel(draft.syncStatus)}")
                Text("Aktualny wynik: ${draft.outcome?.name ?: "W trakcie"}")
                ConnectionSection(
                    draft = draft,
                    usbDevices = usbDevices,
                    usbPermissionInFlight = usbPermissionInFlight,
                    onConnectionModeChange = onConnectionModeChange,
                    onRefreshUsbDevices = onRefreshUsbDevices,
                    onSelectUsbDevice = onSelectUsbDevice,
                    onRequestUsbPermission = onRequestUsbPermission,
                    onConnectToMcu = onConnectToMcu,
                )
                OutlinedTextField(
                    value = draft.firmwareVersion,
                    onValueChange = onFirmwareVersionChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Firmware") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = draft.bootloaderVersion,
                    onValueChange = onBootloaderVersionChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Bootloader") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = draft.overallComment,
                    onValueChange = onOverallCommentChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Komentarz ogolny") },
                    minLines = 3,
                )
                AttachmentsSection(
                    draft = draft,
                    onCapturePhoto = onCapturePhoto,
                    onAddPhotoFromGallery = onAddPhotoFromGallery,
                    onRemovePhoto = onRemovePhoto,
                    onBuildPackage = onBuildPackage,
                )
                SyncStatusSection(draft = draft)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Button(onClick = onSaveOffline, modifier = Modifier.weight(1f)) {
                        Text("Zapisz offline")
                    }
                    Button(
                        onClick = onMarkReadyToSync,
                        enabled = draft.readyToSync,
                        modifier = Modifier.weight(1f),
                    ) {
                        Text("Do kolejki sync")
                    }
                }
                Text(
                    "W tym MVP zapis lokalny obsluguje checkliste, komentarze, paczke ZIP, reczny upload i auto-sync po powrocie sieci.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        draft.steps.sortedBy { step -> step.stepOrder }.forEach { step ->
            StepCard(
                step = step,
                onStatusChange = onStepStatusChange,
                onNoteChange = onStepNoteChange,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AttachmentsSection(
    draft: ServiceSessionDraft,
    onCapturePhoto: () -> Unit,
    onAddPhotoFromGallery: () -> Unit,
    onRemovePhoto: (String) -> Unit,
    onBuildPackage: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Dowody serwisowe", style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onCapturePhoto) {
                Text("Zrob zdjecie")
            }
            Button(onClick = onAddPhotoFromGallery) {
                Text("Dodaj z galerii")
            }
            Button(onClick = onBuildPackage) {
                Text("Generuj ZIP")
            }
        }
        if (draft.packageGeneratedAtMillis != null && draft.packagePath.isNotBlank()) {
            Text(
                "ZIP: ${formatTimestamp(draft.packageGeneratedAtMillis)} (${draft.packageEntryCount} wpisow)",
                style = MaterialTheme.typography.bodySmall,
            )
            Text(draft.packagePath, style = MaterialTheme.typography.bodySmall)
        }
        if (draft.attachments.isEmpty()) {
            Text(
                "Brak lokalnych zdjec. Zrob zdjecie kamera albo dodaj obraz z galerii, aby dolaczyc go do paczki commissioning.",
                style = MaterialTheme.typography.bodySmall,
            )
        } else {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                draft.attachments.forEach { attachment ->
                    AttachmentChip(
                        attachment = attachment,
                        onRemovePhoto = onRemovePhoto,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SyncStatusSection(
    draft: ServiceSessionDraft,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Status synchronizacji", style = MaterialTheme.typography.titleMedium)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AssistChip(onClick = {}, label = { Text(syncLabel(draft.syncStatus)) })
            AssistChip(onClick = {}, label = { Text("Proby: ${draft.syncAttemptCount}") })
            if (isAutoRetrySuspended(draft)) {
                AssistChip(onClick = {}, label = { Text("Auto-retry wstrzymany") })
            }
            draft.lastSyncSuccessAtMillis?.let { successAtMillis ->
                AssistChip(onClick = {}, label = { Text("Ostatni sukces: ${formatTimestamp(successAtMillis)}") })
            }
        }
        draft.lastSyncAttemptAtMillis?.let { attemptAtMillis ->
            Text("Ostatnia proba: ${formatTimestamp(attemptAtMillis)}", style = MaterialTheme.typography.bodySmall)
        }
        if (draft.lastSyncErrorMessage.isNotBlank()) {
            Text("Ostatni blad: ${draft.lastSyncErrorMessage}", style = MaterialTheme.typography.bodySmall)
            if (draft.lastSyncFailureCode != SyncFailureReasonCode.NONE) {
                Text(
                    "Kod przyczyny: ${syncFailureReasonLabel(draft.lastSyncFailureCode)}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (isAutoRetrySuspended(draft)) {
                Text(
                    "Auto-retry zostal wstrzymany. Uzyj recznej synchronizacji albo popraw sesje i ponownie dodaj ja do kolejki. Limit automatycznych prob: $MAX_AUTO_SYNC_RETRY_ATTEMPTS.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        if (draft.syncAttempts.isNotEmpty()) {
            Text("Historia prob", style = MaterialTheme.typography.titleSmall)
            draft.syncAttempts.take(5).forEach { attempt ->
                Text(
                    "${formatTimestamp(attempt.attemptedAtMillis)} | ${syncAttemptTriggerLabel(attempt.triggerSource)} | ${syncAttemptResultLabel(attempt.result)} | proba ${attempt.attemptNumber}",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (attempt.failureCode != SyncFailureReasonCode.NONE) {
                    Text(
                        "Kod: ${syncFailureReasonLabel(attempt.failureCode)} | ${attempt.message}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                } else {
                    val backendSummary = buildBackendSyncSummary(attempt)
                    if (backendSummary != null) {
                        Text(backendSummary, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ConnectionSection(
    draft: ServiceSessionDraft,
    usbDevices: List<UsbCandidateDevice>,
    usbPermissionInFlight: Boolean,
    onConnectionModeChange: (McuConnectionMode) -> Unit,
    onRefreshUsbDevices: () -> Unit,
    onSelectUsbDevice: (String) -> Unit,
    onRequestUsbPermission: () -> Unit,
    onConnectToMcu: () -> Unit,
) {
    val selectedUsbDevice = usbDevices.firstOrNull { device -> device.deviceId == draft.selectedUsbDeviceId }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Polaczenie techniczne", style = MaterialTheme.typography.titleMedium)
        Text("Tryb: ${connectionModeLabel(draft.connectionMode)}")
        Text("Status: ${connectionStatusLabel(draft.connectionStatus)}")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            McuConnectionMode.entries.forEach { mode ->
                FilterChip(
                    selected = draft.connectionMode == mode,
                    onClick = { onConnectionModeChange(mode) },
                    label = { Text(connectionModeLabel(mode)) },
                )
            }
        }
        if (draft.connectionMode == McuConnectionMode.USB) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = onRefreshUsbDevices,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Odswiez USB")
                }
                Button(
                    onClick = onRequestUsbPermission,
                    enabled = selectedUsbDevice != null && !usbPermissionInFlight,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(if (usbPermissionInFlight) "Prosba o zgode..." else "Nadaj zgode USB")
                }
            }
            if (usbDevices.isEmpty()) {
                Text(
                    "Nie wykryto urzadzen USB z kanalem bulk IN/OUT. Podlacz MCU i odswiez liste.",
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    usbDevices.forEach { device ->
                        val permissionLabel = if (device.hasPermission) "zgoda" else "brak zgody"
                        FilterChip(
                            selected = draft.selectedUsbDeviceId == device.deviceId,
                            onClick = { onSelectUsbDevice(device.deviceId) },
                            label = { Text("${device.displayName} [$permissionLabel]") },
                        )
                    }
                }
            }
            selectedUsbDevice?.let { device ->
                Text("Wybrane USB: ${device.displayName}", style = MaterialTheme.typography.bodySmall)
            }
        }
        Button(onClick = onConnectToMcu, modifier = Modifier.fillMaxWidth()) {
            Text(
                if (draft.connectionMode == McuConnectionMode.MOCK) {
                    if (draft.connectionStatus == McuConnectionStatus.CONNECTED) {
                        "Odswiez snapshot Mock MCU"
                    } else {
                        "Polacz z Mock MCU"
                    }
                } else {
                    "Polacz z wybranym USB"
                },
            )
        }
        if (draft.snapshotCapturedAtMillis != null) {
            Text("Snapshot: ${formatTimestamp(draft.snapshotCapturedAtMillis)}")
        }
        if (draft.echoedSerialNumber.isNotBlank()) {
            Text("Serial z MCU: ${draft.echoedSerialNumber}")
        }
        if (draft.usbLinkStatus.isNotBlank()) {
            Text("Link: ${draft.usbLinkStatus}")
        }
        if (draft.mainboardStatus.isNotBlank()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = {}, label = { Text("Mainboard: ${draft.mainboardStatus}") })
                AssistChip(onClick = {}, label = { Text("Induction: ${draft.inductionBoardStatus}") })
                AssistChip(onClick = {}, label = { Text("HMI: ${draft.hmiStatus}") })
                AssistChip(onClick = {}, label = { Text("Watchdog: ${draft.watchdogStatus}") })
            }
        }
        if (draft.logExcerpt.isNotBlank()) {
            Text(draft.logExcerpt, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LegacyConnectionSectionUnused(
    draft: ServiceSessionDraft,
    onConnectionModeChange: (McuConnectionMode) -> Unit,
    onConnectToMcu: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Polaczenie techniczne", style = MaterialTheme.typography.titleMedium)
        Text("Tryb: ${connectionModeLabel(draft.connectionMode)}")
        Text("Status: ${connectionStatusLabel(draft.connectionStatus)}")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            McuConnectionMode.entries.forEach { mode ->
                FilterChip(
                    selected = draft.connectionMode == mode,
                    onClick = { onConnectionModeChange(mode) },
                    label = { Text(connectionModeLabel(mode)) },
                )
            }
        }
        Button(onClick = onConnectToMcu, modifier = Modifier.fillMaxWidth()) {
            Text(
                if (draft.connectionMode == McuConnectionMode.MOCK) {
                    if (draft.connectionStatus == McuConnectionStatus.CONNECTED) {
                        "Odswiez snapshot Mock MCU"
                    } else {
                        "Polacz z Mock MCU"
                    }
                } else {
                    "Polacz przez USB"
                },
            )
        }
        if (draft.snapshotCapturedAtMillis != null) {
            Text("Snapshot: ${formatTimestamp(draft.snapshotCapturedAtMillis)}")
        }
        if (draft.echoedSerialNumber.isNotBlank()) {
            Text("Serial z MCU: ${draft.echoedSerialNumber}")
        }
        if (draft.usbLinkStatus.isNotBlank()) {
            Text("Link: ${draft.usbLinkStatus}")
        }
        if (draft.mainboardStatus.isNotBlank()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = {}, label = { Text("Mainboard: ${draft.mainboardStatus}") })
                AssistChip(onClick = {}, label = { Text("Induction: ${draft.inductionBoardStatus}") })
                AssistChip(onClick = {}, label = { Text("HMI: ${draft.hmiStatus}") })
                AssistChip(onClick = {}, label = { Text("Watchdog: ${draft.watchdogStatus}") })
            }
        }
        if (draft.logExcerpt.isNotBlank()) {
            Text(draft.logExcerpt, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun AttachmentChip(
    attachment: CommissioningAttachment,
    onRemovePhoto: (String) -> Unit,
) {
    FilterChip(
        selected = false,
        onClick = { onRemovePhoto(attachment.attachmentId) },
        label = { Text("${attachment.displayName} (${attachment.sizeBytes} B) usun") },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StepCard(
    step: CommissioningStep,
    onStatusChange: (String, CommissioningStepStatus) -> Unit,
    onNoteChange: (String, String) -> Unit,
) {
    Card {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(step.title, style = MaterialTheme.typography.titleMedium)
            Text(step.instructions, style = MaterialTheme.typography.bodyMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CommissioningStepStatus.entries.forEach { status ->
                    FilterChip(
                        selected = step.status == status,
                        onClick = { onStatusChange(step.stepCode, status) },
                        label = { Text(statusLabel(status)) },
                    )
                }
            }
            OutlinedTextField(
                value = step.note,
                onValueChange = { note -> onNoteChange(step.stepCode, note) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Notatka kroku") },
                minLines = 2,
            )
        }
    }
}

private fun formatTimestamp(timestampMillis: Long): String =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
        .withZone(ZoneId.systemDefault())
        .format(Instant.ofEpochMilli(timestampMillis))

private fun syncLabel(status: SessionSyncStatus): String =
    when (status) {
        SessionSyncStatus.DRAFT -> "Draft lokalny"
        SessionSyncStatus.READY_TO_SYNC -> "Gotowe do synchronizacji"
        SessionSyncStatus.SYNCED -> "Zsynchronizowane"
    }

private fun connectionModeLabel(mode: McuConnectionMode): String =
    when (mode) {
        McuConnectionMode.MOCK -> "Mock MCU"
        McuConnectionMode.USB -> "USB"
    }

private fun connectionStatusLabel(status: McuConnectionStatus): String =
    when (status) {
        McuConnectionStatus.DISCONNECTED -> "Rozlaczone"
        McuConnectionStatus.CONNECTED -> "Polaczone"
        McuConnectionStatus.HARDWARE_REQUIRED -> "Wymaga sprzetu lub zgody USB"
    }

private fun statusLabel(status: CommissioningStepStatus): String =
    when (status) {
        CommissioningStepStatus.TODO -> "TODO"
        CommissioningStepStatus.PASS -> "PASS"
        CommissioningStepStatus.FAIL -> "FAIL"
        CommissioningStepStatus.HOLD -> "HOLD"
    }

private fun syncFailureReasonLabel(reasonCode: SyncFailureReasonCode): String =
    when (reasonCode) {
        SyncFailureReasonCode.NONE -> "Brak"
        SyncFailureReasonCode.MISSING_PACKAGE -> "Brak paczki ZIP"
        SyncFailureReasonCode.NETWORK_TIMEOUT -> "Timeout sieci"
        SyncFailureReasonCode.NETWORK_CONNECTIVITY -> "Brak lacznosci"
        SyncFailureReasonCode.RATE_LIMIT -> "Limit backendu"
        SyncFailureReasonCode.SERVER_ERROR -> "Blad backendu 5xx"
        SyncFailureReasonCode.VALIDATION_ERROR -> "Blad walidacji"
        SyncFailureReasonCode.CLIENT_ERROR -> "Blad klienta 4xx"
        SyncFailureReasonCode.UNKNOWN -> "Blad nieznany"
    }

private fun syncAttemptTriggerLabel(triggerSource: SyncAttemptTriggerSource): String =
    when (triggerSource) {
        SyncAttemptTriggerSource.MANUAL -> "Recznie"
        SyncAttemptTriggerSource.AUTO_NETWORK -> "Auto po sieci"
        SyncAttemptTriggerSource.AUTO_READY -> "Auto po READY"
        SyncAttemptTriggerSource.DEFERRED_WORKER -> "Worker w tle"
    }

private fun syncAttemptResultLabel(result: SyncAttemptResult): String =
    when (result) {
        SyncAttemptResult.SUCCESS -> "SUCCESS"
        SyncAttemptResult.FAILURE -> "FAILURE"
    }

private fun shareSyncAuditExport(
    context: Context,
    shareUri: android.net.Uri,
) {
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_STREAM, shareUri)
        putExtra(Intent.EXTRA_SUBJECT, "ServiceTrace Sync Audit")
        clipData = ClipData.newUri(context.contentResolver, "service-trace-sync-audit", shareUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        if (context !is Activity) {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }
    context.startActivity(Intent.createChooser(shareIntent, "Udostepnij audyt synchronizacji"))
}

private fun isAutoRetrySuspended(draft: ServiceSessionDraft): Boolean =
    draft.syncStatus == SessionSyncStatus.READY_TO_SYNC &&
        draft.lastSyncErrorMessage.isNotBlank() &&
        !draft.lastSyncAutoRetryEligible
