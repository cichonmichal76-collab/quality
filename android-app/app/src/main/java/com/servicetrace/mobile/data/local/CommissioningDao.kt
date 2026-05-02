package com.servicetrace.mobile.data.local

import androidx.room.Dao
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Relation
import androidx.room.Transaction
import com.servicetrace.mobile.model.CommissioningStep
import com.servicetrace.mobile.model.CommissioningAttachment
import com.servicetrace.mobile.model.CommissioningAttachmentKind
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.McuConnectionMode
import com.servicetrace.mobile.model.McuConnectionStatus
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SyncAttemptHistoryEntry
import com.servicetrace.mobile.model.SyncAttemptResult
import com.servicetrace.mobile.model.SyncAttemptTriggerSource
import com.servicetrace.mobile.model.SessionSyncStatus
import com.servicetrace.mobile.model.SyncFailureReasonCode
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "service_session_drafts")
data class ServiceSessionDraftEntity(
    @PrimaryKey
    val sessionId: String,
    val deviceSerialNumber: String,
    val deviceType: String,
    val technicianId: String,
    val overallComment: String,
    val firmwareVersion: String,
    val bootloaderVersion: String,
    val connectionMode: String,
    val connectionStatus: String,
    val selectedUsbDeviceId: String,
    val selectedUsbDeviceLabel: String,
    val echoedSerialNumber: String,
    val mainboardStatus: String,
    val inductionBoardStatus: String,
    val hmiStatus: String,
    val watchdogStatus: String,
    val usbLinkStatus: String,
    val logExcerpt: String,
    val snapshotCapturedAtMillis: Long?,
    val packagePath: String,
    val packageGeneratedAtMillis: Long?,
    val packageEntryCount: Int,
    val syncStatus: String,
    val syncAttemptCount: Int,
    val lastSyncAttemptAtMillis: Long?,
    val lastSyncSuccessAtMillis: Long?,
    val lastSyncErrorMessage: String,
    val lastSyncFailureCode: String,
    val lastSyncAutoRetryEligible: Boolean,
    val createdAtMillis: Long,
    val updatedAtMillis: Long,
)

