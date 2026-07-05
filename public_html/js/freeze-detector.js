// js/freeze-detector.js
// Inject this script early in your HTML head to monitor Native Bridge deadlocks

(function() {
    console.log('🛡️ Wajeez Freeze Detector Initialized');

    let isWatchdogReady = false;

    function setupWatchdog() {
        if (isWatchdogReady) return;

        // Check if Capacitor is available yet
        if (!window.Capacitor || !window.Capacitor.Plugins) {
            setTimeout(setupWatchdog, 100);
            return;
        }

        const pluginsToWatch = ['GoogleMap', 'CapacitorGoogleMaps'];

        pluginsToWatch.forEach(pluginName => {
            const plugin = window.Capacitor.Plugins[pluginName];
            if (!plugin) return;

            console.log(`🛡️ Attaching watchdog to Capacitor Plugin: [${pluginName}]`);

            // Iterate over all exported methods of the plugin
            Object.keys(plugin).forEach(methodName => {
                const originalMethod = plugin[methodName];

                if (typeof originalMethod !== 'function') return;

                // Override the native method
                plugin[methodName] = function(...args) {
                    const callId = Math.random().toString(36).substring(2, 6).toUpperCase();
                    console.log(`▶️ [NATIVE CALL START] ${pluginName}.${methodName} [${callId}]`, args);

                    const startTime = Date.now();
                    
                    // Set a 5-second watchdog timer
                    // If the native bridge is deadlocked, the promise will never resolve and this timer will fire.
                    const freezeWarningTimer = setTimeout(() => {
                        console.error(`\n🚨🚨🚨 NATIVE FREEZE DETECTED! 🚨🚨🚨\n` +
                                      `Plugin: ${pluginName}\n` +
                                      `Method: ${methodName}\n` +
                                      `Duration: > 5000ms\n` +
                                      `Status: The native bridge has stopped responding to this call.\n` +
                                      `🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨🚨\n`);
                        
                        // We also show a Swal alert if available, so the user knows exactly what broke
                        if (window.Swal) {
                            window.Swal.fire({
                                icon: 'error',
                                title: 'Native Freeze Detected',
                                text: `The app froze while calling ${pluginName}.${methodName}. Check console details.`,
                                timer: 5000
                            });
                        }
                    }, 5000);

                    try {
                        const result = originalMethod.apply(this, args);
                        
                        // Capacitor plugin methods always return Promises
                        if (result && typeof result.then === 'function') {
                            return result.then(res => {
                                clearTimeout(freezeWarningTimer);
                                console.log(`✅ [NATIVE CALL SUCCESS] ${pluginName}.${methodName} [${callId}] took ${Date.now() - startTime}ms`, res);
                                return res;
                            }).catch(err => {
                                clearTimeout(freezeWarningTimer);
                                console.error(`❌ [NATIVE CALL ERROR] ${pluginName}.${methodName} [${callId}] took ${Date.now() - startTime}ms`, err);
                                throw err; // Re-throw so the app handles it
                            });
                        } else {
                            // Synchronous return
                            clearTimeout(freezeWarningTimer);
                            console.log(`✅ [NATIVE CALL SYNC SUCCESS] ${pluginName}.${methodName} [${callId}] took ${Date.now() - startTime}ms`, result);
                            return result;
                        }
                    } catch (e) {
                        clearTimeout(freezeWarningTimer);
                        console.error(`❌ [NATIVE CALL SYNC ERROR] ${pluginName}.${methodName} [${callId}]`, e);
                        throw e;
                    }
                };
            });
        });

        isWatchdogReady = true;
    }

    // Start polling to attach the watchdog as soon as Capacitor loads
    setupWatchdog();
})();
