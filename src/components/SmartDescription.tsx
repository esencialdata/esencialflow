import React, { useMemo } from 'react';

interface ParsedDescription {
    score: number | null;
    variables: { label: string; value: string }[];
    context: string;
    raw: string;
}

const parseDescription = (desc: string): ParsedDescription => {
    const result: ParsedDescription = { score: null, variables: [], context: desc, raw: desc };
    if (!desc) return result;

    // Match "Score calculado: XX.X"
    const scoreMatch = desc.match(/Score\s+calculado:\s*([\d.]+)/i);
    if (scoreMatch) result.score = parseFloat(scoreMatch[1]);

    // Match "Variables: Fin=[X], Lev=[X], Urg=[X], Vit=[X]"
    const varsMatch = desc.match(/Variables?:\s*(.+?)(?:\.\s*Contexto|$)/i);
    if (varsMatch) {
        const pairs = varsMatch[1].match(/(\w+)=\[([^\]]+)\]/g);
        if (pairs) {
            result.variables = pairs.map(p => {
                const m = p.match(/(\w+)=\[([^\]]+)\]/);
                return m ? { label: m[1], value: m[2] } : { label: '', value: '' };
            }).filter(v => v.label);
        }
    }

    // Extract context text (after "Contexto:")
    const ctxMatch = desc.match(/Contexto:\s*(.+)/i);
    if (ctxMatch) {
        result.context = ctxMatch[1].trim();
    } else if (scoreMatch) {
        // If there's a score but no "Contexto:" label, remove the score/variables part
        result.context = desc
            .replace(/Score\s+calculado:\s*[\d.]+\.?\s*/i, '')
            .replace(/Variables?:\s*.+?(?:\.\s*|$)/i, '')
            .trim();
    }

    // If context is empty or same as raw, use raw
    if (!result.context || result.context.length < 3) {
        result.context = desc;
    }

    return result;
};

const VARIABLE_LABELS: Record<string, string> = {
    Fin: '💰 Financiero',
    Lev: '🔗 Apalancamiento',
    Urg: '⚡ Urgencia',
    Vit: '❤️ Vital',
};

const getScoreColor = (score: number): string => {
    if (score > 90) return '#ef4444'; // red - high
    if (score > 75) return '#f59e0b'; // amber - medium
    if (score > 50) return '#3b82f6'; // blue - low
    return '#64748b'; // slate - backlog
};

interface SmartDescriptionProps {
    description: string;
    compact?: boolean; // For FocusView (just context + small score badge)
    maxLength?: number;
}

const SmartDescription: React.FC<SmartDescriptionProps> = ({
    description,
    compact = false,
    maxLength,
}) => {
    const parsed = useMemo(() => parseDescription(description), [description]);
    const hasMetadata = parsed.score !== null || parsed.variables.length > 0;

    // If no score pattern found, just show plain text
    if (!hasMetadata) {
        const text = maxLength && description.length > maxLength
            ? description.substring(0, maxLength) + '...'
            : description;
        return <span>{text}</span>;
    }

    // Compact mode: just the context with a small score pill
    if (compact) {
        const ctx = maxLength && parsed.context.length > maxLength
            ? parsed.context.substring(0, maxLength) + '...'
            : parsed.context;

        return (
            <span style={{ display: 'inline' }}>
                {parsed.score !== null && (
                    <span style={{
                        display: 'inline-block',
                        background: getScoreColor(parsed.score),
                        color: '#fff',
                        borderRadius: '10px',
                        padding: '1px 8px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        marginRight: '8px',
                        verticalAlign: 'middle',
                    }}>
                        {Math.round(parsed.score)}
                    </span>
                )}
                {ctx}
            </span>
        );
    }

    // Full mode: context + expandable score breakdown
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Context text */}
            <p style={{ margin: 0, lineHeight: 1.6, opacity: 0.9 }}>
                {parsed.context}
            </p>

            {/* Score + Variables breakdown */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                alignItems: 'center',
            }}>
                {parsed.score !== null && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        border: `1px solid ${getScoreColor(parsed.score)}33`,
                    }}>
                        <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Score</span>
                        <span style={{
                            fontWeight: 700,
                            fontSize: '1.1rem',
                            color: getScoreColor(parsed.score),
                        }}>
                            {Math.round(parsed.score)}
                        </span>
                    </div>
                )}

                {parsed.variables.map((v) => (
                    <div key={v.label} style={{
                        background: 'rgba(255,255,255,0.04)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                        <span style={{ opacity: 0.5 }}>
                            {VARIABLE_LABELS[v.label] || v.label}
                        </span>
                        <span style={{ fontWeight: 600 }}>{v.value.split(' ')[0]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SmartDescription;
