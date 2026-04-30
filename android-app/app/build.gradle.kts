plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.servicetrace.mobile"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.servicetrace.mobile"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}

dependencies {
    // Tu docelowo trafią Compose, Room, Retrofit, WorkManager i USB Host API helpers.
}

