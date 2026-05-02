package com.servicetrace.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.servicetrace.mobile.data.OfflineCommissioningRepository
import com.servicetrace.mobile.data.local.ServiceTraceMobileDatabase
import com.servicetrace.mobile.mcu.MockMcuClient
import com.servicetrace.mobile.mcu.UsbMcuClient
import com.servicetrace.mobile.ui.CommissioningScreen
import com.servicetrace.mobile.ui.CommissioningViewModel

class MainActivity : ComponentActivity() {
    private val viewModel: CommissioningViewModel by viewModels {
        CommissioningViewModel.factory(
            repository = OfflineCommissioningRepository(
                dao = ServiceTraceMobileDatabase.build(applicationContext).commissioningDao(),
            ),
            mockMcuClient = MockMcuClient(),
            usbMcuClient = UsbMcuClient(applicationContext),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme {
                Surface(color = MaterialTheme.colorScheme.background) {
                    CommissioningScreen(viewModel = viewModel)
                }
            }
        }
    }
}
