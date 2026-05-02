package com.servicetrace.mobile.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

interface ConnectivityMonitor {
    val isOnline: Flow<Boolean>

    fun currentStatus(): Boolean
}

class AndroidConnectivityMonitor(
    context: Context,
) : ConnectivityMonitor {
    private val appContext = context.applicationContext
    private val connectivityManager = appContext.getSystemService(ConnectivityManager::class.java)

    override val isOnline: Flow<Boolean> =
        callbackFlow {
            val manager = connectivityManager
            if (manager == null) {
                trySend(false)
                close()
                return@callbackFlow
            }

            val callback = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    trySend(currentStatus())
                }

                override fun onLost(network: Network) {
                    trySend(currentStatus())
                }

                override fun onCapabilitiesChanged(
                    network: Network,
                    networkCapabilities: NetworkCapabilities,
                ) {
                    trySend(currentStatus())
                }
            }

            val request = NetworkRequest.Builder().build()
            trySend(currentStatus())
            manager.registerNetworkCallback(request, callback)

            awaitClose {
                runCatching {
                    manager.unregisterNetworkCallback(callback)
                }
            }
        }.distinctUntilChanged()

    override fun currentStatus(): Boolean {
        val manager = connectivityManager ?: return false
        val activeNetwork = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ||
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
