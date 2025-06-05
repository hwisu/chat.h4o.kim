// Format utilities for terminal chat
// Token counting, model name formatting, and display helpers

// Format token count for display
export function formatTokenCount(tokens) {
    if (!tokens || tokens === 0) return '0';

    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
        return `${Math.round(tokens / 1000)}k`;
    } else {
        return tokens.toString();
    }
}

// Format context length for display
export function formatContextLength(contextLength) {
    if (!contextLength || contextLength === 0) return 'N/A';

    if (contextLength >= 1000000) {
        return `${(contextLength / 1000000).toFixed(1)}M`;
    } else if (contextLength >= 1000) {
        return `${Math.round(contextLength / 1000)}k`;
    } else {
        return contextLength.toString();
    }
}

// Shorten model name for display
export function shortenModelName(modelId) {
    if (!modelId || typeof modelId !== 'string') return modelId;

    let shortened = modelId;

    if (shortened.includes('/')) {
        const parts = shortened.split('/');
        if (parts.length >= 2) {
            const provider = parts[0];
            const model = parts.slice(1).join('/');

            let cleanModel = model
                .replace(/^(gpt-|claude-|llama-|gemini-|mistral-)/i, '')
                .replace(/-instruct$/i, '')
                .replace(/-chat$/i, '')
                .replace(/-turbo$/i, '');

            return `${provider}/${cleanModel}`;
        }
    }

    return shortened;
}

// Escape HTML to prevent XSS
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Generate consistent color for provider based on provider name
export function getProviderColor(modelId) {
    const provider = modelId.split('/')[0] || modelId;

    let hash = 0;
    for (let i = 0; i < provider.length; i++) {
        const char = provider.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    const r = Math.abs(hash) % 180 + 50;
    const g = Math.abs(hash >> 8) % 180 + 50;
    const b = Math.abs(hash >> 16) % 180 + 50;

    return `rgb(${r}, ${g}, ${b})`;
}

// Helper function to detect if content likely contains a code block
export function contentLikelyHasCodeBlock(content) {
    return content.includes('```') ||
           content.includes('    ') ||
           (content.includes('`') && !content.includes('```')) ||
           content.includes('[') && content.includes(']') ||
           content.includes('{') && content.includes('}') ||
           content.match(/\b(function|var|const|let|if|else|for|while|return|class|import|export)\b/);
}
