package com.servicetrace.mobile.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.servicetrace.mobile.data.OfflineCommissioningRepository
import com.servicetrace.mobile.data.local.ServiceTraceMobileDatabase
import com.servicetrace.mobile.files.CommissioningArtifactStore
import com.servicetrace.mobile.model.SyncAttemptTriggerSource

class CommissioningSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val syncSettingsStore = AndroidSharedPreferencesSyncSettingsStore(applicationContext)
        val syncSettings = syncSettingsStore.current()
        if (!syncSettings.autoSyncEnabled) {
            return Result.success()
        }

        val repository = OfflineCommissioningRepository(
            dao = ServiceTraceMobileDatabase.build(applicationContext).commissioningDao(),
        )
        val readyDrafts = repository.listDrafts().filter(::shouldAutoRetrySync)
        if (readyDrafts.isEmpty()) {
            return Result.success()
        }

        val runner = CommissioningSyncRunner(
            repository = repository,
            artifactStore = CommissioningArtifactStore(applicationContext),
            uploader = ServiceSessionUploader(),
        )
        val result = runner.syncDrafts(
            baseUrl = syncSettings.uploadBaseUrl,
            drafts = readyDrafts,
            triggerSource = SyncAttemptTriggerSource.DEFERRED_WORKER,
        )
        return if (result.retryableFailedCount > 0) {
            Result.retry()
        } else {
            Result.success()
        }
    }
}
