package com.servicetrace.mobile.sync

import com.servicetrace.mobile.data.CommissioningRepository
import com.servicetrace.mobile.files.CommissioningArtifactStore
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SyncAttemptHistoryEntry
import com.servicetrace.mobile.model.SyncAttemptResult
import com.servicetrace.mobile.model.SyncAttemptTriggerSource
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.model.SyncFailureReasonCode
import java.io.File
import java.util.UUID

data class CommissioningSyncRunResult(
    val uploadedCount: Int,
    val failedCount: Int,
    val retryableFailedCount: Int,
    val latestDraftsBySessionId: Map<String, ServiceSessionDraft>,
)

const val MAX_AUTO_SYNC_RETRY_ATTEMPTS = 3

fun shouldAutoRetrySync(
    draft: ServiceSessionDraft,
): Boolean =
    draft.syncStatus == SessionSyncStatus.READY_TO_SYNC &&
        (draft.lastSyncErrorMessage.isBlank() || draft.lastSyncAutoRetryEligible)

class CommissioningSyncRunner(
    private val repository: CommissioningRepository,
    private val artifactStore: CommissioningArtifactStore,
    private val uploader: ServiceSessionUploader,
) {
    suspend fun syncDrafts(
        baseUrl: String,
        drafts: List<ServiceSessionDraft>,
        triggerSource: SyncAttemptTriggerSource,
    ): CommissioningSyncRunResult {
        var uploadedCount = 0
        var failedCount = 0
        var retryableFailedCount = 0
        val latestDraftsBySessionId = linkedMapOf<String, ServiceSessionDraft>()

        drafts.distinctBy { draft -> draft.sessionId }.forEach { draft ->
            var workingDraft = draft
            val attemptNumber = draft.syncAttemptCount + 1
            val attemptId = generateSyncAttemptId()
            try {
                workingDraft = ensurePackageForUpload(draft)
                val uploadResponse = uploader.upload(
                    baseUrl = baseUrl,
                    draft = workingDraft,
                    attemptMetadata = SyncUploadAttemptMetadata(
                        attemptId = attemptId,
                        attemptNumber = attemptNumber,
                        triggerSource = triggerSource,
                    ),
                )
                val completedAtMillis = System.currentTimeMillis()
                val syncedDraft = workingDraft.copy(
                    syncStatus = SessionSyncStatus.SYNCED,
                    syncAttemptCount = attemptNumber,
                    lastSyncAttemptAtMillis = completedAtMillis,
                    lastSyncSuccessAtMillis = completedAtMillis,
                    lastSyncErrorMessage = "",
                    lastSyncFailureCode = SyncFailureReasonCode.NONE,
                    lastSyncAutoRetryEligible = true,
                    updatedAtMillis = completedAtMillis,
                    syncAttempts = listOf(
                        createSyncAttemptHistoryEntry(
                            attemptId = attemptId,
                            attemptedAtMillis = completedAtMillis,
                            triggerSource = triggerSource,
                            result = SyncAttemptResult.SUCCESS,
                            failureCode = SyncFailureReasonCode.NONE,
                            message = "Synchronizacja commissioning zakonczona sukcesem.",
                            retryable = false,
                            attemptNumber = attemptNumber,
                            backendServiceSessionId = uploadResponse.backendServiceSessionId,
                            backendUploadStatus = uploadResponse.uploadStatus,
                            backendUploadCount = uploadResponse.uploadCount,
                            backendPackageHash = uploadResponse.packageHash,
                            backendUploadCorrelationId = uploadResponse.uploadCorrelationId,
                            backendUploadedAtIso = uploadResponse.uploadedAtIso,
                        ),
                    ) + workingDraft.syncAttempts,
                )
                repository.saveDraft(syncedDraft)
                latestDraftsBySessionId[syncedDraft.sessionId] = syncedDraft
                uploadedCount += 1
            } catch (error: Exception) {
                val uploadError = classifyTransportUploadException(error)
                val failedAtMillis = System.currentTimeMillis()
                val autoRetryEligible = uploadError.isRetryable && attemptNumber < MAX_AUTO_SYNC_RETRY_ATTEMPTS
                val failedDraft = workingDraft.copy(
                    syncStatus = SessionSyncStatus.READY_TO_SYNC,
                    syncAttemptCount = attemptNumber,
                    lastSyncAttemptAtMillis = failedAtMillis,
                    lastSyncErrorMessage = uploadError.message ?: "Nieznany blad synchronizacji commissioning.",
                    lastSyncFailureCode = uploadError.reasonCode,
                    lastSyncAutoRetryEligible = autoRetryEligible,
                    updatedAtMillis = failedAtMillis,
                    syncAttempts = listOf(
                        createSyncAttemptHistoryEntry(
                            attemptId = attemptId,
                            attemptedAtMillis = failedAtMillis,
                            triggerSource = triggerSource,
                            result = SyncAttemptResult.FAILURE,
                            failureCode = uploadError.reasonCode,
                            message = uploadError.message ?: "Nieznany blad synchronizacji commissioning.",
                            retryable = uploadError.isRetryable,
                            attemptNumber = attemptNumber,
                            backendServiceSessionId = null,
                            backendUploadStatus = null,
                            backendUploadCount = null,
                            backendPackageHash = null,
                            backendUploadCorrelationId = null,
                            backendUploadedAtIso = null,
                        ),
                    ) + workingDraft.syncAttempts,
                )
                repository.saveDraft(failedDraft)
                latestDraftsBySessionId[failedDraft.sessionId] = failedDraft
                failedCount += 1
                if (uploadError.isRetryable) {
                    retryableFailedCount += 1
                }
            }
        }

        return CommissioningSyncRunResult(
            uploadedCount = uploadedCount,
            failedCount = failedCount,
            retryableFailedCount = retryableFailedCount,
            latestDraftsBySessionId = latestDraftsBySessionId.toMap(),
        )
    }

    private suspend fun ensurePackageForUpload(
        draft: ServiceSessionDraft,
    ): ServiceSessionDraft {
        if (draft.packagePath.isNotBlank() && File(draft.packagePath).exists()) {
            return draft
        }
        val packageResult = artifactStore.buildPackage(draft)
        val updatedDraft = draft.copy(
            packagePath = packageResult.zipPath,
            packageGeneratedAtMillis = packageResult.generatedAtMillis,
            packageEntryCount = packageResult.entryCount,
            updatedAtMillis = packageResult.generatedAtMillis,
        )
        repository.saveDraft(updatedDraft)
        return updatedDraft
    }
}

