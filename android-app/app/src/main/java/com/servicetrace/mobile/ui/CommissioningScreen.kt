package com.servicetrace.mobile.ui

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
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.servicetrace.mobile.model.CommissioningStep
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SessionOutcome
import com.servicetrace.mobile.model.SessionSyncStatus
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun CommissioningScreen(
    viewModel: CommissioningViewModel,
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbarHostState = remember { SnackbarHostState() }

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
            SummarySection(drafts = uiState.drafts)
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
            HorizontalDivider()
            DraftEditorSection(
                draft = uiState.selectedDraft,
                onStepStatusChange = onStepStatusChange,
                onStepNoteChange = onStepNoteChange,
                onOverallCommentChange = onOverallCommentChange,
                onFirmwareVersionChange = onFirmwareVersionChange,
                onBootloaderVersionChange = onBootloaderVersionChange,
                onSaveOffline = onSaveOffline,
                onMarkReadyToSync = onMarkReadyToSync,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SummarySection(drafts: List<ServiceSessionDraft>) {
    val readyCount = drafts.count { draft -> draft.syncStatus == SessionSyncStatus.READY_TO_SYNC }
    val passCount = drafts.count { draft -> draft.outcome == SessionOutcome.PASS }
    val failCount = drafts.count { draft -> draft.outcome == SessionOutcome.FAIL }

    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Stan lokalnej kolejki commissioning", style = MaterialTheme.typography.titleMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AssistChip(onClick = {}, label = { Text("Drafty: ${drafts.size}") })
                AssistChip(onClick = {}, label = { Text("Gotowe do sync: $readyCount") })
                AssistChip(onClick = {}, label = { Text("PASS: $passCount") })
                AssistChip(onClick = {}, label = { Text("FAIL: $failCount") })
            }
            Text(
                "Ten etap zapisuje sesję commissioning lokalnie. Następny krok to zdjęcia, ZIP paczki i upload do /api/service-sessions/upload.",
                style = MaterialTheme.typography.bodyMedium,
            )
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
                label = { Text("Numer seryjny urządzenia") },
                singleLine = true,
            )
            OutlinedTextField(
                value = inputs.deviceType,
                onValueChange = onDeviceTypeChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Typ urządzenia") },
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
                Text("Utwórz draft offline")
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
                    "Brak lokalnych draftów. Utwórz pierwszą sesję commissioning powyżej.",
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
    onSaveOffline: () -> Unit,
    onMarkReadyToSync: () -> Unit,
) {
    if (draft == null) {
        Card {
            Text(
                "Wybierz draft, aby przejść przez checklistę commissioning i zapisać lokalną sesję.",
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
                    label = { Text("Komentarz ogólny") },
                    minLines = 3,
                )
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
                    "W tym MVP zapis lokalny obsługuje checklistę, komentarze i metadane sesji. Kolejny krok to ZIP paczki, zdjęcia i realny upload.",
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

private fun statusLabel(status: CommissioningStepStatus): String =
    when (status) {
        CommissioningStepStatus.TODO -> "TODO"
        CommissioningStepStatus.PASS -> "PASS"
        CommissioningStepStatus.FAIL -> "FAIL"
        CommissioningStepStatus.HOLD -> "HOLD"
    }
