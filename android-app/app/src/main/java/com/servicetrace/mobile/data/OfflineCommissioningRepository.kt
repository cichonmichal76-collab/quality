package com.servicetrace.mobile.data

import com.servicetrace.mobile.data.local.CommissioningDao
import com.servicetrace.mobile.data.local.toDomain
import com.servicetrace.mobile.data.local.toLocalEntity
import com.servicetrace.mobile.model.CommissioningDraftFactory
import com.servicetrace.mobile.model.ServiceSessionDraft
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class OfflineCommissioningRepository(
    private val dao: CommissioningDao,
) : CommissioningRepository {
    override fun observeDrafts(): Flow<List<ServiceSessionDraft>> =
        dao.observeDrafts().map { rows -> rows.map { row -> row.toDomain() } }

    override suspend fun getDraft(sessionId: String): ServiceSessionDraft? =
        dao.getDraft(sessionId)?.toDomain()

    override suspend fun listDrafts(): List<ServiceSessionDraft> =
        dao.listDrafts().map { row -> row.toDomain() }

    override suspend fun createDraft(
        deviceSerialNumber: String,
        deviceType: String,
        technicianId: String,
    ): ServiceSessionDraft {
        val draft = CommissioningDraftFactory.create(
            deviceSerialNumber = deviceSerialNumber,
            deviceType = deviceType,
            technicianId = technicianId,
        )
        saveDraft(draft)
        return draft
    }

    override suspend fun saveDraft(draft: ServiceSessionDraft) {
        dao.upsertDraft(draft.toLocalEntity())
    }
}
