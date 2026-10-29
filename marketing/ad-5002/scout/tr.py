import json, sys
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[1], device='cpu', compute_type='int8')
import soundfile as sf
aud, _ = sf.read(sys.argv[2], dtype='float32')
segs, info = m.transcribe(aud, language='ar', word_timestamps=True, vad_filter=False, beam_size=5, initial_prompt='تطبيق وجيز للتوصيل. الكابتن. آب ستور، بلاي ستور. حساب أكاونت. عائلة وجيز، أسرة وجيز. بكل أريحية. براحتك.')
out = []
for s in segs:
    out.append({'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip(), 'words': [[round(w.start, 2), round(w.end, 2), w.word] for w in s.words]})
    print(f"{s.start:6.2f}-{s.end:6.2f} {s.text.strip()}", flush=True)
json.dump(out, open(sys.argv[3], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
