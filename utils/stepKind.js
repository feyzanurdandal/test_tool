// Adım türü güvenlik ağı: çevirmen (yapay zeka) bazen bir ETKİLEŞİM adımını ("pop up varsa kapat") "extract" (yalnızca OKU) olarak
// üretir. Extract hiçbir şeye tıklamaz/yazmaz; adım "başarılı" görünür ama eylem yapılmaz. Burada, talimatı bir eylem fiili içeren ve
// değer OKUMA/döndürme anlamı taşımayan extract adımları act olarak çalıştırılır. Dar tutulmuştur: okuma fiili varsa extract kalır.

const strip = (s) => String(s || '').toLowerCase().replace(/["“”„'][^"“”„']*["“”„']/g, ' ');   // tırnak içi etiket/değerler karara girmez
const ACTION = /\b(close|dismiss|click|tap|press|open|type|enter|fill|select|choose|pick|check|uncheck|tick|toggle|submit|accept|confirm|hover|scroll|expand|collapse)\b/;
const READ = /\b(return|read|get|extract|retrieve|copy|capture|report|tell|what|which|list|count|verify|determine)\b|check\s+(that|whether|if)\b/;

/** Adımın GERÇEKTE çalıştırılacağı tür: 'act' | 'extract' | diğerleri (recorded/form) değişmeden. */
export function effectiveStepType(step) {
    const type = step?.type;
    if (type !== 'extract') return type;
    const text = strip(step.instruction);
    if (ACTION.test(text) && !READ.test(text)) return 'act';
    return 'extract';
}
