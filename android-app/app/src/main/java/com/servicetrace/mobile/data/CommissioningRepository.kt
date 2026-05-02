package com.servicetrace.mobile.data

import com.servicetrace.mobile.model.ServiceSessionDraft
import kotlinx.coroutines.flow.Flow

interface CommissioningRepository {
    fun observeDrafts(): Flow<List<ServiceSessionDraft>>

    suspend fun getDraft(sessionId: String): ServiceSessionDraft?

    suspend fun createDraft(
        deviceSerialNumber: String,
        deviceType: String,
        technicianId: String,
    ): ServiceSessionDraft

    suspend fun saveDraft(draft: ServiceSessionDraft)
}
