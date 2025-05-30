// Markdown parsing functionality
class MarkdownParser {
    constructor() {
        // Initialize marked with settings
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false
            });
        }
    }

    parse(content) {
        return typeof marked !== 'undefined' ? marked.parse(content) : content;
    }

    renderContent(content) {
        // Check if this is a model list response and apply coloring
        if (content.includes('Available Models') && content.includes(':free')) {
            return this.colorizeModelList(content);
        }
        return this.parse(content);
    }

    colorizeModelList(content) {
        const lines = content.split('\n');
        const processedLines = lines.map(line => {
            // Check if line contains a model name (has "/" and ends with ":free")
            if (line.includes('/') && line.includes(':free')) {
                const modelMatch = line.match(/^(.+?)\/(.+)$/);
                if (modelMatch) {
                    const provider = modelMatch[1];
                    const modelPart = modelMatch[2].replace(':free', '');
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
}
