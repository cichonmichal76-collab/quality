package com.servicetrace.mobile.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.servicetrace.mobile.data.OfflineCommissioningRepository
import com.servicetrace.mobile.data.local.ServiceTraceMobileDatabase
import com.servicetrace.mobile.files.CommissioningArtifactStore
import com.servicetrace.mobile.model.SessionSyncStatus

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
        val readyDrafts = repository.listDrafts().filter { draft ->
            draft.syncStatus == SessionSyncStatus.READY_TO_SYNC
        }
        if (readyDrafts.isEmpty()) {
            return Result.success()
        }

        val runner = CommissioningSyncRunner(
            repository = repository,
            artifactStore = CommissioningArtifactStore(applicationContext),
            uploader = ServiceSessionUploader(),
        )
        runner.syncDrafts(
            baseUrl = syncSettings.uploadBaseUrl,
            drafts = readyDrafts,
        )
        return Result.success()
    }
}
