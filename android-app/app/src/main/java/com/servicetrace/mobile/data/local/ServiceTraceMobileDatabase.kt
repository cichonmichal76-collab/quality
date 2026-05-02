package com.servicetrace.mobile.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        ServiceSessionDraftEntity::class,
        CommissioningStepEntity::class,
        CommissioningAttachmentEntity::class,
        CommissioningSyncAttemptEntity::class,
    ],
    version = 11,
    exportSchema = false,
)
abstract class ServiceTraceMobileDatabase : RoomDatabase() {
    abstract fun commissioningDao(): CommissioningDao

    companion object {
        @Volatile
        private var instance: ServiceTraceMobileDatabase? = null

        fun build(context: Context): ServiceTraceMobileDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    ServiceTraceMobileDatabase::class.java,
                    "service_trace_mobile.db",
                ).fallbackToDestructiveMigration()
                    .build()
                    .also { database ->
                    instance = database
                }
            }
    }
}
