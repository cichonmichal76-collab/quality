package com.servicetrace.mobile.sync

import com.servicetrace.mobile.data.CommissioningRepository
import com.servicetrace.mobile.files.CommissioningArtifactStore
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.model.SyncFailureReasonCode
import java.io.File

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
    ): CommissioningSyncRunResult {
        var uploadedCount = 0
        var failedCount = 0
        var retryableFailedCount = 0
        val latestDraftsBySessionId = linkedMapOf<String, ServiceSessionDraft>()

        drafts.distinctBy { draft -> draft.sessionId }.forEach { draft ->
            try {
                val uploadDraft = ensurePackageForUpload(draft)
                uploader.upload(baseUrl, uploadDraft)
                val completedAtMillis = System.currentTimeMillis()
                val syncedDraft = uploadDraft.copy(
                    syncStatus = SessionSyncStatus.SYNCED,
                    syncAttemptCount = uploadDraft.syncAttemptCount + 1,
                    lastSyncAttemptAtMillis = completedAtMillis,
                    lastSyncSuccessAtMillis = completedAtMillis,
                    lastSyncErrorMessage = "",
                    lastSyncFailureCode = SyncFailureReasonCode.NONE,
                    lastSyncAutoRetryEligible = true,
                    updatedAtMillis = completedAtMillis,
                )
                repository.saveDraft(syncedDraft)
                latestDraftsBySessionId[syncedDraft.sessionId] = syncedDraft
                uploadedCount += 1
            } catch (error: Exception) {
                val uploadError = classifyTransportUploadException(error)
                val failedAtMillis = System.currentTimeMillis()
                val nextAttemptCount = draft.syncAttemptCount + 1
                val autoRetryEligible = uploadError.isRetryable && nextAttemptCount < MAX_AUTO_SYNC_RETRY_ATTEMPTS
                val failedDraft = draft.copy(
                    syncStatus = SessionSyncStatus.READY_TO_SYNC,
                    syncAttemptCount = nextAttemptCount,
                    lastSyncAttemptAtMillis = failedAtMillis,
                    lastSyncErrorMessage = uploadError.message ?: "Nieznany blad synchronizacji commissioning.",
                    lastSyncFailureCode = uploadError.reasonCode,
                    lastSyncAutoRetryEligible = autoRetryEligible,
                    updatedAtMillis = failedAtMillis,
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
