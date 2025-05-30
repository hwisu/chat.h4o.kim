// PWA functionality
class PWAManager {
    constructor() {
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

        this.init();
    }

    init() {
        this.registerServiceWorker();
        this.setupAppStateManagement();
    }

    setupAppStateManagement() {
        // App lifecycle handling
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkForUpdates();
            }
        });

        // Handle page freeze/resume
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                this.checkForUpdates();
            }
        });
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('ServiceWorker registered successfully:', registration.scope);
                        this.setupServiceWorkerUpdates(registration);
                    })
                    .catch((error) => {
                        console.log('ServiceWorker registration failed:', error);
                    });

                this.setupServiceWorkerMessaging();
            });
        }
    }

    setupServiceWorkerUpdates(registration) {
        // Listen for updates
        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('New version available, forcing refresh');
                        this.showUpdateNotification();
                    }
                });
            }
        });
    }

    setupServiceWorkerMessaging() {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'FORCE_UPDATE') {
                console.log('Force update requested by service worker, version:', event.data.version);
                this.showUpdateNotification(event.data.version);
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
                max-width: calc(100vw - 40px);
                word-wrap: break-word;
            ">
                🔄 새 버전 적용 중...${version ? ` (${version})` : ''}
                <br><small>곧 자동으로 새로고침됩니다</small>
            </div>
        `;
        document.body.appendChild(updateDiv);

        // Auto-reload after 2 seconds
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    }
}

// Initialize PWA when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PWAManager();
});
