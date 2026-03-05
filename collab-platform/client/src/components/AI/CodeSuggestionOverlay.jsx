// CodeSuggestionOverlay.js
// This module registers an inline completions provider for Monaco Editor
// to show ghost-text style suggestions like GitHub Copilot.

import axios from 'axios';

let debounceTimer = null;
let disposable = null;

/**
 * Registers the AI autocomplete provider on a Monaco editor instance.
 * Call this in the editor's onMount callback.
 *
 * @param {object} editor - Monaco editor instance
 * @param {object} monaco - Monaco namespace
 * @param {Function} getLanguage - Function returning current language string
 * @returns {Function} cleanup/dispose function
 */
export function registerAIAutocomplete(editor, monaco, getLanguage) {
    // Dispose previous provider if any
    if (disposable) {
        disposable.dispose();
        disposable = null;
    }

    disposable = monaco.languages.registerInlineCompletionsProvider('*', {
        provideInlineCompletions: async (model, position, context, token) => {
            // Don't trigger if user just accepted a suggestion or during selection
            if (context.triggerKind === monaco.languages.InlineCompletionTriggerKind.Explicit) {
                return { items: [] };
            }

            // Get the content up to cursor (last 50 lines for context)
            const startLine = Math.max(1, position.lineNumber - 50);
            const range = new monaco.Range(startLine, 1, position.lineNumber, position.column);
            const codeContext = model.getValueInRange(range);

            // Don't trigger on empty lines or very short context
            if (codeContext.trim().length < 10) {
                return { items: [] };
            }

            // Debounce: wait 500ms after last keystroke
            return new Promise((resolve) => {
                if (debounceTimer) clearTimeout(debounceTimer);

                debounceTimer = setTimeout(async () => {
                    // Check if cancelled
                    if (token.isCancellationRequested) {
                        resolve({ items: [] });
                        return;
                    }

                    try {
                        const lang = typeof getLanguage === 'function' ? getLanguage() : 'javascript';

                        const response = await axios.post('/api/ai/autocomplete', {
                            context: codeContext,
                            language: lang,
                            cursorPosition: model.getOffsetAt(position)
                        });

                        const completion = response.data?.completion;

                        if (!completion || completion.trim().length === 0 || token.isCancellationRequested) {
                            resolve({ items: [] });
                            return;
                        }

                        resolve({
                            items: [{
                                insertText: completion,
                                range: new monaco.Range(
                                    position.lineNumber,
                                    position.column,
                                    position.lineNumber,
                                    position.column
                                )
                            }]
                        });
                    } catch (err) {
                        // Silently fail - autocomplete is non-critical
                        console.debug('AI autocomplete error:', err.message);
                        resolve({ items: [] });
                    }
                }, 500);
            });
        },

        freeInlineCompletions: () => {
            // Cleanup
        }
    });

    return () => {
        if (disposable) {
            disposable.dispose();
            disposable = null;
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    };
}
