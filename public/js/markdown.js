// Markdown parsing functionality
export class MarkdownParser {
    constructor() {
        this.hljsReady = false;
        this.markedReady = false;

        this.initializeWhenReady();
    }

    async initializeWhenReady() {
        let attempts = 0;
        const maxAttempts = 50;

        while (attempts < maxAttempts) {
            if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
                this.setupLibraries();
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            this.setupFallback();
        }
    }

    setupLibraries() {
        this.markedReady = true;
        this.hljsReady = true;

        if (typeof marked !== 'undefined') {
            const renderer = new marked.Renderer();

            renderer.code = (code, language) => {
                const codeId = 'code-' + Math.random().toString(36).substr(2, 9);

                if (this.hljsReady && typeof hljs !== 'undefined') {
                    try {
                        let highlighted;
                        if (language && hljs.getLanguage && hljs.getLanguage(language)) {
                            highlighted = hljs.highlight(code, { language }).value;
                        } else {
                            const result = hljs.highlightAuto(code);
                            highlighted = result.value;
                        }
                        return `<div class="code-container">
                            <button class="copy-button" onclick="copyCodeToClipboard('${codeId}')">copy</button>
                            <pre class="code-block"><code id="${codeId}" class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>
                        </div>`;
                    } catch (err) {
                    }
                }

                return `<div class="code-container">
                    <button class="copy-button" onclick="copyCodeToClipboard('${codeId}')">copy</button>
                    <pre class="code-block"><code id="${codeId}">${this.escapeHtml(code)}</code></pre>
                </div>`;
            };

            renderer.codespan = (code) => {
                return `<code class="inline-code">${this.escapeHtml(code)}</code>`;
            };

            renderer.listitem = (text) => {
                return `<li>${text}</li>`;
            };

            renderer.list = (body, ordered, start) => {
                const type = ordered ? 'ol' : 'ul';
                const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
                const className = ordered ? 'md-ordered-list' : '';
                return `<${type}${startAttr} class="md-list ${className}">${body}</${type}>`;
            };

            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false,
                renderer: renderer
            });
        }

        if (typeof hljs !== 'undefined') {
            hljs.configure({
                ignoreUnescapedHTML: true,
                classPrefix: 'hljs-'
            });
        }
    }

    setupFallback() {
        this.markedReady = false;
        this.hljsReady = false;
    }

    parse(content) {
        if (typeof marked !== 'undefined') {
            const parsed = marked.parse(content);

            if (typeof hljs !== 'undefined') {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = parsed;

                const codeBlocks = tempDiv.querySelectorAll('pre code:not(.hljs)');

                codeBlocks.forEach((block) => {
                    try {
                        hljs.highlightElement(block);
                    } catch (err) {
                    }
                });

                this.fixOrderedLists(tempDiv);

                return tempDiv.innerHTML;
            }

            return parsed;
        } else {
            return this.escapeHtml(content);
        }
    }

    colorizeModelList(content) {
        const lines = content.split('\n');
        const processedLines = lines.map(line => {
            if (line.includes('/') && line.includes(':free')) {
                const modelMatch = line.match(/^(.+?)\/(.+)$/);
                if (modelMatch) {
                    const provider = modelMatch[1];
                    const modelPart = modelMatch[2].replace(':free', '');
                    const providerColor = this.stringToColor(provider);

                    const star = (provider === 'meta-llama' || provider === 'google') ? ' ✱' : '';

                    return `<span style="color: ${providerColor}; font-weight: 500;">${this.escapeHtml(provider)}</span>/${this.escapeHtml(modelPart)}${star}`;
                }
            }
            return this.escapeHtml(line);
        });

        return processedLines.join('\n');
    }

    stringToColor(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }

        const hue = Math.abs(hash) % 360;
        const saturation = 60 + (Math.abs(hash) % 30);
        const lightness = 45 + (Math.abs(hash) % 20);

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderContent(content) {
        if (content.includes('Available Models') && content.includes(':free')) {
            return this.colorizeModelList(content);
        } else {
            return this.parse(content);
        }
    }

    fixOrderedLists(element) {
        const orderedLists = element.querySelectorAll('ol');

        orderedLists.forEach(ol => {
            let currentIndex = 1;
            const startAttr = ol.getAttribute('start');
            if (startAttr) {
                currentIndex = parseInt(startAttr);
            }

            const listItems = ol.querySelectorAll('li');
            listItems.forEach(li => {
                li.style.counterIncrement = `list-counter-${currentIndex}`;
                currentIndex++;
            });
        });
    }
}

// Global utility functions for code copying (needed for onclick handlers in rendered HTML)
export function copyCodeToClipboard(codeId) {
    const codeElement = document.getElementById(codeId);
    if (codeElement) {
        const text = codeElement.textContent;
        navigator.clipboard.writeText(text).then(() => {
            const container = codeElement.closest('.code-container');
            const copyBtn = container?.querySelector('.copy-button');
            if (copyBtn) {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'copied!';
                copyBtn.classList.add('copied');
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.classList.remove('copied');
                }, 2000);
            }
        }).catch(err => {
        });
    }
}

// Function to copy entire response
export function copyEntireResponse(responseId) {
    const responseElement = document.getElementById(responseId);
    if (responseElement) {
        const text = responseElement.textContent;
        navigator.clipboard.writeText(text).then(() => {
        }).catch(err => {
        });
    }
}

// Make functions globally available for onclick handlers
if (typeof window !== 'undefined') {
    window.copyCodeToClipboard = copyCodeToClipboard;
    window.copyEntireResponse = copyEntireResponse;
}
