export default {
    expo: {
        name: "Adventure Map",
        slug: "adventure-map",
        scheme: "adventure-map",
        version: "1.0.0",
        orientation: "portrait",
        icon: "./assets/icon.png",
        userInterfaceStyle: "light",
        splash: {
            image: "./assets/splash-icon.png",
            resizeMode: "contain",
            backgroundColor: "#ffffff",
        },
        plugins: [
            [
                "expo-location",
                {
                    locationAlwaysAndWhenInUsePermission: "Adventure Map uses your location to track where you have explored.",
                    locationWhenInUsePermission: "Adventure Map uses your location to track where you have explored.",
                    isAndroidBackgroundLocationEnabled: true,
                    isAndroidForegroundServiceEnabled: true,
                }
            ],
            "@rnmapbox/maps",
            "expo-sqlite",
            "expo-task-manager",
            "expo-secure-store",
            "expo-web-browser",
        ],
        ios: {
            supportsTablet: true,
            infoPlist: {
                NSLocationWhenInUseUsageDescription: "Adventure Map uses your location to track where you have explored.",
                NSLocationAlwaysUsageDescription: "Adventure Map uses your location to track where you have explored in the background.",
            },
        },
        android: {
            package: "com.robrich02.adventuremap",
            adaptiveIcon: {
                backgroundColor: "#E6F4FE",
                foregroundImage: "./assets/android-icon-foreground.png",
                backgroundImage: "./assets/android-icon-background.png",
                monochromeImage: "./assets/android-icon-monochrome.png",
            },
            predictiveBackGestureEnabled: false,
            permissions: [
                "ACCESS_FINE_LOCATION",
                "ACCESS_COARSE_LOCATION",
                "ACCESS_BACKGROUND_LOCATION",
                "FOREGROUND_SERVICE",
                "FOREGROUND_SERVICE_LOCATION",
                "RECEIVE_BOOT_COMPLETED",
            ],
        },
        web: {
            favicon: "./assets/favicon.png",
        },
        extra: {
            eas: {
               projectId: "e7690a44-dbaa-4609-8d46-fd9896dba810", 
            },
        },
    },
};