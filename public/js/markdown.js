// Markdown parsing functionality
export class MarkdownParser {
    constructor() {
        this.hljsReady = false;
        this.markedReady = false;

        // Wait for libraries to load
        this.initializeWhenReady();
    }

    async initializeWhenReady() {
        // Wait for libraries to be available
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait

        while (attempts < maxAttempts) {
            if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
                this.setupLibraries();
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            // Fallback without libraries
            this.setupFallback();
        }
    }

    setupLibraries() {
        this.markedReady = true;
        this.hljsReady = true;

        // Initialize marked if available
        if (typeof marked !== 'undefined') {
            // Configure marked with custom renderer for code highlighting
            const renderer = new marked.Renderer();

            // Custom code block renderer with syntax highlighting
            renderer.code = (code, language) => {
                // Generate unique ID for each code block
                const codeId = 'code-' + Math.random().toString(36).substr(2, 9);

                if (this.hljsReady && typeof hljs !== 'undefined') {
                    try {
                        let highlighted;
                        if (language && hljs.getLanguage && hljs.getLanguage(language)) {
                            // Try to highlight with specified language
                            highlighted = hljs.highlight(code, { language }).value;
                        } else {
                            // Auto-detect language
                            const result = hljs.highlightAuto(code);
                            highlighted = result.value;
                        }
                        return `<div class="code-container">
                            <button class="copy-button" onclick="copyCodeToClipboard('${codeId}')">copy</button>
                            <pre class="code-block"><code id="${codeId}" class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre>
                        </div>`;
                    } catch (err) {
                        // Silent fallback on error
                    }
                }

                // Fallback without highlighting
                return `<div class="code-container">
                    <button class="copy-button" onclick="copyCodeToClipboard('${codeId}')">copy</button>
                    <pre class="code-block"><code id="${codeId}">${this.escapeHtml(code)}</code></pre>
                </div>`;
            };

            // Custom inline code renderer
            renderer.codespan = (code) => {
                return `<code class="inline-code">${this.escapeHtml(code)}</code>`;
            };

            // Fix for ordered lists - ensure proper numbering for nested lists and large numbers
            renderer.listitem = (text) => {
                return `<li>${text}</li>`;
            };

            // Custom ordered list renderer to fix numbering issues
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

        // Initialize highlight.js if available
        if (typeof hljs !== 'undefined') {
            hljs.configure({
                ignoreUnescapedHTML: true,
                classPrefix: 'hljs-'
            });
            console.log('✅ Highlight.js configured successfully');
            console.log('📋 Available languages:', hljs.listLanguages().slice(0, 10).join(', '), '...');
        }
    }

    setupFallback() {
        this.markedReady = false;
        this.hljsReady = false;
    }

    parse(content) {
        if (typeof marked !== 'undefined') {
            const parsed = marked.parse(content);

            // Apply syntax highlighting to any code blocks that weren't caught by the renderer
            if (typeof hljs !== 'undefined') {
                // Create a temporary div to work with the parsed HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = parsed;

                // Find and highlight any remaining code blocks
                const codeBlocks = tempDiv.querySelectorAll('pre code:not(.hljs)');

                codeBlocks.forEach((block) => {
                    try {
                        hljs.highlightElement(block);
                    } catch (err) {
                        // Silent fallback on error
                    }
                });

                // Fix any nested ordered lists and numbering
                this.fixOrderedLists(tempDiv);

                return tempDiv.innerHTML;
            }

            return parsed;
        } else {
            // Fallback to basic parsing if marked is not available
            return this.escapeHtml(content);
        }
    }

    colorizeModelList(content) {
        // Split content into lines and process each line
        const lines = content.split('\n');
        const processedLines = lines.map(line => {
            // Check if line contains a model name (has "/" and ends with ":free")
            if (line.includes('/') && line.includes(':free')) {
                const modelMatch = line.match(/^(.+?)\/(.+)$/);
                if (modelMatch) {
                    const provider = modelMatch[1];
                    const modelPart = modelMatch[2].replace(':free', ''); // Remove :free
                    const providerColor = this.stringToColor(provider);

                    // Add star for meta and google models
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

        // Generate a pleasant color with good contrast
        const hue = Math.abs(hash) % 360;
        const saturation = 60 + (Math.abs(hash) % 30); // 60-90%
        const lightness = 45 + (Math.abs(hash) % 20); // 45-65%

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderContent(content) {
        // Check if this is a model list response and apply coloring
        if (content.includes('Available Models') && content.includes(':free')) {
            return this.colorizeModelList(content);
        } else {
            return this.parse(content);
        }
    }

    fixOrderedLists(element) {
        // Fix numbering for ordered lists
        const orderedLists = element.querySelectorAll('ol');

        orderedLists.forEach(ol => {
            let currentIndex = 1;
            const startAttr = ol.getAttribute('start');
            if (startAttr) {
                currentIndex = parseInt(startAttr);
            }

            const listItems = ol.querySelectorAll('li');
            listItems.forEach(li => {
                // Use CSS counter for consistent numbering
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
            // Visual feedback
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
            console.error('Failed to copy code:', err);
        });
    }
}

// Function to copy entire response
export function copyEntireResponse(responseId) {
    const responseElement = document.getElementById(responseId);
    if (responseElement) {
        const text = responseElement.textContent;
        navigator.clipboard.writeText(text).then(() => {
            console.log('Response copied to clipboard');
            // Could add visual feedback here if needed
        }).catch(err => {
            console.error('Failed to copy response:', err);
        });
    }
}

// Make functions globally available for onclick handlers
if (typeof window !== 'undefined') {
    window.copyCodeToClipboard = copyCodeToClipboard;
    window.copyEntireResponse = copyEntireResponse;
}
