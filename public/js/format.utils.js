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

    // Remove common prefixes and make it more readable
    let shortened = modelId;

    // Handle provider/model format
    if (shortened.includes('/')) {
        const parts = shortened.split('/');
        if (parts.length >= 2) {
            const provider = parts[0];
            const model = parts.slice(1).join('/');

            // Common model name cleanups
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

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < provider.length; i++) {
        const char = provider.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    // Convert hash to RGB values with good contrast
    const r = Math.abs(hash) % 180 + 50; // 50-229 range for better visibility
    const g = Math.abs(hash >> 8) % 180 + 50;
    const b = Math.abs(hash >> 16) % 180 + 50;

    return `rgb(${r}, ${g}, ${b})`;
}

// Helper function to detect if content likely contains a code block
export function contentLikelyHasCodeBlock(content) {
    // Check for markdown code block syntax (```), or indented code blocks, or inline code (`)
    return content.includes('```') ||
           content.includes('    ') || // 4 spaces for indented code
           (content.includes('`') && !content.includes('```')) ||
           // Check for likely array/object notations
           content.includes('[') && content.includes(']') ||
           content.includes('{') && content.includes('}') ||
           // Check for common programming language keywords
           content.match(/\b(function|var|const|let|if|else|for|while|return|class|import|export)\b/);
}
