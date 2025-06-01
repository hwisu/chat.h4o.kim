// PWA functionality with iOS 18 compatibility (install prompt removed)
class PWAManager {
    constructor() {
        // iOS 18 compatibility detection
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isIOS18Plus = this.isIOS && this.getIOSVersion() >= 18;
        this.isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

        this.init();
    }

    // iOS version detection for compatibility
    getIOSVersion() {
        const match = navigator.userAgent.match(/OS (\d+)_(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    init() {
        this.registerServiceWorker();

        // iOS 18 specific PWA enhancements
        if (this.isIOS18Plus) {
            this.setupIOS18PWAFeatures();
        }
    }

    // iOS 18 specific PWA setup
    setupIOS18PWAFeatures() {
        // Enhanced standalone mode detection
        this.setupStandaloneModeHandling();

        // Improved app state management for iOS 18
        this.setupAppStateManagement();

        // Enhanced visual viewport handling in standalone mode
        if (this.isStandalone) {
            this.setupStandaloneViewport();
        }
    }

    setupStandaloneModeHandling() {
        // Listen for changes in display mode (iOS 18 improvement)
        if ('matchMedia' in window) {
            const standaloneQuery = window.matchMedia('(display-mode: standalone)');
            standaloneQuery.addEventListener('change', (e) => {
                this.isStandalone = e.matches;
                console.log('PWA display mode changed:', e.matches ? 'standalone' : 'browser');
            });
        }
    }

    setupAppStateManagement() {
        // Enhanced app lifecycle handling for iOS 18
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('PWA backgrounded');
            } else {
                console.log('PWA foregrounded');
                // Check for updates when app comes to foreground
                this.checkForUpdates();
            }
        });

        // Enhanced page freeze/resume handling (iOS 18)
        window.addEventListener('pagehide', (e) => {
            if (e.persisted) {
                console.log('PWA frozen');
            }
        });

        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                console.log('PWA resumed from freeze');
                this.checkForUpdates();
            }
        });
    }

    setupStandaloneViewport() {
        // iOS 18 viewport handling in standalone mode
        const updateViewport = () => {
            if (this.isStandalone && 'visualViewport' in window) {
                const vp = window.visualViewport;
                document.documentElement.style.setProperty('--vp-height', `${vp.height}px`);
                document.documentElement.style.setProperty('--vp-width', `${vp.width}px`);
            }
        };

        if ('visualViewport' in window) {
            window.visualViewport.addEventListener('resize', updateViewport);
            updateViewport();
        }
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('ServiceWorker registered successfully:', registration.scope);

                        // Enhanced update handling for iOS 18
                        this.setupServiceWorkerUpdates(registration);
                    })
                    .catch((error) => {
                        console.log('ServiceWorker registration failed:', error);
                    });

                // Enhanced service worker message handling
                this.setupServiceWorkerMessaging();
            });
        }
    }

    setupServiceWorkerUpdates(registration) {
        // Listen for updates with iOS 18 improvements
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('New version available, forcing refresh');

                        // Enhanced update notification for iOS 18
                        if (this.isIOS18Plus) {
                            this.showIOS18UpdateNotification();
                        } else {
                            window.location.reload();
                        }
                    }
                });
            }
        });

        // Periodic update check for iOS 18
        if (this.isIOS18Plus) {
            setInterval(() => {
                this.checkForUpdates();
            }, 60000); // Check every minute
        }
    }

    setupServiceWorkerMessaging() {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'FORCE_UPDATE') {
                console.log('Force update requested by service worker, version:', event.data.version);

                if (this.isIOS18Plus) {
                    this.showIOS18UpdateNotification(event.data.version);
                } else {
                    this.showUpdateNotification(event.data.version);
                }
            }

            // Handle other message types for iOS 18
            if (event.data && event.data.type === 'CACHE_UPDATED') {
                console.log('Cache updated successfully');
            }
        });
    }

    checkForUpdates() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.getRegistration().then((registration) => {
                if (registration) {
                    registration.update();
                }
            });
        }
    }

    showIOS18UpdateNotification(version) {
        // Enhanced update notification for iOS 18
        const updateDiv = document.createElement('div');
        updateDiv.innerHTML = `
            <div style="
                position: fixed;
                top: max(20px, env(safe-area-inset-top));
                right: 20px;
                background: #1a1a1a;
                border: 1px solid #00ff00;
                color: #00ff00;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 12px;
                z-index: 10000;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                animation: slideInFromRight 0.3s ease-out;
                max-width: calc(100vw - 40px);
                word-wrap: break-word;
            ">
                🔄 새 버전 적용 중... ${version ? `(${version})` : ''}
                <br><small>곧 자동으로 새로고침됩니다</small>
            </div>
        `;
        document.body.appendChild(updateDiv);

        // Progressive delay for iOS 18 stability
        setTimeout(() => {
            updateDiv.style.opacity = '0.8';
        }, 1000);

        setTimeout(() => {
            updateDiv.style.opacity = '0.6';
        }, 2000);

        // Auto-reload after 3 seconds for iOS 18
        setTimeout(() => {
            if (this.isStandalone) {
                // Force reload in standalone mode
                window.location.reload(true);
            } else {
                window.location.reload();
            }
        }, 3000);
    }

    showUpdateNotification(version) {
        const updateDiv = document.createElement('div');
        updateDiv.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: #1a1a1a;
                border: 1px solid #00ff00;
                color: #00ff00;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 12px;
                z-index: 10000;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                animation: slideInFromRight 0.3s ease-out;
            ">
                🔄 새 버전 적용 중... (${version})
            </div>
        `;
        document.body.appendChild(updateDiv);

        // Auto-reload after 2 seconds
        setTimeout(() => {
            window.location.reload(true);
        }, 2000);
    }
}

// Initialize PWA when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PWAManager();
});
