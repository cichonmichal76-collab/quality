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
import com.servicetrace.mobile.model.CommissioningStepStatus
import com.servicetrace.mobile.model.ServiceSessionDraft
import com.servicetrace.mobile.model.SessionSyncStatus
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
    val syncStatus: String,
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

data class ServiceSessionDraftWithSteps(
    @Embedded
    val session: ServiceSessionDraftEntity,
    @Relation(
        parentColumn = "sessionId",
        entityColumn = "sessionId",
    )
    val steps: List<CommissioningStepEntity>,
)

data class LocalDraftBundle(
    val session: ServiceSessionDraftEntity,
    val steps: List<CommissioningStepEntity>,
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
        syncStatus = SessionSyncStatus.valueOf(session.syncStatus),
        createdAtMillis = session.createdAtMillis,
        updatedAtMillis = session.updatedAtMillis,
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
            syncStatus = syncStatus.name,
            createdAtMillis = createdAtMillis,
            updatedAtMillis = updatedAtMillis,
        ),
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
    @Query("SELECT * FROM service_session_drafts WHERE sessionId = :sessionId LIMIT 1")
    suspend fun getDraft(sessionId: String): ServiceSessionDraftWithSteps?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSession(session: ServiceSessionDraftEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSteps(steps: List<CommissioningStepEntity>)

    @Query("DELETE FROM commissioning_steps WHERE sessionId = :sessionId")
    suspend fun deleteStepsForSession(sessionId: String)

    @Transaction
    suspend fun upsertDraft(bundle: LocalDraftBundle) {
        upsertSession(bundle.session)
        deleteStepsForSession(bundle.session.sessionId)
        upsertSteps(bundle.steps)
    }
}
