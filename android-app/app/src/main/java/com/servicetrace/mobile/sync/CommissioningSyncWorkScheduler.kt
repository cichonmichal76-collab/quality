package com.servicetrace.mobile.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

interface CommissioningSyncWorkScheduler {
    fun enqueueDeferredSync()

    fun cancelDeferredSync()
}

class AndroidWorkManagerCommissioningSyncScheduler(
    context: Context,
) : CommissioningSyncWorkScheduler {
    private val workManager = WorkManager.getInstance(context.applicationContext)

    override fun enqueueDeferredSync() {
        workManager.enqueueUniqueWork(
            DEFERRED_COMMISSIONING_SYNC_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            buildDeferredCommissioningSyncWorkRequest(),
        )
    }

    override fun cancelDeferredSync() {
        workManager.cancelUniqueWork(DEFERRED_COMMISSIONING_SYNC_WORK_NAME)
    }
}

internal fun buildDeferredCommissioningSyncWorkRequest(): OneTimeWorkRequest =
    OneTimeWorkRequestBuilder<CommissioningSyncWorker>()
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build(),
        )
        .setBackoffCriteria(
            BackoffPolicy.EXPONENTIAL,
            30,
            TimeUnit.SECONDS,
        )
        .addTag(DEFERRED_COMMISSIONING_SYNC_WORK_NAME)
        .build()

internal const val DEFERRED_COMMISSIONING_SYNC_WORK_NAME = "commissioning_deferred_sync"