@Entity(
    tableName = "commissioning_steps",
    primaryKeys = ["sessionId", "stepCode"],
    indices = [Index("sessionId")],
    foreignKeys = [
        ForeignKey(
            entity = ServiceSessionDraftEntity::class,
            parentColumns = ["sessionId"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class CommissioningStepEntity(
    val sessionId: String,
    val stepCode: String,
    val title: String,
    val instructions: String,
    val status: String,
    val note: String,
    val stepOrder: Int,
)

@Entity(
    tableName = "commissioning_attachments",
    primaryKeys = ["sessionId", "attachmentId"],
    indices = [Index("sessionId")],
    foreignKeys = [
        ForeignKey(
            entity = ServiceSessionDraftEntity::class,
            parentColumns = ["sessionId"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class CommissioningAttachmentEntity(
    val sessionId: String,
    val attachmentId: String,
    val kind: String,
    val displayName: String,
    val localPath: String,
    val contentType: String,
    val sizeBytes: Long,
    val createdAtMillis: Long,
)

@Entity(
    tableName = "commissioning_sync_attempts",
    primaryKeys = ["sessionId", "attemptId"],
    indices = [Index("sessionId")],
    foreignKeys = [
        ForeignKey(
            entity = ServiceSessionDraftEntity::class,
            parentColumns = ["sessionId"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
)
data class CommissioningSyncAttemptEntity(
    val sessionId: String,
    val attemptId: String,
    val attemptedAtMillis: Long,
    val triggerSource: String,
    val result: String,
    val failureCode: String,
    val message: String,
    val retryable: Boolean,
    val attemptNumber: Int,
    val backendServiceSessionId: String,
    val backendUploadStatus: String,
    val backendPackageHash: String,
    val backendUploadCorrelationId: String,
    val backendUploadedAtIso: String,
)

data class ServiceSessionDraftWithSteps(
    @Embedded
    val session: ServiceSessionDraftEntity,
    @Relation(
        parentColumn = "sessionId",
        entityColumn = "sessionId",
    )
    val steps: List<CommissioningStepEntity>,
    @Relation(
        parentColumn = "sessionId",
        entityColumn = "sessionId",
    )
    val attachments: List<CommissioningAttachmentEntity>,
    @Relation(
        parentColumn = "sessionId",
        entityColumn = "sessionId",
    )
    val syncAttempts: List<CommissioningSyncAttemptEntity>,
)

data class LocalDraftBundle(
    val session: ServiceSessionDraftEntity,
    val steps: List<CommissioningStepEntity>,
    val attachments: List<CommissioningAttachmentEntity>,
    val syncAttempts: List<CommissioningSyncAttemptEntity>,
)

fun ServiceSessionDraftWithSteps.toDomain(): ServiceSessionDraft =
    ServiceSessionDraft(
        sessionId = session.sessionId,
        deviceSerialNumber = session.deviceSerialNumber,
        deviceType = session.deviceType,
        technicianId = session.technicianId,
        overallComment = session.overallComment,
        firmwareVersion = session.firmwareVersion,
        bootloaderVersion = session.bootloaderVersion,
        connectionMode = McuConnectionMode.valueOf(session.connectionMode),
        connectionStatus = McuConnectionStatus.valueOf(session.connectionStatus),
        selectedUsbDeviceId = session.selectedUsbDeviceId,
        selectedUsbDeviceLabel = session.selectedUsbDeviceLabel,
        echoedSerialNumber = session.echoedSerialNumber,
        mainboardStatus = session.mainboardStatus,
        inductionBoardStatus = session.inductionBoardStatus,
        hmiStatus = session.hmiStatus,
        watchdogStatus = session.watchdogStatus,
        usbLinkStatus = session.usbLinkStatus,
        logExcerpt = session.logExcerpt,
        snapshotCapturedAtMillis = session.snapshotCapturedAtMillis,
        packagePath = session.packagePath,
        packageGeneratedAtMillis = session.packageGeneratedAtMillis,
        packageEntryCount = session.packageEntryCount,
        syncStatus = SessionSyncStatus.valueOf(session.syncStatus),
        syncAttemptCount = session.syncAttemptCount,
        lastSyncAttemptAtMillis = session.lastSyncAttemptAtMillis,
        lastSyncSuccessAtMillis = session.lastSyncSuccessAtMillis,
        lastSyncErrorMessage = session.lastSyncErrorMessage,
        lastSyncFailureCode = SyncFailureReasonCode.valueOf(session.lastSyncFailureCode),
        lastSyncAutoRetryEligible = session.lastSyncAutoRetryEligible,
        createdAtMillis = session.createdAtMillis,
        updatedAtMillis = session.updatedAtMillis,
        attachments = attachments
            .sortedByDescending { row -> row.createdAtMillis }
            .map { row ->
                CommissioningAttachment(
                    attachmentId = row.attachmentId,
                    kind = CommissioningAttachmentKind.valueOf(row.kind),
                    displayName = row.displayName,
                    localPath = row.localPath,
                    contentType = row.contentType,
                    sizeBytes = row.sizeBytes,
                    createdAtMillis = row.createdAtMillis,
                )
            },
        steps = steps
            .sortedBy { row -> row.stepOrder }
            .map { row ->
                CommissioningStep(
                    stepCode = row.stepCode,
                    title = row.title,
                    instructions = row.instructions,
                    status = CommissioningStepStatus.valueOf(row.status),
                    note = row.note,
                    stepOrder = row.stepOrder,
                )
            },
        syncAttempts = syncAttempts
            .sortedByDescending { row -> row.attemptedAtMillis }
            .map { row ->
                SyncAttemptHistoryEntry(
                    attemptId = row.attemptId,
                    attemptedAtMillis = row.attemptedAtMillis,
                    triggerSource = SyncAttemptTriggerSource.valueOf(row.triggerSource),
                    result = SyncAttemptResult.valueOf(row.result),
                    failureCode = SyncFailureReasonCode.valueOf(row.failureCode),
                    message = row.message,
                    retryable = row.retryable,
                    attemptNumber = row.attemptNumber,
                    backendServiceSessionId = row.backendServiceSessionId.ifBlank { null },
                    backendUploadStatus = row.backendUploadStatus.ifBlank { null },
                    backendPackageHash = row.backendPackageHash.ifBlank { null },
                    backendUploadCorrelationId = row.backendUploadCorrelationId.ifBlank { null },
                    backendUploadedAtIso = row.backendUploadedAtIso.ifBlank { null },
                )
            },
    )

fun ServiceSessionDraft.toLocalEntity(): LocalDraftBundle =
    LocalDraftBundle(
        session = ServiceSessionDraftEntity(
            sessionId = sessionId,
            deviceSerialNumber = deviceSerialNumber,
            deviceType = deviceType,
            technicianId = technicianId,
            overallComment = overallComment,
            firmwareVersion = firmwareVersion,
            bootloaderVersion = bootloaderVersion,
            connectionMode = connectionMode.name,
            connectionStatus = connectionStatus.name,
            selectedUsbDeviceId = selectedUsbDeviceId,
            selectedUsbDeviceLabel = selectedUsbDeviceLabel,
            echoedSerialNumber = echoedSerialNumber,
            mainboardStatus = mainboardStatus,
            inductionBoardStatus = inductionBoardStatus,
            hmiStatus = hmiStatus,
            watchdogStatus = watchdogStatus,
            usbLinkStatus = usbLinkStatus,
            logExcerpt = logExcerpt,
            snapshotCapturedAtMillis = snapshotCapturedAtMillis,
            packagePath = packagePath,
            packageGeneratedAtMillis = packageGeneratedAtMillis,
            packageEntryCount = packageEntryCount,
            syncStatus = syncStatus.name,
            syncAttemptCount = syncAttemptCount,
            lastSyncAttemptAtMillis = lastSyncAttemptAtMillis,
            lastSyncSuccessAtMillis = lastSyncSuccessAtMillis,
            lastSyncErrorMessage = lastSyncErrorMessage,
            lastSyncFailureCode = lastSyncFailureCode.name,
            lastSyncAutoRetryEligible = lastSyncAutoRetryEligible,
            createdAtMillis = createdAtMillis,
            updatedAtMillis = updatedAtMillis,
        ),
        attachments = attachments.map { attachment ->
            CommissioningAttachmentEntity(
                sessionId = sessionId,
                attachmentId = attachment.attachmentId,
                kind = attachment.kind.name,
                displayName = attachment.displayName,
                localPath = attachment.localPath,
                contentType = attachment.contentType,
                sizeBytes = attachment.sizeBytes,
                createdAtMillis = attachment.createdAtMillis,
            )
        },
        syncAttempts = syncAttempts.map { attempt ->
            CommissioningSyncAttemptEntity(
                sessionId = sessionId,
                attemptId = attempt.attemptId,
                attemptedAtMillis = attempt.attemptedAtMillis,
                triggerSource = attempt.triggerSource.name,
                result = attempt.result.name,
                failureCode = attempt.failureCode.name,
                message = attempt.message,
                retryable = attempt.retryable,
                attemptNumber = attempt.attemptNumber,
                backendServiceSessionId = attempt.backendServiceSessionId.orEmpty(),
                backendUploadStatus = attempt.backendUploadStatus.orEmpty(),
                backendPackageHash = attempt.backendPackageHash.orEmpty(),
                backendUploadCorrelationId = attempt.backendUploadCorrelationId.orEmpty(),
                backendUploadedAtIso = attempt.backendUploadedAtIso.orEmpty(),
            )
        },
        steps = steps.map { step ->
            CommissioningStepEntity(
                sessionId = sessionId,
                stepCode = step.stepCode,
                title = step.title,
                instructions = step.instructions,
                status = step.status.name,
                note = step.note,
                stepOrder = step.stepOrder,
            )
        },
    )

@Dao
interface CommissioningDao {
    @Transaction
    @Query("SELECT * FROM service_session_drafts ORDER BY updatedAtMillis DESC")
    fun observeDrafts(): Flow<List<ServiceSessionDraftWithSteps>>

    @Transaction
    @Query("SELECT * FROM service_session_drafts ORDER BY updatedAtMillis DESC")
    suspend fun listDrafts(): List<ServiceSessionDraftWithSteps>

    @Transaction
    @Query("SELECT * FROM service_session_drafts WHERE sessionId = :sessionId LIMIT 1")
    suspend fun getDraft(sessionId: String): ServiceSessionDraftWithSteps?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSession(session: ServiceSessionDraftEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSteps(steps: List<CommissioningStepEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAttachments(attachments: List<CommissioningAttachmentEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSyncAttempts(syncAttempts: List<CommissioningSyncAttemptEntity>)

    @Query("DELETE FROM commissioning_steps WHERE sessionId = :sessionId")
    suspend fun deleteStepsForSession(sessionId: String)

    @Query("DELETE FROM commissioning_attachments WHERE sessionId = :sessionId")
    suspend fun deleteAttachmentsForSession(sessionId: String)

    @Query("DELETE FROM commissioning_sync_attempts WHERE sessionId = :sessionId")
    suspend fun deleteSyncAttemptsForSession(sessionId: String)

    @Transaction
    suspend fun upsertDraft(bundle: LocalDraftBundle) {
        upsertSession(bundle.session)
        deleteStepsForSession(bundle.session.sessionId)
        deleteAttachmentsForSession(bundle.session.sessionId)
        deleteSyncAttemptsForSession(bundle.session.sessionId)
        upsertSteps(bundle.steps)
        upsertAttachments(bundle.attachments)
        upsertSyncAttempts(bundle.syncAttempts)
    }
}