private fun createSyncAttemptHistoryEntry(
    attemptId: String,
    attemptedAtMillis: Long,
    triggerSource: SyncAttemptTriggerSource,
    result: SyncAttemptResult,
    failureCode: SyncFailureReasonCode,
    message: String,
    retryable: Boolean,
    attemptNumber: Int,
    backendServiceSessionId: String?,
    backendUploadStatus: String?,
    backendUploadCount: Int?,
    backendPackageHash: String?,
    backendUploadCorrelationId: String?,
    backendUploadedAtIso: String?,
): SyncAttemptHistoryEntry =
    SyncAttemptHistoryEntry(
        attemptId = attemptId,
        attemptedAtMillis = attemptedAtMillis,
        triggerSource = triggerSource,
        result = result,
        failureCode = failureCode,
        message = message,
        retryable = retryable,
        attemptNumber = attemptNumber,
        backendServiceSessionId = backendServiceSessionId,
        backendUploadStatus = backendUploadStatus,
        backendUploadCount = backendUploadCount,
        backendPackageHash = backendPackageHash,
        backendUploadCorrelationId = backendUploadCorrelationId,
        backendUploadedAtIso = backendUploadedAtIso,
    )

private fun generateSyncAttemptId(): String =
    "SYNC-${UUID.randomUUID().toString().take(8).uppercase()}"
